import { Server as HttpServer } from 'http';
import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { sessionManager } from './SessionManager.js';
import { WsClientEvents, WsServerEvents, WsMessage } from './events.js';
import { groupService } from '../services/GroupService.js';
import { cartService } from '../services/CartService.js';
import { orderService } from '../services/OrderService.js';

export function setupWebSocketServer(httpServer: HttpServer): WSServer {
  const wss = new WSServer({
    server: httpServer,
    path: '/ws',
  });

  console.log('WebSocket Server initialized on path /ws');

  // Heartbeat interval to detect stale/dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      const info = sessionManager.getClientInfo(ws);
      if (!info) {
        // Socket never joined a session or failed auth
        return;
      }

      if (!info.isAlive) {
        console.log(`[WS] Terminating inactive socket for participant ${info.participantId}`);
        ws.terminate();
        return;
      }

      info.isAlive = false;
      try {
        ws.ping();
      } catch (_) {
        ws.terminate();
      }
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log(`[WS] Client connected from ${req.socket.remoteAddress}`);

    ws.on('pong', () => {
      const info = sessionManager.getClientInfo(ws);
      if (info) {
        info.isAlive = true;
      }
    });

    ws.on('message', async (rawData: string | Buffer) => {
      try {
        const text = rawData.toString();
        let message: WsMessage;
        try {
          message = JSON.parse(text);
        } catch (_) {
          sessionManager.sendTo(ws, {
            type: WsServerEvents.ERROR,
            message: 'Invalid JSON payload',
          });
          return;
        }

        const info = sessionManager.getClientInfo(ws);
        if (info) {
          info.isAlive = true;
        }

        switch (message.type) {
          case WsClientEvents.PING: {
            sessionManager.sendTo(ws, { type: WsServerEvents.PONG });
            break;
          }

          case WsClientEvents.JOIN_SESSION: {
            const { sessionId, participantId } = message;
            if (!sessionId || !participantId) {
              sessionManager.sendTo(ws, {
                type: WsServerEvents.ERROR,
                message: 'Missing sessionId or participantId in JOIN_SESSION',
              });
              return;
            }

            // Register in SessionManager room
            sessionManager.addClient(sessionId, participantId, ws);

            // Mark participant as online in DB
            await groupService.updateParticipantPresence(participantId, true);

            // Fetch current authoritative session state
            const state = await groupService.getSessionState(sessionId);

            // Send authoritative state to the newly joined client
            sessionManager.sendTo(ws, {
              type: WsServerEvents.SESSION_STATE,
              data: state,
            });

            // Broadcast presence update to everyone else in this group
            sessionManager.broadcast(
              sessionId,
              {
                type: WsServerEvents.PARTICIPANT_STATUS_CHANGED,
                data: {
                  participantId,
                  isOnline: true,
                  participants: state.participants,
                  allReady: state.session.allReady,
                },
              },
              ws // exclude the joined client who already got full SESSION_STATE
            );

            console.log(`[WS] Participant ${participantId} joined session ${sessionId}`);
            break;
          }

          case WsClientEvents.REQUEST_SYNC: {
            const currentInfo = sessionManager.getClientInfo(ws);
            const sessionId = message.sessionId || currentInfo?.sessionId;
            if (!sessionId) {
              sessionManager.sendTo(ws, {
                type: WsServerEvents.ERROR,
                message: 'No active session to sync',
              });
              return;
            }

            const state = await groupService.getSessionState(sessionId);
            sessionManager.sendTo(ws, {
              type: WsServerEvents.SESSION_STATE,
              data: state,
            });
            break;
          }

          case WsClientEvents.CART_ADD: {
            const currentInfo = sessionManager.getClientInfo(ws);
            const sessionId = message.sessionId || currentInfo?.sessionId;
            const participantId = message.participantId || currentInfo?.participantId;
            const { productId, quantity } = message;

            if (!sessionId || !participantId || !productId) {
              sessionManager.sendTo(ws, {
                type: WsServerEvents.ERROR,
                message: 'Missing sessionId, participantId, or productId',
              });
              return;
            }

            const result = await cartService.addItem(
              sessionId,
              participantId,
              productId,
              quantity || 1
            );

            // Broadcast authoritative cart state to all session participants
            sessionManager.broadcast(sessionId, {
              type: WsServerEvents.CART_UPDATED,
              data: {
                cartItems: result.cartItems,
                totalCartAmount: result.totalCartAmount,
                version: result.version,
              },
            });

            // Broadcast real-time stock update to all session participants
            sessionManager.broadcast(sessionId, {
              type: WsServerEvents.INVENTORY_UPDATED,
              data: result.inventory,
            });
            break;
          }

          case WsClientEvents.CART_UPDATE: {
            const currentInfo = sessionManager.getClientInfo(ws);
            const sessionId = message.sessionId || currentInfo?.sessionId;
            const participantId = message.participantId || currentInfo?.participantId;
            const { cartItemId, quantity } = message;

            if (!sessionId || !participantId || !cartItemId || quantity === undefined) {
              sessionManager.sendTo(ws, {
                type: WsServerEvents.ERROR,
                message: 'Missing required fields for CART_UPDATE',
              });
              return;
            }

            const result = await cartService.updateQuantity(
              sessionId,
              participantId,
              cartItemId,
              quantity
            );

            sessionManager.broadcast(sessionId, {
              type: WsServerEvents.CART_UPDATED,
              data: {
                cartItems: result.cartItems,
                totalCartAmount: result.totalCartAmount,
                version: result.version,
              },
            });

            sessionManager.broadcast(sessionId, {
              type: WsServerEvents.INVENTORY_UPDATED,
              data: result.inventory,
            });
            break;
          }

          case WsClientEvents.CART_REMOVE: {
            const currentInfo = sessionManager.getClientInfo(ws);
            const sessionId = message.sessionId || currentInfo?.sessionId;
            const participantId = message.participantId || currentInfo?.participantId;
            const { cartItemId } = message;

            if (!sessionId || !participantId || !cartItemId) {
              sessionManager.sendTo(ws, {
                type: WsServerEvents.ERROR,
                message: 'Missing required fields for CART_REMOVE',
              });
              return;
            }

            const result = await cartService.removeItem(sessionId, participantId, cartItemId);

            sessionManager.broadcast(sessionId, {
              type: WsServerEvents.CART_UPDATED,
              data: {
                cartItems: result.cartItems,
                totalCartAmount: result.totalCartAmount,
                version: result.version,
              },
            });

            sessionManager.broadcast(sessionId, {
              type: WsServerEvents.INVENTORY_UPDATED,
              data: result.inventory,
            });
            break;
          }

          case WsClientEvents.TOGGLE_READY: {
            const currentInfo = sessionManager.getClientInfo(ws);
            const sessionId = message.sessionId || currentInfo?.sessionId;
            const participantId = message.participantId || currentInfo?.participantId;

            if (!sessionId || !participantId) {
              sessionManager.sendTo(ws, {
                type: WsServerEvents.ERROR,
                message: 'Missing sessionId or participantId for TOGGLE_READY',
              });
              return;
            }

            const result = await groupService.toggleReady(sessionId, participantId);

            sessionManager.broadcast(sessionId, {
              type: WsServerEvents.PARTICIPANT_STATUS_CHANGED,
              data: {
                participantId: result.participantId,
                isReady: result.isReady,
                allReady: result.allReady,
                participants: result.participants,
              },
            });
            break;
          }

          case WsClientEvents.PLACE_ORDER: {
            const currentInfo = sessionManager.getClientInfo(ws);
            const sessionId = message.sessionId || currentInfo?.sessionId;
            const participantId = message.participantId || currentInfo?.participantId;

            if (!sessionId || !participantId) {
              sessionManager.sendTo(ws, {
                type: WsServerEvents.ERROR,
                message: 'Missing sessionId or participantId for PLACE_ORDER',
              });
              return;
            }

            const orderResult = await orderService.placeGroupOrder(sessionId, participantId);

            sessionManager.broadcast(sessionId, {
              type: WsServerEvents.ORDER_PLACED,
              data: orderResult,
            });
            break;
          }

          case WsClientEvents.LEAVE_SESSION: {
            const currentInfo = sessionManager.getClientInfo(ws);
            const sessionId = message.sessionId || currentInfo?.sessionId;
            const participantId = message.participantId || currentInfo?.participantId;

            if (!sessionId || !participantId) {
              sessionManager.sendTo(ws, {
                type: WsServerEvents.ERROR,
                message: 'Missing sessionId or participantId for LEAVE_SESSION',
              });
              return;
            }

            const leaveResult = await groupService.leaveGroup(sessionId, participantId);

            if (leaveResult.sessionClosed) {
              sessionManager.broadcast(sessionId, {
                type: WsServerEvents.SESSION_CLOSED,
                data: {
                  sessionId,
                  reason: `Host (${leaveResult.hostDisplayName}) has left the session. The group session is now closed.`,
                  hostDisplayName: leaveResult.hostDisplayName,
                },
              });

              if (leaveResult.restoredInventories) {
                for (const inv of leaveResult.restoredInventories) {
                  sessionManager.broadcast(sessionId, {
                    type: WsServerEvents.INVENTORY_UPDATED,
                    data: inv,
                  });
                }
              }
            } else {
              try {
                const state = await groupService.getSessionState(sessionId);
                sessionManager.broadcast(sessionId, {
                  type: WsServerEvents.PARTICIPANT_STATUS_CHANGED,
                  data: {
                    participantId,
                    isOnline: false,
                    participants: state.participants,
                    allReady: state.session.allReady,
                  },
                });
              } catch (_) {}
            }
            break;
          }

          default: {
            console.log(`[WS] Unhandled message type: ${message.type}`);
            break;
          }
        }
      } catch (error: any) {
        console.error('[WS] Error processing message:', error);
        sessionManager.sendTo(ws, {
          type: WsServerEvents.ERROR,
          message: error?.message || 'Failed to process request',
        });
      }
    });

    ws.on('close', async () => {
      const info = sessionManager.removeClient(ws);
      if (info) {
        console.log(`[WS] Participant ${info.participantId} disconnected from session ${info.sessionId}`);

        try {
          const leaveResult = await groupService.leaveGroup(info.sessionId, info.participantId);

          if (leaveResult.sessionClosed) {
            sessionManager.broadcast(info.sessionId, {
              type: WsServerEvents.SESSION_CLOSED,
              data: {
                sessionId: info.sessionId,
                reason: `Host (${leaveResult.hostDisplayName}) has left the session. The group session is now closed.`,
                hostDisplayName: leaveResult.hostDisplayName,
              },
            });

            if (leaveResult.restoredInventories) {
              for (const inv of leaveResult.restoredInventories) {
                sessionManager.broadcast(info.sessionId, {
                  type: WsServerEvents.INVENTORY_UPDATED,
                  data: inv,
                });
              }
            }
          } else {
            const state = await groupService.getSessionState(info.sessionId);
            sessionManager.broadcast(info.sessionId, {
              type: WsServerEvents.PARTICIPANT_STATUS_CHANGED,
              data: {
                participantId: info.participantId,
                isOnline: false,
                participants: state.participants,
                allReady: state.session.allReady,
              },
            });
          }
        } catch (_) {
          // Session may have completed or been removed
        }
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Socket error:', err);
    });
  });

  return wss;
}
