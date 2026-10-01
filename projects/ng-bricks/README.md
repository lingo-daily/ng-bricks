# NgBricks

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.0.

## Components

Each component is published as its own secondary entry point:

| Component            | Import from                                  |
| -------------------- | -------------------------------------------- |
| `FileUplink`         | `@lingo-daily/ng-bricks/file-uplink`         |
| `ApplicationUpdates` | `@lingo-daily/ng-bricks/application-updates` |

Import from the entry point rather than the package root. Every component is still re-exported
from `@lingo-daily/ng-bricks` for compatibility, and the root just re-exports the entry points, so
either way bundlers only include the components you use.

The reason is lazy loading: each entry point is a separate module, so a component and its Angular
Material dependencies go into the chunk of the route that uses it. For example, an app can use
`ApplicationUpdates` in its root component and `FileUplink` on a lazy route, and `FileUplink`'s
tabs, chips and form fields stay out of the initial bundle.

### FileUplink

`FileUplink` (selector `ldpk-file-uplink`) is a standalone Angular Material component that lets a
user provide one or more files, either by uploading them from their device or by entering URLs. It
shows a two-tab UI (File / URL), a drag-and-drop drop zone, and a thumbnail/media preview when
exactly one file or URL is selected. Showing and hiding the component (e.g. inline vs. in a dialog)
is left to the consumer.

Install the package and import the component from its entry point:

```bash
npm install @lingo-daily/ng-bricks
```

```typescript
import { Component } from '@angular/core';
import { FileUplink, FileUplinkSubmitPayload } from '@lingo-daily/ng-bricks/file-uplink';

@Component({
  selector: 'app-avatar-picker',
  imports: [FileUplink],
  template: `
    <ldpk-file-uplink
      [multiple]="false"
      accept="image/*"
      (submit)="onSubmit($event)"
    />
  `,
})
export class AvatarPicker {
  onSubmit(payload: FileUplinkSubmitPayload): void {
    // payload is { files: File[] } or { urls: string[] }, depending on the active tab
  }
}
```

#### Inputs

| Input                   | Type      | Default                            | Description                                                             |
| ------------------------ | --------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `multiple`                | `boolean` | `false`                             | Allow selecting/adding more than one file or URL.                        |
| `accept`                  | `string`  | `''`                                | Forwarded to the native file input's `accept` attribute.                 |
| `fileTabLabel`             | `string`  | `'File'`                            | Label for the file tab.                                                  |
| `urlTabLabel`              | `string`  | `'URL'`                             | Label for the URL tab.                                                   |
| `urlInputLabel`            | `string`  | `'URL'`                             | Label for each URL input field.                                          |
| `invalidUrlErrorLabel`     | `string`  | `'Please enter a valid URL.'`       | Error shown under a URL field that fails validation.                     |
| `addUrlButtonLabel`        | `string`  | `'Add another URL'`                 | Label for the button that adds another URL row (shown only if `multiple`).|
| `removeUrlButtonLabel`     | `string`  | `'Remove URL'`                      | `aria-label` for the button that removes a URL row.                      |
| `dropZoneLabel`            | `string`  | `'Drag files here or click to browse'` | Text shown inside the file drop zone.                                 |
| `selectedFilesLabel`       | `string`  | `'Selected files'`                  | `aria-label` for the chip list of selected files.                        |
| `previewAltLabel`          | `string`  | `'Preview'`                         | `alt` text for the image preview.                                        |
| `submitButtonLabel`        | `string`  | `'Submit'`                          | Label for the submit button.                                             |

All labels are plain inputs so i18n stays outside the component.

#### Outputs

| Output           | Payload                 | When it fires                                                              |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------- |
| `submit`            | `FileUplinkSubmitPayload` | The user clicks the submit button (disabled until there is a valid selection). |
| `selectionChange`   | `FileUplinkSubmitPayload` | The current file/URL selection changes, before submission.                    |

`FileUplinkSubmitPayload` is:

```typescript
interface FileUplinkSubmitPayload {
  urls?: string[];
  files?: File[];
}
```

Only one of `urls`/`files` is populated at a time, matching whichever tab (File or URL) is active.
When exactly one file or URL is selected and it looks like an image, audio, or video file, a preview
is rendered above the submit button. Uploading the selected files/URLs elsewhere (e.g. to a server)
is the consumer's responsibility.

### ApplicationUpdates

`ApplicationUpdates` (selector `ldpk-application-updates`) is a standalone Angular Material card
that tells the user a new version of the app has been deployed. It listens for the service worker's
`VERSION_READY` event, shows the installed ("yours") and deployed ("ours") versions, and offers a
**refresh** button (activates the update and reloads the page) and a **later** button (hides the
card). It also checks for updates after router navigation (debounced: 3 s in dev mode, 10 s
otherwise). It does nothing during server-side rendering.

The component applies no positioning, layout or width to its host element — where it appears and
how wide it is are up to the app (see [Recommended styling](#recommended-styling)).

#### Prerequisites

- The app registers the Angular service worker (`provideServiceWorker(...)`) and uses the router.
- `ngsw-config.json` provides `appData` with a `version` (and optionally a `description`), matching
  the exported `LdpkAppData` interface:

  ```json
  {
    "appData": {
      "version": "1.4.2",
      "description": "Faster search"
    }
  }
  ```

#### Usage

```typescript
import { Component } from '@angular/core';
import { ApplicationUpdates } from '@lingo-daily/ng-bricks/application-updates';

@Component({
  selector: 'app-root',
  imports: [ApplicationUpdates],
  template: `<ldpk-application-updates />`,
})
export class App {}
```

#### Recommended styling

The host element is unstyled, so the card sits in the normal document flow and its width follows
its container unless you set one. Style the `ldpk-application-updates` element (or a class on it)
from the consuming app. A width of `20rem` fits the card's content well.

Floating in a corner (the typical setup) — pick the corner with `top`/`bottom` and
`left`/`right`:

```scss
ldpk-application-updates {
  position: fixed;
  bottom: 1rem; // or top: 1rem;
  left: 1rem; // or right: 1rem;
  z-index: 1000; // keep it above app content
  width: 20rem;
  max-width: calc(100vw - 2rem); // stay on screen on narrow viewports
}
```

In the document flow (e.g. inside a sidebar or settings page) — no positioning needed; set a width
or let it fill its container:

```scss
ldpk-application-updates {
  display: block;
  width: 20rem; // omit to fill the container
  max-width: 100%;
}
```

#### Inputs

| Input                | Type      | Default                                         | Description                                                    |
| -------------------- | --------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `autoReload`         | `boolean` | `false`                                         | Activate the update and reload immediately on `VERSION_READY`. |
| `titleLabel`         | `string`  | `'updates are ready to use'`                    | Card title.                                                    |
| `latestVersionLabel` | `string`  | `'ours'`                                        | Label before the deployed version.                             |
| `currentVersionLabel`| `string`  | `'yours'`                                       | Label before the version running in the browser.               |
| `refreshButtonLabel` | `string`  | `'refresh'`                                     | Label for the refresh button.                                  |
| `refreshButtonAppearance` | `MatButtonAppearance` | `'tonal'` | Appearance of the refresh button: `'text'`, `'filled'`, `'elevated'`, `'outlined'` or `'tonal'`. |
| `laterButtonLabel`   | `string`  | `'later'`                                       | Label for the button that hides the card.                      |
| `noDescriptionLabel` | `string`  | `'No description'`                              | Fallback when `appData.description` is missing.                |
| `demoDescription`    | `string`  | `'This is a demo of a version update message'`  | Description used for the demo card.                            |

All labels are plain inputs so i18n stays outside the component.

#### Demo

The card is never shown on init. To preview it without deploying a new version, post the
`LDPK.application-updates.show-demo` window message (exported as
`APPLICATION_UPDATES_SHOW_DEMO_MESSAGE`), e.g. from the browser console:

```javascript
window.postMessage('LDPK.application-updates.show-demo', '*');
```

The demo's current version is read from the `data-version` attribute of the first element that has
one (falling back to `1.0.0`), and the latest version bumps its last segment with a `-demo` suffix.

#### SwUpdateService

`SwUpdateService` (`providedIn: 'root'`) wraps Angular's `SwUpdate` and is exported for apps that
need it directly: `swUpdatesWhenStable$` (version events, or nothing when the service worker is
disabled), `isEnabled`, `checkForUpdates()` (skips overlapping checks and times out after 42 s),
`activateUpdate()` and `reloadPage()`. If the service worker becomes unrecoverable, it reloads the
page after 5 s.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the library, run:

```bash
ng build ng-bricks
```

This command will compile your project, and the build artifacts will be placed in the `dist/` directory.

### Publishing the Library

Once the project is built, you can publish your library by following these steps:

1. Navigate to the `dist` directory:

   ```bash
   cd dist/ng-bricks
   ```

2. Run the `npm publish` command to publish your library to the npm registry:
   ```bash
   npm publish
   ```

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
