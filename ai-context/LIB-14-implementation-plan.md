# LIB-14 — [ApplicationUpdates] Update card shown when the version has not changed

Ticket: https://lingo-daily.atlassian.net/browse/LIB-14

> **Living document.** Keep this plan up to date as work proceeds: tick off finished steps, note
> what's left and record any decisions made along the way, so that another agent or developer can
> pull the branch and continue from where it left off.

## Problem

`ldpk-application-updates` reacts to every service worker `VERSION_READY` event. Angular fires that
event whenever the hash of the deployed `ngsw.json` changes. That includes deploys that don't change
`appData.version`, such as `chore` merges and SSG content regeneration. Consuming apps (e.g.
dashtickguitars, which redeploys on every content edit) therefore show a card reading "ours: v1.13.1 /
yours: v1.13.1". With `autoReload` on, users get reloaded silently instead.

When the current and latest `appData.version` are equal, the component must do nothing: no card, no
`activateUpdate()`, no reload. The new service worker version is still picked up by the browser the
next time the page loads normally.

## Implementation steps

1. **Filter same-version events** in `projects/ng-bricks/application-updates/src/application-updates.ts`.
   Add a `filter` to `versionMessage$` after the `map` and before the `autoReload` `tap`. It drops
   messages where `currentVersion === latestVersion`. The filter must come before `mergeWith(this.demoVersionMessage$)`
   so the demo path is unaffected. Since it also sits before both `tap`s, no reload is triggered and
   `shouldShow` is never set.
   - Decision (confirmed by the user): compare only when both versions are defined. If an app has no
     `appData.version`, both sides are `undefined`, and treating that as "unchanged" would suppress
     every update for apps that don't follow the documented `appData` contract. Recommended:
     `currentVersion === undefined || currentVersion !== latestVersion` keeps the card. In other
     words, ignore only defined, equal versions.
2. **Unit tests** in `projects/ng-bricks/application-updates/src/application-updates.spec.ts`, using
   the existing `emitVersionReady` helper:
   - `VERSION_READY` with equal versions (`'1.2.0'`, `'1.2.0'`): no card, `activateUpdate` and
     `reloadPage` not called.
   - The same with `autoReload` set to `true`: no activation, no reload.
   - A same-version event followed by a different-version one still shows the card. This guards
     against the stream completing or erroring.
   - Existing tests already cover differing versions, the demo card and auto-reload on a real
     version change. Keep them green.
3. **README** (`projects/ng-bricks/README.md`, Application Updates section around lines 103–204):
   state that `VERSION_READY` events whose `appData.version` hasn't changed (chore deploys, content
   regeneration) are ignored. Update the `autoReload` row to say "on a version change".
4. **Verify**: run the library's unit tests and lint, then build (`ng build ng-bricks`).
5. **Release**: this is a `fix/*` branch, so merging bumps the patch version automatically (per
   ai-constitution Releases). Then bump `@lingo-daily/ng-bricks` in dashtickguitars in a separate
   PR there.

## Progress

- [x] Ticket created (LIB-14) and moved to In Progress
- [x] Branch `fix/LIB-14-ApplicationUpdates-Update-card-shown-when-the-version-has-not-changed` created
      (brackets dropped from the summary: git refs can't contain `[`)
- [x] Steps 1–4: same-version filter added before the auto-reload `tap`, on the raw `appData`
      (before mapping to `VersionMessage`, whose public type keeps string versions); `appData`
      access made null-safe; 4 new specs; README updated. 46/46 tests pass, `ng build ng-bricks`
      succeeds. The repo has no lint target configured.
- [ ] PR opened and merged
- [ ] dashtickguitars bumped to the released version
