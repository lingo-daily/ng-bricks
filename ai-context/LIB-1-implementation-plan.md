# LIB-1 Application Updates — implementation plan

Ticket: [LIB-1](https://lingo-daily.atlassian.net/browse/LIB-1)
Branch: `feat/LIB-1-Application-Updates`

> **Living document.** Keep this plan up to date as work proceeds: tick off steps, add progress
> notes (what's done, what's left) and record decisions made along the way, so another agent or
> developer can pull the branch and continue from where it left off.

## Problem statement

Extract the `ldpk-application-updates` component and its service-worker update service from the
`wojciech-tracewski-art` prototype
([application-updates.component.ts](https://github.com/lingo-daily/wojciech-tracewski-art/blob/main/src/app/shared/application-updates/application-updates.component.ts),
plus `sw-update.service.ts`, template and styles in the same folder) into `@lingo-daily/ng-bricks`
as a reusable package export.

The component shows a Material card when the service worker reports `VERSION_READY`, offering
"refresh" (activate update + reload) and "later" (hide). Requirements from the ticket:

- Ship both the component and the service from the package.
- Subscribe to the window message `LDPK.application-updates.show-demo` to show a demo card
  (ticket text says `LDPK-application-updates-show-demo`; decided to keep the prototype's name).
- Do **not** show the demo on init — only in response to that message.

## Prototype → library differences to apply

- Follow this repo's naming convention (see `FileUplink`): class `ApplicationUpdates`, files
  `application-updates.ts/.html/.scss/.spec.ts`, no `standalone: true`, no `Component` suffix.
- Labels become `input()`s with English defaults instead of `i18n` attributes, so i18n stays
  outside the component (same approach as `FileUplink`, see `projects/ng-bricks/README.md`).
- Keep the prototype's demo message string `LDPK.application-updates.show-demo` (export it as a
  constant).
- Replace the manual `addEventListener`/`ngOnDestroy` with a `fromEvent(window, 'message')`
  subscription using `takeUntilDestroyed()` (browser only).
- Keep the `Observable` + `async` pipe pattern for `versionMessage$` (constitution: avoid
  converting Observables to signals).
- Drop the prototype's `console.log` noise in the service, or gate it behind `isDevMode()`.

## Implementation steps

1. **Peer dependencies.** Add `@angular/service-worker` and `@angular/router` (`^22.0.0`) to
   `projects/ng-bricks/package.json` `peerDependencies`; add `@angular/service-worker` to the root
   `package.json` (dev) so the library builds and tests run.
2. **Service** — `projects/ng-bricks/src/lib/application-updates/sw-update.service.ts`
   (`SwUpdateService`, `providedIn: 'root'`, `inject(SwUpdate)`): port `swUpdatesWhenStable$`,
   `isEnabled`, `activateUpdate()`, `checkForUpdates()` (with timeout race and in-progress guard),
   and the `unrecoverable` → delayed reload handler. Guard `window` access for SSR.
3. **Component** — `projects/ng-bricks/src/lib/application-updates/application-updates.ts`
   (selector `ldpk-application-updates`, OnPush):
   - Inputs: `autoReload` (default `false`) and labels: `titleLabel` ("updates are ready to use"),
     `latestVersionLabel` ("ours"), `currentVersionLabel` ("yours"), `refreshButtonLabel`
     ("refresh"), `laterButtonLabel` ("later"), `demoDescription`.
   - Router `NavigationEnd` → debounced `checkForUpdates()` (3 s dev / 10 s prod), browser only.
   - `versionMessage$` from `VERSION_READY` events mapped via `appData` (`LdpkAppData`), merged
     with the demo subject; `shouldShow` signal; `reload()`, `hide()`, `showDemo()` as in the
     prototype (demo version derived from `[data-version]` element).
   - Window `message` listener for `LDPK.application-updates.show-demo` → `showDemo()`. No demo on
     init.
   - Export `VersionMessage`, `LdpkAppData` types and the demo message constant.
4. **Template/styles** — `application-updates.html` / `application-updates.scss`: port the
   Material card markup (`matButton="tonal"`/`"text"`, `mat-icon` refresh) and enter/leave
   animations; replace `i18n` text with label inputs. Use `--mat-sys-*` tokens if any colour is
   needed; no `::ng-deep`.
5. **Public API** — export the component, service and types from
   `projects/ng-bricks/src/public-api.ts`.
6. **Tests** — `application-updates.spec.ts` (vitest, same style as `file-uplink.spec.ts`), with
   `SwUpdate` stubbed (`isEnabled`, `versionUpdates` Subject, `activateUpdate`, `checkForUpdate`,
   `unrecoverable`) and `provideRouter([])`:
   - nothing rendered on init (no demo without the message);
   - posting `LDPK.application-updates.show-demo` shows the card with demo versions;
   - other messages are ignored;
   - a `VERSION_READY` event shows current/latest versions;
   - "later" hides; "refresh" calls `activateUpdate` and reloads (stub reload);
   - `autoReload` triggers reload on `VERSION_READY`.
   Plus a small spec for `SwUpdateService` (disabled SW → no-op, in-progress guard).
7. **Docs** — add an `ApplicationUpdates` section to `projects/ng-bricks/README.md`: prerequisites
   (`provideServiceWorker`, `appData.version`/`description` in `ngsw-config.json`), usage,
   inputs table, and how to trigger the demo
   (`window.postMessage('LDPK.application-updates.show-demo', '*')`).
8. **Verify** — `ng build ng-bricks` and `ng test` pass.

## Decisions

- Demo message string: use the prototype's `LDPK.application-updates.show-demo`, not the
  ticket's `LDPK-application-updates-show-demo` (confirmed by user, 2026-10-01).
- Positioning: keep the prototype's `position: fixed` on `:host` (confirmed by user, 2026-10-01).

## Progress notes

- [x] Step 1 – peer deps: `@angular/router`, `@angular/service-worker`, `rxjs` added as library
  peers; `@angular/service-worker@^22.1.7` added as root devDependency (must match installed
  `@angular/core` exactly).
- [x] Step 2 – service (`sw-update.service.ts`): `console.log`s gated by `isDevMode()`; added
  `reloadPage()` so page reloads go through the service (mockable in component tests); timeout
  timer is cleared after each check.
- [x] Step 3 – component (`application-updates.ts`): window message via `fromEvent` +
  `takeUntilDestroyed`; exported `APPLICATION_UPDATES_SHOW_DEMO_MESSAGE`, `VersionMessage`,
  `LdpkAppData`. Extra label input `noDescriptionLabel`. Demo fallback version is `1.0.0`
  (prototype used an app-specific `1.34.16`).
- [x] Step 4 – template/styles ported; card still doesn't render `description` (same as prototype).
- [x] Step 5 – public API exports.
- [x] Step 6 – tests: `application-updates.spec.ts` (11) and `sw-update.service.spec.ts` (6).
- [x] Step 7 – README section in `projects/ng-bricks/README.md`.
- [x] Step 8 – `ng build ng-bricks` and `ng test` pass (35 tests).

Environment note: the default shell Node is v14; build/test with Node 24
(`~/.nvm/versions/node/v24.21.0`).

Remaining: open PR (`/curtail`).
