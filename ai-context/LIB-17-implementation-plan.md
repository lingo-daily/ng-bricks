# LIB-17 Cross-tab messaging service — implementation plan

- Jira: [LIB-17](https://lingo-daily.atlassian.net/browse/LIB-17)
- GitHub issue: [lingo-daily/ng-bricks#11](https://github.com/lingo-daily/ng-bricks/issues/11)
- Branch: `feat/LIB-17-Cross-tab-messaging-service`

> **Living document.** Keep this plan up to date as work proceeds: tick off finished steps, add
> progress notes, and record decisions and open questions, so another agent or developer can pull
> the branch and continue from where it left off. `/curtail` deletes this file before merge.

## Problem

Apps need one way to send named messages, with an optional payload, to listeners in the current
tab (via `window.postMessage`) and to other tabs of the same origin (via `BroadcastChannel`), and
to subscribe/unsubscribe to those messages by name. Today this is done ad hoc, e.g.
`ApplicationUpdates` listens for the raw string `LDPK.application-updates.show-demo` on
`window` `message` events (`application-updates/src/application-updates.ts:121`).

Requested API (from the ticket):

```ts
type MessagePayload = Record<string, unknown>;

postToCurrentTab(message: string, payload?: MessagePayload)
postToOtherTabs(message: string, channel: 'LDPK', payload?: MessagePayload)   // BroadcastChannel
postToAllTabs(message: string, channel: 'LDPK', payload?: MessagePayload)     // both of the above
subscribeToMessages(messages: string | string[], callback)
unsubscribeFromMessages(...)
```

## Design decisions (agreed 2026-11-25 unless marked as an assumption)

1. **New secondary entry point** `@lingo-daily/ng-bricks/messaging`, matching the existing
   `application-updates` / `file-uplink` / `theme-showcase` layout. No Material dependency.
2. **Service** `MessagingService`, `providedIn: 'root'`, `inject(DOCUMENT)` to reach
   `defaultView` (SSR-safe: no-op when there's no window or `BroadcastChannel` is undefined).
3. **Wire format — no LDPK envelope, no origin filter.** The same service must also subscribe to
   **third-party** window messages (e.g. from iframes, other origins, browser extensions), so
   incoming messages are not restricted to our own format or origin. Incoming `data` is mapped to a
   message name as follows (assumption — confirm if third parties use another shape, e.g. `type`):
   - a string → `message = data`, no payload. This keeps the legacy bare-string
     `LDPK.application-updates.show-demo` working (README tells people to post it from the console);
     **it must keep working**.
   - an object with a string `message` property → `message = data.message`,
     `payload = data.payload` when it is a plain object.
   - anything else is ignored.
   These rules are the **default type resolver**. `subscribeToMessages` takes an optional
   `typeResolver` (agreed 2026-11-25) that normalizes third-party shapes, e.g. `{ type, data }`:
   ```ts
   type MessageTypeResolver = (data: unknown) => [string, MessagePayload?] | undefined;
   ```
   It returns `[message, payload]`, or `undefined` to ignore data it doesn't recognise (the
   `undefined` return is an extension of the requested `(unknown) => [string, MessagePayload]`, so
   one resolver can skip unrelated traffic). The resolver applies to that subscription only, on
   both window and broadcast messages; if it throws, the event is skipped for that subscription
   and the error is logged in dev mode.
   Our own posts use the same shape: `postToCurrentTab(message)` without a payload posts the bare
   string; with a payload it posts `{ message, payload }`. Broadcasts always post
   `{ message, payload }`.
   Because origins aren't filtered, subscribers that care about the sender can check the raw
   `MessageEvent` (see 5). `postToCurrentTab` uses `targetOrigin = location.origin`.
4. **Channel parameter.** Typed as `type MessageChannelName = 'LDPK'` (per ticket), defaulting to
   `'LDPK'` so callers can omit it. One `BroadcastChannel` per name, created lazily and cached;
   closed in `DestroyRef.onDestroy`.
5. **Callback signature (agreed):** `(message: string, payload: MessagePayload | undefined,
   origin: 'current-tab' | 'other-tab', event: MessageEvent) => void` — the trailing raw `event` is
   an additive extension so third-party subscribers can check `event.origin` / `event.source`.
6. **Subscriptions (agreed).** `subscribeToMessages` returns a `MessageSubscription` handle (with
   `unsubscribe()`); `unsubscribeFromMessages(handle)` does the same, as the ticket asks for both.
   Also accept an optional `DestroyRef` (or default to `inject(DestroyRef, { optional: true })`
   when called in an injection context) to auto-unsubscribe with the component — mirrors the
   `takeUntilDestroyed()` pattern used in `ApplicationUpdates`.
   - Full signature: `subscribeToMessages(messages, callback, options?: { channel?, typeResolver?,
     destroyRef? })`. Options object keeps the optional parameters order-independent.
   - Internally a single `window` `message` listener and one listener per channel fan out to a
     `Set` of subscriptions; each subscription runs its own resolver (default or custom) on the
     event data and checks the resolved name against its message list. Listeners are attached
     lazily on first subscription and removed when the last one goes.
   - Broadcast listening: `subscribeToMessages` takes an optional channel, default `'LDPK'`.
7. **Callbacks run inside the Angular zone / trigger change detection** — app is zoneless-ready on
   Angular 22, so callers update signals; no extra work needed, but note it in docs.

## Implementation steps

1. [x] Create `projects/ng-bricks/messaging/ng-package.json` (copy of
   `application-updates/ng-package.json`).
2. [x] Add `projects/ng-bricks/messaging/src/messaging.types.ts` — `MessagePayload`,
   `MessageChannelName`, `MessageOrigin`, `MessageCallback`, `MessageTypeResolver`,
   `MessageSubscription`, `SubscribeOptions`; plus the internal `defaultTypeResolver`.
3. [x] Add `projects/ng-bricks/messaging/src/messaging.service.ts` — `MessagingService` with
   `postToCurrentTab`, `postToOtherTabs`, `postToAllTabs`, `subscribeToMessages`,
   `unsubscribeFromMessages`, per the design above.
4. [x] Add `projects/ng-bricks/messaging/src/public-api.ts` exporting the service and types.
5. [x] Re-export from `projects/ng-bricks/src/public-api.ts`
   (`export * from '@lingo-daily/ng-bricks/messaging';`).
6. [x] Unit tests `messaging/src/messaging.service.spec.ts` (Vitest via `@angular/build:unit-test`,
   style as in `application-updates/src/sw-update.service.spec.ts`), using a fake
   `BroadcastChannel` stub:
   - current-tab post reaches subscribers of that message only; array subscription works
   - other-tabs post goes to `BroadcastChannel.postMessage`, not to the current tab
   - all-tabs does both
   - incoming broadcast messages reach subscribers with `origin: 'other-tab'`
   - third-party messages (bare string, `{ message, payload }`, other origins) are delivered with
     the raw event; data of any other shape is ignored
   - a bare-string `postMessage('LDPK.application-updates.show-demo', '*')` is delivered
   - a custom `typeResolver` maps e.g. `{ type, data }`; returning `undefined` or throwing skips
     the event for that subscription only, other subscriptions still get it
   - unsubscribe (handle and `unsubscribeFromMessages`) and `DestroyRef` cleanup
   - channels are closed on service destroy; no-op without `BroadcastChannel`
7. [x] (Confirmed) Migrate `ApplicationUpdates` to subscribe to
   `APPLICATION_UPDATES_SHOW_DEMO_MESSAGE` through `MessagingService` — would make the demo
   triggerable from another tab too. The README console snippet must keep working; its existing
   spec in `application-updates/src/application-updates.spec.ts` must stay green.
8. [x] README (`projects/ng-bricks/README.md`): add `messaging` to the entry-point table and a
   `### MessagingService` section with usage examples.
9. [x] `npm run build` and `npm test` pass.
10. [x] `ThemeShowcase`: the "Window Messages" section (now "Messages") posts through
    `MessagingService.postToAllTabs` instead of `window.postMessage`; spec and README updated.

## Progress notes

- 2026-11-25: Created LIB-17 in Jira from GitHub issue #11 and moved it to In Progress; branched
  off `main` (1.5.0); drafted this plan. No code written yet.
- 2026-11-25: Design review with the user — dropped the LDPK envelope and same-origin filter
  (service must handle third-party messages too); legacy bare-string demo message must keep
  working; callback signature and subscription handling agreed. Added raw `MessageEvent` as a
  4th callback argument (additive).
- 2026-11-25: Added optional per-subscription `typeResolver` for third-party message shapes;
  optional subscribe parameters grouped into an options object.
- 2026-11-25: Implemented steps 1–9. `messaging` entry point builds; 70/70 tests pass
  (17 new in `messaging.service.spec.ts`; `ApplicationUpdates` specs unchanged and green).
  Decisions made while implementing:
  - `postToCurrentTab` posts with `targetOrigin '*'`: the target is the posting window itself, so
    nothing can leak to another origin. `'/'` is silently dropped by jsdom (tests), and
    `location.origin` is `'null'` on opaque origins, which makes `postMessage` throw.
  - A throwing subscriber callback is reported to Angular's `ErrorHandler` and doesn't stop
    delivery to other subscribers.
  - A broadcast channel is closed when its last subscriber goes and recreated on the next
    post/subscription; all channels close when the service's injector is destroyed.
  - `defaultTypeResolver` is exported so custom resolvers can fall back to it.
  - README: only the new section was added; Prettier would also reformat older sections, left as is.
- 2026-11-25: Step 10 — `ThemeShowcase` posts via `postToAllTabs` (user request). Sibling apps
  `dashtickguitars` (`test-ui.component.ts`) and `the-perfect-dabblers-ng`
  (`playground.component.ts`) post the bare demo string with `window.postMessage`; that keeps
  working, and they can switch to `postToAllTabs` after this release (separate tickets).
- 2026-11-25: Browser test in `dashtickguitars` (npm link + preserveSymlinks, temporary, reverted):
  `postToAllTabs` from `/test-ui` showed the demo card in both tabs; a raw `LDPK` broadcast
  reached both tabs; the README bare-string `window.postMessage` showed it only in the posting
  tab; `{ type: … }` data was ignored; no console errors.
  Remaining: open the PR (`/curtail`).
