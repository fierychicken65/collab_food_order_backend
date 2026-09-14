export const WsClientEvents = {
  JOIN_SESSION: 'JOIN_SESSION',
  PING: 'PING',
  REQUEST_SYNC: 'REQUEST_SYNC',
  CART_ADD: 'CART_ADD',
  CART_UPDATE: 'CART_UPDATE',
  CART_REMOVE: 'CART_REMOVE',
  TOGGLE_READY: 'TOGGLE_READY',
  PLACE_ORDER: 'PLACE_ORDER',
} as const;

export const WsServerEvents = {
  SESSION_STATE: 'SESSION_STATE',
  PARTICIPANT_JOINED: 'PARTICIPANT_JOINED',
  PARTICIPANT_LEFT: 'PARTICIPANT_LEFT',
  PARTICIPANT_STATUS_CHANGED: 'PARTICIPANT_STATUS_CHANGED',
  CART_UPDATED: 'CART_UPDATED',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  ORDER_PLACED: 'ORDER_PLACED',
  PONG: 'PONG',
  ERROR: 'ERROR',
} as const;

export type WsClientEventType = (typeof WsClientEvents)[keyof typeof WsClientEvents];
export type WsServerEventType = (typeof WsServerEvents)[keyof typeof WsServerEvents];

export interface WsMessage<T = any> {
  type: string;
  data?: T;
  sessionId?: string;
  participantId?: string;
  [key: string]: any;
}
