import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  DOCUMENT,
  ErrorHandler,
  inject,
  Injectable,
  isDevMode,
  PLATFORM_ID,
} from '@angular/core';
import {
  DEFAULT_MESSAGE_CHANNEL,
  defaultTypeResolver,
  type MessageCallback,
  type MessageChannelName,
  type MessageData,
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
  readonly acceptForeignOrigins: boolean;
}

/**
 * Posts named messages, with an optional payload, to the current tab or to all of the app's tabs
 * (the current one included), and delivers received messages to subscribers. Window messages from
 * other origins are delivered only to subscriptions that opt in with `acceptForeignOrigins`. Does
 * nothing outside the browser (SSR). See `docs/Messaging.md` for the architecture.
 */
@Injectable({
  providedIn: 'root',
})
export class MessagingService {
  private readonly window = isPlatformBrowser(inject(PLATFORM_ID))
    ? inject(DOCUMENT).defaultView
    : null;
  private readonly errorHandler = inject(ErrorHandler);
  private readonly subscribers = new Set<Subscriber>();
  /** Open channels, one per name that has subscribers. */
  private readonly channels = new Map<MessageChannelName, BroadcastChannel>();
  private readonly onWindowMessage = (event: MessageEvent): void => this.dispatch(event);
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.subscribers.clear();
      this.window?.removeEventListener('message', this.onWindowMessage);
      for (const channel of this.channels.values()) {
        channel.close();
      }
      this.channels.clear();
    });
  }

  /** Posts a message to this tab only (via its window). */
  postToCurrentTab(message: string, payload?: MessagePayload): void {
    if (this.destroyed) {
      return;
    }
    // A bare string without payload, so third-party listeners and the README console snippets
    // (`window.postMessage('LDPK.…', '*')`) use the same format.
    const data: string | MessageData = payload === undefined ? message : { message, payload };
    // '*' is safe: the target is this window, so the data can't reach another origin. ('/' would
    // say "same origin" too, but jsdom drops such messages, and location.origin is 'null' on
    // opaque origins.)
    this.window?.postMessage(data, '*');
  }

  /**
   * Posts a message to all of the app's tabs listening on `channel`, this one included: to this tab
   * via its window, and to the others via a `BroadcastChannel`. Where `BroadcastChannel` is
   * unavailable, only this tab receives it.
   */
  postToAllTabs(
    message: string,
    channel: MessageChannelName = DEFAULT_MESSAGE_CHANNEL,
    payload?: MessagePayload,
  ): void {
    if (this.destroyed) {
      return;
    }
    this.postToCurrentTab(message, payload);

    const data: MessageData = payload === undefined ? { message } : { message, payload };
    const subscribed = this.channels.get(channel);
    if (subscribed) {
      // BroadcastChannel doesn't deliver to the channel object that posts, so this tab's
      // subscribers only get the window message above.
      subscribed.postMessage(data);
      return;
    }
    // No subscribers here: post through a short-lived channel rather than keep one open.
    const temporary = this.openChannel(channel);
    temporary?.postMessage(data);
    temporary?.close();
  }

  /**
   * Calls `callback` for each received message named in `messages`, posted by this tab or by the
   * app's other tabs on the subscription's channel. Unsubscribes automatically when the caller's
   * `DestroyRef` (or `options.destroyRef`) is destroyed.
   */
  subscribeToMessages(
    messages: string | readonly string[],
    callback: MessageCallback,
    options: SubscribeOptions = {},
  ): MessageSubscription {
    const subscriber: Subscriber = {
      messages: new Set(typeof messages === 'string' ? [messages] : messages),
      callback,
      channel: options.channel ?? DEFAULT_MESSAGE_CHANNEL,
      typeResolver: options.typeResolver ?? defaultTypeResolver,
      acceptForeignOrigins: options.acceptForeignOrigins ?? false,
    };
    const subscription: MessageSubscription = {
      unsubscribe: () => this.removeSubscriber(subscriber),
    };
    if (this.destroyed) {
      return subscription;
    }

    // Register for destroy before changing any state, so a destroyed DestroyRef throws without
    // leaving a half-registered subscription. Nothing below throws.
    const destroyRef = options.destroyRef ?? injectDestroyRefIfInContext();
    destroyRef?.onDestroy(() => subscription.unsubscribe());

    if (this.subscribers.size === 0) {
      this.window?.addEventListener('message', this.onWindowMessage);
    }
    this.subscribers.add(subscriber);
    this.listenOnChannel(subscriber.channel);

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
      this.channels.get(subscriber.channel)?.close();
      this.channels.delete(subscriber.channel);
    }
  }

  private listenOnChannel(name: MessageChannelName): void {
    if (this.channels.has(name)) {
      return;
    }
    const channel = this.openChannel(name);
    if (!channel) {
      return;
    }
    channel.addEventListener('message', (event) => this.dispatch(event, name));
    this.channels.set(name, channel);
  }

  /** Opens a channel, or returns `undefined` where `BroadcastChannel` is unavailable or blocked. */
  private openChannel(name: MessageChannelName): BroadcastChannel | undefined {
    const BroadcastChannelCtor = this.window?.BroadcastChannel;
    if (!BroadcastChannelCtor) {
      return undefined;
    }
    try {
      return new BroadcastChannelCtor(name);
    } catch (error) {
      // E.g. NotSupportedError in opaque origins (sandboxed iframes), SecurityError when storage is
      // blocked. Fall back to window messages only.
      if (isDevMode()) {
        console.warn(`BroadcastChannel '${name}' is unavailable, messaging this tab only:`, error);
      }
      return undefined;
    }
  }

  /** Delivers a window message (`channel` undefined) or a message received on `channel`. */
  private dispatch(event: MessageEvent, channel?: MessageChannelName): void {
    // Broadcast channels only connect same-origin contexts; window messages can come from any.
    const isForeign = channel === undefined && event.origin !== this.window?.location.origin;

    // Iterate over a copy so subscriptions added by a callback don't receive this event, and skip
    // subscribers that an earlier callback removed (directly or by destroying their owner).
    for (const subscriber of [...this.subscribers]) {
      if (!this.subscribers.has(subscriber)) {
        continue;
      }
      if (channel !== undefined && subscriber.channel !== channel) {
        continue;
      }
      if (isForeign && !subscriber.acceptForeignOrigins) {
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
          subscriber.callback(resolved[0], resolved[1], event);
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
