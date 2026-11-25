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

## Design decisions (proposed — confirm before implementing)

1. **New secondary entry point** `@lingo-daily/ng-bricks/messaging`, matching the existing
   `application-updates` / `file-uplink` / `theme-showcase` layout. No Material dependency.
2. **Service** `MessagingService`, `providedIn: 'root'`, `inject(DOCUMENT)` to reach
   `defaultView` (SSR-safe: no-op when there's no window or `BroadcastChannel` is undefined).
3. **Wire format.** Window/broadcast data is an envelope so our messages can be told apart from
   other `postMessage` traffic:
   ```ts
   interface MessageEnvelope { source: 'LDPK'; message: string; payload?: MessagePayload }
   ```
   `postMessage` to the current tab uses `targetOrigin = location.origin`, and incoming window
   messages are accepted only when `event.origin === location.origin` and `event.source === window`.
   - Open question: keep accepting the legacy bare-string `LDPK.application-updates.show-demo`
     (README tells people to post it from the console)? Proposal: yes — treat a bare string data
     as `{ message: data }` so the README snippet keeps working.
4. **Channel parameter.** Typed as `type MessageChannelName = 'LDPK'` (per ticket), defaulting to
   `'LDPK'` so callers can omit it. One `BroadcastChannel` per name, created lazily and cached;
   closed in `DestroyRef.onDestroy`.
5. **Callback signature:** `(message: string, payload: MessagePayload | undefined, origin:
   'current-tab' | 'other-tab') => void`.
6. **Subscriptions.** `subscribeToMessages` returns a `MessageSubscription` handle (with
   `unsubscribe()`); `unsubscribeFromMessages(handle)` does the same, as the ticket asks for both.
   Also accept an optional `DestroyRef` (or default to `inject(DestroyRef, { optional: true })`
   when called in an injection context) to auto-unsubscribe with the component — mirrors the
   `takeUntilDestroyed()` pattern used in `ApplicationUpdates`.
   - Internally a single `window` `message` listener and one listener per channel fan out to a
     `Map<string, Set<callback>>`; listeners are attached lazily on first subscription.
   - Broadcast listening: subscribing listens on the `'LDPK'` channel (open question: should
     `subscribeToMessages` take a channel argument too? Proposal: optional, default `'LDPK'`).
7. **Callbacks run inside the Angular zone / trigger change detection** — app is zoneless-ready on
   Angular 22, so callers update signals; no extra work needed, but note it in docs.

## Implementation steps

1. [ ] Create `projects/ng-bricks/messaging/ng-package.json` (copy of
   `application-updates/ng-package.json`).
2. [ ] Add `projects/ng-bricks/messaging/src/messaging.types.ts` — `MessagePayload`,
   `MessageChannelName`, `MessageEnvelope`, `MessageCallback`, `MessageSubscription`.
3. [ ] Add `projects/ng-bricks/messaging/src/messaging.service.ts` — `MessagingService` with
   `postToCurrentTab`, `postToOtherTabs`, `postToAllTabs`, `subscribeToMessages`,
   `unsubscribeFromMessages`, per the design above.
4. [ ] Add `projects/ng-bricks/messaging/src/public-api.ts` exporting the service and types.
5. [ ] Re-export from `projects/ng-bricks/src/public-api.ts`
   (`export * from '@lingo-daily/ng-bricks/messaging';`).
6. [ ] Unit tests `messaging/src/messaging.service.spec.ts` (Vitest via `@angular/build:unit-test`,
   style as in `application-updates/src/sw-update.service.spec.ts`), using a fake
   `BroadcastChannel` stub:
   - current-tab post reaches subscribers of that message only; array subscription works
   - other-tabs post goes to `BroadcastChannel.postMessage`, not to the current tab
   - all-tabs does both
   - incoming broadcast messages reach subscribers with `origin: 'other-tab'`
   - foreign `postMessage` traffic and other origins are ignored
   - unsubscribe (handle and `unsubscribeFromMessages`) and `DestroyRef` cleanup
   - channels are closed on service destroy; no-op without `BroadcastChannel`
7. [ ] (Optional, confirm) Migrate `ApplicationUpdates` to subscribe to
   `APPLICATION_UPDATES_SHOW_DEMO_MESSAGE` through `MessagingService` — would make the demo
   triggerable from another tab too. Only if decision 3's legacy-string handling is accepted.
8. [ ] README (`projects/ng-bricks/README.md`): add `messaging` to the entry-point table and a
   `### MessagingService` section with usage examples.
9. [ ] `npm run build` and `npm test` pass.

## Progress notes

- 2026-11-25: Created LIB-17 in Jira from GitHub issue #11 and moved it to In Progress; branched
  off `main` (1.5.0); drafted this plan. No code written yet.
