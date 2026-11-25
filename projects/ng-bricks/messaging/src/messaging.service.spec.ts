import { Component, DestroyRef, ErrorHandler, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MessagingService } from './messaging.service';
import type { MessageCallback, MessageTypeResolver } from './messaging.types';

class FakeBroadcastChannel extends EventTarget {
  static instances: FakeBroadcastChannel[] = [];

  readonly posted: unknown[] = [];
  closed = false;

  constructor(readonly name: string) {
    super();
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    this.posted.push(data);
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

function postWindowMessage(data: unknown, origin = 'https://third-party.example'): void {
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
  });

  describe('posting', () => {
    it('posts a bare string to the current tab when there is no payload', async () => {
      service.subscribeToMessages('ping', callback);

      service.postToCurrentTab('ping');

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      const [message, payload, origin, event] = callback.mock.calls[0];
      expect([message, payload, origin]).toEqual(['ping', undefined, 'current-tab']);
      expect(event.data).toBe('ping');
      expect(channel().posted).toEqual([]);
    });

    it('posts { message, payload } to the current tab when there is a payload', async () => {
      service.subscribeToMessages('ping', callback);

      service.postToCurrentTab('ping', { count: 1 });

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      expect(callback.mock.calls[0].slice(0, 3)).toEqual(['ping', { count: 1 }, 'current-tab']);
    });

    it('posts to other tabs on the LDPK broadcast channel only', async () => {
      service.subscribeToMessages('ping', callback);

      service.postToOtherTabs('ping', 'LDPK', { count: 1 });
      service.postToOtherTabs('pong');

      expect(channel().name).toBe('LDPK');
      expect(channel().posted).toEqual([
        { message: 'ping', payload: { count: 1 } },
        { message: 'pong' },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(callback).not.toHaveBeenCalled();
    });

    it('posts to all tabs', async () => {
      service.subscribeToMessages('ping', callback);

      service.postToAllTabs('ping', 'LDPK', { count: 1 });

      expect(channel().posted).toEqual([{ message: 'ping', payload: { count: 1 } }]);
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    });

    it('does nothing without BroadcastChannel support', () => {
      vi.stubGlobal('BroadcastChannel', undefined);

      expect(() => service.postToOtherTabs('ping')).not.toThrow();
      expect(() => service.subscribeToMessages('ping', callback)).not.toThrow();
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

      expect(callback.mock.calls[0].slice(0, 3)).toEqual(['ping', { count: 1 }, 'other-tab']);
    });

    it('delivers third-party messages from any origin with the raw event', () => {
      service.subscribeToMessages('LDPK.application-updates.show-demo', callback);

      postWindowMessage('LDPK.application-updates.show-demo');

      const event = callback.mock.calls[0][3];
      expect(event.origin).toBe('https://third-party.example');
    });

    it('ignores data the default resolver does not recognise', () => {
      service.subscribeToMessages('ping', callback);

      postWindowMessage({ type: 'ping' });
      postWindowMessage(42);
      postWindowMessage(null);
      postWindowMessage({ message: 'ping', payload: 'not an object' });

      expect(callback.mock.calls).toHaveLength(1);
      expect(callback.mock.calls[0][1]).toBeUndefined();
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
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
      consoleError.mockRestore();
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
});
