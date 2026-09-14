import { WebSocket } from 'ws';

export interface ClientConnectionInfo {
  sessionId: string;
  participantId: string;
  isAlive: boolean;
}

export class SessionManager {
  private clients = new Map<WebSocket, ClientConnectionInfo>();
  private sessionRooms = new Map<string, Set<WebSocket>>();

  /**
   * Registers a client connection to a group session room.
   */
  addClient(sessionId: string, participantId: string, ws: WebSocket): void {
    // If socket was previously registered in another room, remove it first
    this.removeClient(ws);

    this.clients.set(ws, {
      sessionId,
      participantId,
      isAlive: true,
    });

    if (!this.sessionRooms.has(sessionId)) {
      this.sessionRooms.set(sessionId, new Set());
    }
    this.sessionRooms.get(sessionId)!.add(ws);
  }

  /**
   * Removes a client connection and cleans up empty rooms.
   */
  removeClient(ws: WebSocket): ClientConnectionInfo | null {
    const info = this.clients.get(ws);
    if (!info) return null;

    this.clients.delete(ws);

    const room = this.sessionRooms.get(info.sessionId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        this.sessionRooms.delete(info.sessionId);
      }
    }

    return info;
  }

  /**
   * Gets connection info for a specific socket.
   */
  getClientInfo(ws: WebSocket): ClientConnectionInfo | undefined {
    return this.clients.get(ws);
  }

  /**
   * Broadcasts a JSON message to all clients in a specific session room.
   */
  broadcast(sessionId: string, message: any, excludeWs?: WebSocket): void {
    const room = this.sessionRooms.get(sessionId);
    if (!room) return;

    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    for (const client of room) {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (err) {
          console.error('[SessionManager] Failed to send message to client:', err);
        }
      }
    }
  }

  /**
   * Sends a JSON message to a single client socket.
   */
  sendTo(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        ws.send(payload);
      } catch (err) {
        console.error('[SessionManager] Failed to send direct message:', err);
      }
    }
  }

  /**
   * Returns count of active sockets in a session.
   */
  getActiveClientCount(sessionId: string): number {
    return this.sessionRooms.get(sessionId)?.size ?? 0;
  }
}

export const sessionManager = new SessionManager();
