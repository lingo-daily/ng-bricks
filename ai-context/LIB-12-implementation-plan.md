# LIB-12 Move theme-showcase to ng-bricks — implementation plan

Ticket: [LIB-12](https://lingo-daily.atlassian.net/browse/LIB-12) (Task)
Branch: `feat/LIB-12-Move-theme-showcase-to-ng-bricks`

> **Living document.** Keep this plan up to date as work proceeds: tick off steps, add progress
> notes, and record decisions (and why) in the [Progress notes](#progress-notes) section, so that
> another agent or developer can pull the branch and continue from where it left off. `/curtail`
> deletes this file before the branch is merged.

## Problem

The `ldpk-theme-showcase` component (a page that renders Angular Material buttons, form fields,
FABs, snackbars, progress indicators, chips and cards so an app's theme can be reviewed) currently
lives as app code in
[`wojciech-tracewski-art/src/app/features/theme-showcase-page/lib/`](https://github.com/lingo-daily/wojciech-tracewski-art/blob/d046a148c0e9d66a365713914a9fb2c1b3139c10/src/app/features/theme-showcase-page/lib/theme-showcase.ts).
It already uses the `ldpk` prefix and imports `APPLICATION_UPDATES_SHOW_DEMO_MESSAGE` from
`@lingo-daily/ng-bricks/application-updates`, so it belongs in this library.

There is also a stale standalone package, `@lingo-daily/theme-showcase` (npm versions 0.0.1–0.0.3,
last modified 2025-12-12), built from the
[`lingo-daily/theme-showcase`](https://github.com/lingo-daily/theme-showcase) repo. The ticket
asks for that package to be unpublished and the repo to be removed. A GitHub code search finds no
references to `theme-showcase` in the org outside `wojciech-tracewski-art`.

### Source files (in `wojciech-tracewski-art`, `origin/main` = ticket commit `d046a14`)

- `lib/theme-showcase.ts`: `ThemeShowcaseComponent`
- `lib/theme-showcase.html`
- `lib/theme-showcase.scss`
- `lib/theme-showcase.spec.ts`: refers to `ThemeShowcase`, which doesn't match the class name, so the spec is currently broken
- `theme-showcase-page.ts/.html/.scss`: app wrapper (`wta-theme-showcase-page`), which stays in the app

### Gaps against the org's Angular rules that need fixing during the move

- `ChangeDetectionStrategy.Eager` → should be `OnPush`; state should use signals (`formClass`,
  `buttonClasses`, `windowMessage`).
- Explicit `standalone: true` (implied by default) and `CommonModule` (only `titlecase` is used, so
  import `TitleCasePipe` instead).
- Uses template-driven `FormsModule`/`[(ngModel)]` → should use Reactive Forms (`FormControl`/`FormArray`).
- `styleUrls` → `styleUrl`; inline `style="width: 62%"` → move into the SCSS.
- `protected readonly window = window` → use `inject(DOCUMENT).defaultView` (SSR-safe), matching
  how `application-updates` is written.
- Naming: other ng-bricks classes drop the `Component` suffix (`FileUplink`, `ApplicationUpdates`),
  so the class becomes `ThemeShowcase`.
- `.example-card` in the SCSS is unused.

## Implementation steps

1. **Create the secondary entry point** `projects/ng-bricks/theme-showcase/`, following the
   pattern of `projects/ng-bricks/file-uplink/` and `projects/ng-bricks/application-updates/`:
   - `ng-package.json` (`"entryFile": "src/public-api.ts"`)
   - `src/public-api.ts` exporting `./theme-showcase`
   - `src/theme-showcase.ts`, `.html`, `.scss` copied from the source, then fixed for the gaps listed above.
2. **Re-export** from the root `projects/ng-bricks/src/public-api.ts`
   (`export * from '@lingo-daily/ng-bricks/theme-showcase';`).
3. **Peer dependencies** in `projects/ng-bricks/package.json`: the component needs
   `@angular/forms` (Reactive Forms), which isn't a peer yet, so add it (`^22.0.0`). All the Material
   modules it uses come from `@angular/material`, which is already a peer.
4. **Write a spec** `src/theme-showcase.spec.ts` in the style of `file-uplink.spec.ts`
   (`provideNoopAnimations()`, `await fixture.whenStable()`). Cover: the component renders; adding a
   button class adds a row; the snackbar opens with the given panel class; "Post" calls
   `postMessage` with the current message.
5. **Document** it in `projects/ng-bricks/README.md`: add a row to the entry-point table and a
   short `### ThemeShowcase` usage section (selector `ldpk-theme-showcase`, import from
   `@lingo-daily/ng-bricks/theme-showcase`, intended for a lazy route).
6. **Verify**: `npm run build` (ng-packagr builds every entry point) and `npm test`.
7. **Open the PR** via `/curtail`. Merging the `feat/*` PR bumps the minor version and publishes
   automatically.

### Follow-ups outside this repo (confirm with the user before doing any of them)

8. **`wojciech-tracewski-art`**: after the new ng-bricks version is published, bump
   `@lingo-daily/ng-bricks`, change `theme-showcase-page.ts` to import `ThemeShowcase` from
   `@lingo-daily/ng-bricks/theme-showcase`, and delete `src/app/features/theme-showcase-page/lib/`.
   This needs its own branch and PR in that repo.
9. **Unpublish `@lingo-daily/theme-showcase`** from npm. npm only allows unpublishing a package
   that is more than 72 hours old if it has no dependents, low downloads and a single owner.
   Otherwise, fall back to `npm deprecate @lingo-daily/theme-showcase "Moved to @lingo-daily/ng-bricks/theme-showcase"`.
   This can't be undone, so the user has to confirm it.
10. **Remove the `lingo-daily/theme-showcase` repo**. Ask the user whether to delete or archive it.
    This is destructive, so the user has to confirm it.

## Open questions

- Should step 8 (updating the consumer app) be done as part of this ticket, or tracked separately?
- For step 10, delete the repo or archive it?

## Progress notes

- 2026-10-05: Branch created and plan drafted. Changed the ticket type from Bug to Task and moved its
  status to In Progress. No code changes yet.
