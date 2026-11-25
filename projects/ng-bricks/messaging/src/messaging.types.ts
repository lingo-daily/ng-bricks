import type { DestroyRef } from '@angular/core';

/**
 * Data sent along with a message: a plain object. Posting copies it with the structured clone
 * algorithm (`postMessage`), so its values must be structured-cloneable (no functions, DOM nodes or
 * class behaviour; class instances arrive as plain objects).
 */
export type MessagePayload = Record<string, unknown>;

/** Name of the `BroadcastChannel` used to reach the app's other tabs. */
export type MessageChannelName = 'LDPK';

/**
 * Called for every received message the subscription listens to. `event` is the raw event, so
 * subscribers to third-party messages can check `event.origin` or `event.source`.
 */
export type MessageCallback = (
  message: string,
  payload: MessagePayload | undefined,
  event: MessageEvent,
) => void;

/**
 * Turns received message data into `[message, payload]`, or returns `undefined` to ignore it.
 * Use it to subscribe to third-party messages that have their own shape, e.g. `{ type, data }`.
 */
export type MessageTypeResolver = (data: unknown) => [string, MessagePayload?] | undefined;

export interface SubscribeOptions {
  /** Broadcast channel to listen to for messages from other tabs. Defaults to `'LDPK'`. */
  channel?: MessageChannelName;
  /** Normalizes received data. Defaults to {@link defaultTypeResolver}. */
  typeResolver?: MessageTypeResolver;
  /**
   * Also deliver window messages posted from other origins (cross-origin iframes, the opener,
   * popups). Defaults to `false`. When enabled, check `event.origin` in the callback.
   */
  acceptForeignOrigins?: boolean;
  /**
   * Unsubscribes when it is destroyed. Defaults to the caller's `DestroyRef` when
   * `subscribeToMessages` is called in an injection context (e.g. a component constructor).
   */
  destroyRef?: DestroyRef;
}

/** Handle returned by `subscribeToMessages`. */
export interface MessageSubscription {
  unsubscribe(): void;
}

/** Shape of the data the service posts when a message has a payload. */
export interface MessageData {
  message: string;
  payload?: MessagePayload;
}

export const DEFAULT_MESSAGE_CHANNEL: MessageChannelName = 'LDPK';

/**
 * Whether `value` is a plain object (prototype `Object.prototype` or `null`), i.e. a valid
 * {@link MessagePayload}. Rejects arrays, `Date`, `Map`, `Set`, `Blob`, typed arrays and the like,
 * which survive structured cloning with their own type. Useful in custom type resolvers.
 */
export function isMessagePayload(value: unknown): value is MessagePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Resolves a string to a message without payload, and `{ message: string, payload?: object }` to
 * a message with payload. Anything else is ignored.
 */
export const defaultTypeResolver: MessageTypeResolver = (data) => {
  if (typeof data === 'string') {
    return [data];
  }
  if (isMessagePayload(data) && typeof data['message'] === 'string') {
    const payload = data['payload'];
    return [data['message'], isMessagePayload(payload) ? payload : undefined];
  }
  return undefined;
};
