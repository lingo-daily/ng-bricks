import { Component, DestroyRef, ErrorHandler, inject, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MessagingService } from './messaging.service';
import type {
  MessageCallback,
  MessagePayload,
  MessageSubscription,
  MessageTypeResolver,
} from './messaging.types';

class FakeBroadcastChannel extends EventTarget {
  static instances: FakeBroadcastChannel[] = [];

  readonly posted: unknown[] = [];
  closed = false;

  constructor(readonly name: string) {
    super();
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    // Like the real API, posting clones the data.
    this.posted.push(structuredClone(data));
  }

  close(): void {
    this.closed = true;
  }

  /** Simulates a message posted by another tab. */
  receive(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

function openChannels(): FakeBroadcastChannel[] {
  return FakeBroadcastChannel.instances.filter((channel) => !channel.closed);
}

function channel(): FakeBroadcastChannel {
  const [open] = openChannels();
  if (!open) {
    throw new Error('No open broadcast channel');
  }
  return open;
}

const FOREIGN_ORIGIN = 'https://third-party.example';

function postWindowMessage(data: unknown, origin = window.location.origin): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

describe('MessagingService', () => {
  let service: MessagingService;
  let callback: ReturnType<typeof vi.fn<MessageCallback>>;

  beforeEach(() => {
    FakeBroadcastChannel.instances = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    service = TestBed.inject(MessagingService);
    callback = vi.fn<MessageCallback>();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('posting', () => {
    let pendingDeliveries: ReturnType<typeof setTimeout>[];

    beforeEach(() => {
      pendingDeliveries = [];
      // jsdom doesn't set event.origin on posted messages; a browser sets this window's origin.
      vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
        // Like the real API, posting clones the data and delivers it asynchronously.
        const cloned = structuredClone(data);
        pendingDeliveries.push(setTimeout(() => postWindowMessage(cloned)));
      });
    });

    afterEach(() => {
      // Don't let a message posted by one test reach the next one.
      for (const timeout of pendingDeliveries) {
        clearTimeout(timeout);
      }
    });

    it('posts a bare string to the current tab when there is no payload', async () => {
      service.subscribeToMessages('ping', callback);

      service.postToCurrentTab('ping');

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      const [message, payload, event] = callback.mock.calls[0];
      expect([message, payload]).toEqual(['ping', undefined]);
      expect(event.data).toBe('ping');
      expect(channel().posted).toEqual([]);
    });

    it('posts { message, payload } to the current tab when there is a payload', async () => {
      service.subscribeToMessages('ping', callback);

      service.postToCurrentTab('ping', { count: 1 });

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      expect(callback.mock.calls[0].slice(0, 2)).toEqual(['ping', { count: 1 }]);
    });

    it('posts to all tabs: this window and the LDPK broadcast channel', async () => {
      service.subscribeToMessages('ping', callback);

      service.postToAllTabs('ping', 'LDPK', { count: 1 });
      service.postToAllTabs('pong');

      expect(channel().name).toBe('LDPK');
      expect(channel().posted).toEqual([
        { message: 'ping', payload: { count: 1 } },
        { message: 'pong' },
      ]);
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      expect(callback.mock.calls[0].slice(0, 2)).toEqual(['ping', { count: 1 }]);
    });

    it('posts to other tabs through a short-lived channel when nothing here subscribes', () => {
      service.postToAllTabs('ping', 'LDPK', { count: 1 });

      expect(FakeBroadcastChannel.instances).toHaveLength(1);
      const [temporary] = FakeBroadcastChannel.instances;
      expect(temporary.posted).toEqual([{ message: 'ping', payload: { count: 1 } }]);
      expect(temporary.closed).toBe(true);
    });

    it('does nothing after the service is destroyed', async () => {
      TestBed.resetTestingModule();

      service.postToAllTabs('ping');
      service.subscribeToMessages('ping', callback);
      postWindowMessage('ping');

      expect(window.postMessage).not.toHaveBeenCalled();
      expect(FakeBroadcastChannel.instances).toHaveLength(0);
      expect(callback).not.toHaveBeenCalled();
    });

    it('delivers payloads as plain objects after structured cloning', async () => {
      class Point {
        constructor(
          readonly x: number,
          readonly at: Date,
        ) {}
      }
      const at = new Date('2026-11-25T00:00:00Z');
      service.subscribeToMessages('ping', callback);

      service.postToCurrentTab('ping', { point: new Point(1, at) } as MessagePayload);
      service.postToCurrentTab('ping', Object.assign(Object.create(null), { count: 1 }));

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
      const [first, second] = callback.mock.calls.map(([, payload]) => payload);
      expect(first).toEqual({ point: { x: 1, at } });
      expect((first?.['point'] as { at: unknown }).at).toBeInstanceOf(Date);
      expect(second).toEqual({ count: 1 });
    });

    it('posts to this tab only without BroadcastChannel support', async () => {
      vi.stubGlobal('BroadcastChannel', undefined);

      expect(() => service.subscribeToMessages('ping', callback)).not.toThrow();
      expect(() => service.postToAllTabs('ping')).not.toThrow();
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    });

    it('falls back to this tab only when BroadcastChannel throws', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.stubGlobal(
        'BroadcastChannel',
        class {
          constructor() {
            throw new DOMException("Can't create BroadcastChannel", 'NotSupportedError');
          }
        },
      );

      const subscription = service.subscribeToMessages('ping', callback);
      service.postToAllTabs('ping');

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      subscription.unsubscribe();
      postWindowMessage('ping');
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('receiving', () => {
    it('delivers only the subscribed messages, given as a string or an array', () => {
      const arrayCallback = vi.fn<MessageCallback>();
      service.subscribeToMessages('ping', callback);
      service.subscribeToMessages(['ping', 'pong'], arrayCallback);

      postWindowMessage('ping');
      postWindowMessage('pong');
      postWindowMessage('other');

      expect(callback.mock.calls.map(([message]) => message)).toEqual(['ping']);
      expect(arrayCallback.mock.calls.map(([message]) => message)).toEqual(['ping', 'pong']);
    });

    it('delivers messages from other tabs', () => {
      service.subscribeToMessages('ping', callback);

      channel().receive({ message: 'ping', payload: { count: 1 } });

      expect(callback.mock.calls[0].slice(0, 2)).toEqual(['ping', { count: 1 }]);
    });

    it('ignores window messages from other origins by default', () => {
      service.subscribeToMessages('ping', callback);

      postWindowMessage('ping', FOREIGN_ORIGIN);

      expect(callback).not.toHaveBeenCalled();
    });

    it('delivers other origins with acceptForeignOrigins, with the raw event', () => {
      service.subscribeToMessages('ping', callback, { acceptForeignOrigins: true });

      postWindowMessage('ping', FOREIGN_ORIGIN);

      const event = callback.mock.calls[0][2];
      expect(event.origin).toBe(FOREIGN_ORIGIN);
    });

    it('ignores data the default resolver does not recognise', () => {
      service.subscribeToMessages('ping', callback);

      postWindowMessage({ type: 'ping' });
      postWindowMessage(42);
      postWindowMessage(null);
      postWindowMessage({ message: 'ping', payload: 'not an object' });
      postWindowMessage({ message: 'ping', payload: new Map([['count', 1]]) });
      postWindowMessage({ message: 'ping', payload: [1] });
      postWindowMessage({ message: 'ping', payload: new Date() });

      // Messages with an invalid payload are delivered without it.
      expect(callback.mock.calls).toHaveLength(4);
      expect(callback.mock.calls.every(([, payload]) => payload === undefined)).toBe(true);
    });

    it('normalizes third-party shapes with a custom type resolver', () => {
      const typeResolver: MessageTypeResolver = (data) => {
        const { type, data: payload } = data as { type?: unknown; data?: Record<string, unknown> };
        return typeof type === 'string' ? [type, payload] : undefined;
      };
      service.subscribeToMessages('ping', callback, { typeResolver });

      postWindowMessage({ type: 'ping', data: { count: 1 } });
      postWindowMessage('ping');

      expect(callback.mock.calls.map((call) => call.slice(0, 2))).toEqual([['ping', { count: 1 }]]);
    });

    it('skips an event only for the subscription whose resolver throws', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const otherCallback = vi.fn<MessageCallback>();
      service.subscribeToMessages('ping', callback, {
        typeResolver: () => {
          throw new Error('bad resolver');
        },
      });
      service.subscribeToMessages('ping', otherCallback);

      postWindowMessage('ping');

      expect(callback).not.toHaveBeenCalled();
      expect(otherCallback).toHaveBeenCalledTimes(1);
    });

    it('reports a failing callback to the ErrorHandler and keeps delivering', () => {
      const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError');
      handleError.mockImplementation(() => undefined);
      service.subscribeToMessages('ping', () => {
        throw new Error('bad callback');
      });
      service.subscribeToMessages('ping', callback);

      postWindowMessage('ping');

      expect(handleError).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribing', () => {
    it('does not call a subscriber that an earlier callback unsubscribed', () => {
      let second: MessageSubscription | undefined;
      service.subscribeToMessages('ping', () => second?.unsubscribe());
      second = service.subscribeToMessages('ping', callback);

      postWindowMessage('ping');

      expect(callback).not.toHaveBeenCalled();
    });

    it('stops delivery via the handle and via unsubscribeFromMessages', () => {
      const otherCallback = vi.fn<MessageCallback>();
      const subscription = service.subscribeToMessages('ping', callback);
      const otherSubscription = service.subscribeToMessages('ping', otherCallback);

      subscription.unsubscribe();
      service.unsubscribeFromMessages(otherSubscription);
      postWindowMessage('ping');

      expect(callback).not.toHaveBeenCalled();
      expect(otherCallback).not.toHaveBeenCalled();
    });

    it('closes the broadcast channel when its last subscriber unsubscribes', () => {
      const first = service.subscribeToMessages('ping', callback);
      const second = service.subscribeToMessages('pong', callback);

      first.unsubscribe();
      expect(openChannels()).toHaveLength(1);

      second.unsubscribe();
      expect(openChannels()).toHaveLength(0);
    });

    it('unsubscribes when the given DestroyRef is destroyed', () => {
      let destroy: () => void = () => undefined;
      const destroyRef = {
        onDestroy: (fn: () => void) => {
          destroy = fn;
          return () => undefined;
        },
      } as DestroyRef;
      service.subscribeToMessages('ping', callback, { destroyRef });

      destroy();
      postWindowMessage('ping');

      expect(callback).not.toHaveBeenCalled();
    });

    it("unsubscribes with the caller's DestroyRef in an injection context", () => {
      @Component({ template: '' })
      class Subscriber {
        constructor() {
          inject(MessagingService).subscribeToMessages('ping', callback);
        }
      }
      const fixture = TestBed.createComponent(Subscriber);

      postWindowMessage('ping');
      fixture.destroy();
      postWindowMessage('ping');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('closes broadcast channels when the service is destroyed', () => {
      service.subscribeToMessages('ping', callback);

      TestBed.resetTestingModule();
      postWindowMessage('ping');

      expect(openChannels()).toHaveLength(0);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('server-side rendering', () => {
    it('does nothing outside the browser', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
      const postMessage = vi.spyOn(window, 'postMessage');
      const serverService = TestBed.inject(MessagingService);

      serverService.subscribeToMessages('ping', callback);
      serverService.postToAllTabs('ping');
      postWindowMessage('ping');

      expect(postMessage).not.toHaveBeenCalled();
      expect(FakeBroadcastChannel.instances).toHaveLength(0);
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
