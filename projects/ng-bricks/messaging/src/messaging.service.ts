import { DestroyRef, DOCUMENT, ErrorHandler, inject, Injectable, isDevMode } from '@angular/core';
import {
  DEFAULT_MESSAGE_CHANNEL,
  defaultTypeResolver,
  type MessageCallback,
  type MessageChannelName,
  type MessageData,
  type MessageOrigin,
  type MessagePayload,
  type MessageSubscription,
  type MessageTypeResolver,
  type SubscribeOptions,
} from './messaging.types';

interface Subscriber {
  readonly messages: ReadonlySet<string>;
  readonly callback: MessageCallback;
  readonly channel: MessageChannelName;
  readonly typeResolver: MessageTypeResolver;
}

/**
 * Posts named messages, with an optional payload, to the current tab (window messages) and to
 * other tabs of the same origin (`BroadcastChannel`), and delivers received messages, including
 * third-party window messages, to subscribers. Does nothing where there's no window (SSR).
 */
@Injectable({
  providedIn: 'root',
})
export class MessagingService {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly errorHandler = inject(ErrorHandler);
  private readonly subscribers = new Set<Subscriber>();
  private readonly channels = new Map<MessageChannelName, BroadcastChannel>();
  private readonly onWindowMessage = (event: MessageEvent): void =>
    this.dispatch(event, 'current-tab');

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subscribers.clear();
      this.window?.removeEventListener('message', this.onWindowMessage);
      for (const channel of this.channels.values()) {
        channel.close();
      }
      this.channels.clear();
    });
  }

  /** Posts a message to this tab's window. */
  postToCurrentTab(message: string, payload?: MessagePayload): void {
    // A bare string without payload, so third-party listeners and the README console snippets
    // (`window.postMessage('LDPK.…', '*')`) use the same format.
    const data: string | MessageData = payload === undefined ? message : { message, payload };
    // '*' is safe: the target is this window, so the data can't reach another origin. ('/' would
    // say "same origin" too, but jsdom drops such messages, and location.origin is 'null' on
    // opaque origins.)
    this.window?.postMessage(data, '*');
  }

  /** Posts a message to the other tabs listening on `channel`. This tab doesn't receive it. */
  postToOtherTabs(
    message: string,
    channel: MessageChannelName = DEFAULT_MESSAGE_CHANNEL,
    payload?: MessagePayload,
  ): void {
    const data: MessageData = payload === undefined ? { message } : { message, payload };
    this.getChannel(channel)?.postMessage(data);
  }

  /** Posts a message to this tab and to the other tabs listening on `channel`. */
  postToAllTabs(
    message: string,
    channel: MessageChannelName = DEFAULT_MESSAGE_CHANNEL,
    payload?: MessagePayload,
  ): void {
    this.postToCurrentTab(message, payload);
    this.postToOtherTabs(message, channel, payload);
  }

  /**
   * Calls `callback` for each received message named in `messages`, from this tab's window and
   * from other tabs on the subscription's channel. Unsubscribes automatically when the caller's
   * `DestroyRef` (or `options.destroyRef`) is destroyed.
   */
  subscribeToMessages(
    messages: string | string[],
    callback: MessageCallback,
    options: SubscribeOptions = {},
  ): MessageSubscription {
    const subscriber: Subscriber = {
      messages: new Set(typeof messages === 'string' ? [messages] : messages),
      callback,
      channel: options.channel ?? DEFAULT_MESSAGE_CHANNEL,
      typeResolver: options.typeResolver ?? defaultTypeResolver,
    };
    const subscription: MessageSubscription = {
      unsubscribe: () => this.removeSubscriber(subscriber),
    };

    // Register for destroy before adding, so a destroyed DestroyRef throws without leaking.
    const destroyRef = options.destroyRef ?? injectDestroyRefIfInContext();
    destroyRef?.onDestroy(() => subscription.unsubscribe());

    if (this.subscribers.size === 0) {
      this.window?.addEventListener('message', this.onWindowMessage);
    }
    this.subscribers.add(subscriber);
    this.getChannel(subscriber.channel);

    return subscription;
  }

  /** Stops a subscription made with `subscribeToMessages`. */
  unsubscribeFromMessages(subscription: MessageSubscription): void {
    subscription.unsubscribe();
  }

  private removeSubscriber(subscriber: Subscriber): void {
    if (!this.subscribers.delete(subscriber)) {
      return;
    }
    if (this.subscribers.size === 0) {
      this.window?.removeEventListener('message', this.onWindowMessage);
    }
    const channelInUse = [...this.subscribers].some(
      ({ channel }) => channel === subscriber.channel,
    );
    if (!channelInUse) {
      // Recreated on the next post or subscription to this channel.
      this.channels.get(subscriber.channel)?.close();
      this.channels.delete(subscriber.channel);
    }
  }

  private getChannel(name: MessageChannelName): BroadcastChannel | undefined {
    const existing = this.channels.get(name);
    if (existing) {
      return existing;
    }
    const BroadcastChannelCtor = this.window?.BroadcastChannel;
    if (!BroadcastChannelCtor) {
      return undefined;
    }
    const channel = new BroadcastChannelCtor(name);
    channel.addEventListener('message', (event) => this.dispatch(event, 'other-tab', name));
    this.channels.set(name, channel);
    return channel;
  }

  private dispatch(event: MessageEvent, origin: MessageOrigin, channel?: MessageChannelName): void {
    // Copy, so callbacks that unsubscribe don't affect this dispatch.
    for (const subscriber of [...this.subscribers]) {
      if (channel !== undefined && subscriber.channel !== channel) {
        continue;
      }

      let resolved: [string, MessagePayload?] | undefined;
      try {
        resolved = subscriber.typeResolver(event.data);
      } catch (error) {
        if (isDevMode()) {
          console.error('Message type resolver failed:', error);
        }
        continue;
      }

      if (resolved && subscriber.messages.has(resolved[0])) {
        try {
          subscriber.callback(resolved[0], resolved[1], origin, event);
        } catch (error) {
          this.errorHandler.handleError(error);
        }
      }
    }
  }
}

function injectDestroyRefIfInContext(): DestroyRef | undefined {
  try {
    return inject(DestroyRef);
  } catch {
    // Not in an injection context: the caller unsubscribes manually.
    return undefined;
  }
}
