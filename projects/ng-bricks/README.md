# NgBricks

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.0.

## Components

### FileUplink

`FileUplink` (selector `ldpk-file-uplink`) is a standalone Angular Material component that lets a
user provide one or more files, either by uploading them from their device or by entering URLs. It
shows a two-tab UI (File / URL), a drag-and-drop drop zone, and a thumbnail/media preview when
exactly one file or URL is selected. Showing and hiding the component (e.g. inline vs. in a dialog)
is left to the consumer.

Install and import it from the package:

```bash
npm install @lingo-daily/ng-bricks
```

```typescript
import { Component } from '@angular/core';
import { FileUplink, FileUplinkSubmitPayload } from '@lingo-daily/ng-bricks';

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
