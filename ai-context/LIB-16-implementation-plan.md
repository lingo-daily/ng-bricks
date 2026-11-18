# LIB-16 Implementation Plan

**Ticket:** [LIB-16 — Check for application updates when a tab becomes visible again](https://lingo-daily.atlassian.net/browse/LIB-16)
**Branch:** `feat/LIB-16-Check-for-application-updates-when-a-tab-becomes-visible-again`

> **This is a living document.** Keep it up to date with progress notes as work proceeds: what's
> done, what's left, and any decisions made along the way. That way another agent or developer can
> pull the branch and continue from where it left off.

## Problem statement

`ApplicationUpdates` (`ldpk-application-updates`) checks for a new service-worker version only after
router navigation (`NavigationEnd`, debounced 3 s in dev mode / 10 s otherwise). A user who leaves the
app open in a background tab and comes back later sees nothing until they navigate. The ticket asks
for the tab becoming visible again (`visibilitychange` → `document.visibilityState === 'visible'`)
to trigger an update check **just like navigation, with the same debounce**.

## Current code

- `projects/ng-bricks/application-updates/src/application-updates.ts`: the constructor subscribes to
  `router.events` filtered to `NavigationEnd`, then `debounceTime(isDevMode() ? 3_000 : 10_000)`,
  then calls `swUpdateService.checkForUpdates()`. It returns early when not in the browser (SSR).
- `projects/ng-bricks/application-updates/src/sw-update.service.ts`: `checkForUpdates()` already
  guards against SW being disabled and against concurrent checks, and has a timeout. No changes
  needed there.
- `projects/ng-bricks/application-updates/src/application-updates.spec.ts`: component tests with a
  `FakeSwUpdateService` (`checkForUpdates` is a `vi.fn`). Navigation-triggered checks aren't
  covered by tests yet.
- `projects/ng-bricks/README.md` (`### ApplicationUpdates`): documents the navigation check.

## Implementation steps

1. **Merge visibility events into the check trigger** in `application-updates.ts`:
   - Build a `tabVisible$` stream: `fromEvent(this.document, 'visibilitychange')` filtered to
     `this.document.visibilityState === 'visible'`. Use the injected `DOCUMENT` rather than the
     global `document`.
   - Combine it with the existing `NavigationEnd` stream (`merge` / `mergeWith`) **before** the
     `debounceTime`, so both triggers share a single debounce. A navigation right after returning to
     the tab (or the reverse) results in one check, not two.
   - Keep `takeUntilDestroyed()` and the `isBrowser` early return, so SSR still does nothing.
   - Optionally pull the debounce value into a named constant (e.g. `CHECK_DEBOUNCE`) and update the
     comment from "Check for updates on navigation" to cover both triggers.
   - Decision: hiding the tab is not a trigger. Only `visible` counts. The debounce means a check
     runs 10 s (3 s in dev) after the tab is shown, as long as nothing else triggers in between.
2. **Tests** in `application-updates.spec.ts` (use Vitest fake timers, `vi.useFakeTimers()` /
   `vi.advanceTimersByTime()`):
   - The update check runs after the debounce when `visibilitychange` fires with the tab visible
     (stub `document.visibilityState` via `vi.spyOn(document, 'visibilityState', 'get')`).
   - No check when `visibilitychange` fires with the tab hidden.
   - The update check runs after the debounce on `NavigationEnd` (regression coverage for existing
     behaviour, via `Router.navigateByUrl` with a dummy route or by emitting on the router events).
   - A navigation and a visibility event inside the same debounce window cause a single check.
   - Note: the component is created in `beforeEach` before fake timers might be installed, so turn
     fake timers on before `TestBed.createComponent`, or create the fixture inside these tests.
3. **Docs**: update the `### ApplicationUpdates` section of `projects/ng-bricks/README.md` to say
   that it checks for updates after router navigation **and when the tab becomes visible again**,
   with the shared debounce (3 s dev / 10 s otherwise).
4. **Verify**: `npx ng test --watch=false`, `npx ng build` and `npx prettier --check` (the repo
   has a single project and no lint target).
5. **Wrap up**: commit with `LIB-16 Check for application updates when a tab becomes visible again`
   as the first commit's subject, open the PR (feat → minor bump on merge).

## Progress notes

- [x] Branch created from up-to-date `main`; ticket was already "In Progress".
- [x] Plan drafted.
- [x] Step 1 — visibility trigger: `merge(navigationEnd$, tabVisible$)` before the shared
  `debounceTime`. Kept `isDevMode()` evaluated in the constructor (not a module-level constant) so
  its timing is the same as before.
- [x] Step 2 — tests: a new top-level `describe('ApplicationUpdates update checks')` with fake timers
  and a `document.visibilityState` override. The visibility tests fail when the change is reverted.
- [x] Step 3 — README updated.
- [x] Step 4 — 51/51 tests pass, the library builds, and the changed `.ts` files pass Prettier.
  Note: `projects/ng-bricks/README.md` already failed `prettier --check` on `main`; left as is.
- [ ] Step 5 — PR (via `/curtail`).
