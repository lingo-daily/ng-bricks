import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormControl, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';

function urlValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value?.trim();
  if (!value) {
    return null;
  }
  try {
    new URL(value);
    return null;
  } catch {
    return { invalidUrl: true };
  }
}

type PreviewKind = 'image' | 'audio' | 'video';

const PREVIEW_EXTENSIONS: Record<PreviewKind, RegExp> = {
  image: /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i,
  audio: /\.(mp3|wav|ogg|m4a|flac|aac)$/i,
  video: /\.(mp4|webm|mov|ogv|mkv)$/i,
};

function previewKindFromMimeType(mimeType: string): PreviewKind | null {
  const [type] = mimeType.split('/');
  return type === 'image' || type === 'audio' || type === 'video' ? type : null;
}

function previewKindFromUrl(url: string): PreviewKind | null {
  const path = url.split(/[?#]/)[0];
  const kinds = Object.keys(PREVIEW_EXTENSIONS) as PreviewKind[];
  return kinds.find((kind) => PREVIEW_EXTENSIONS[kind].test(path)) ?? null;
}

export interface FileUplinkSubmitPayload {
  urls?: string[];
  files?: File[];
}

@Component({
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, MatTabsModule, ReactiveFormsModule],
  selector: 'ldpk-file-uplink',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './file-uplink.scss',
  templateUrl: './file-uplink.html',
})
export class FileUplink {
  readonly multiple = input(false);

  readonly fileTabLabel = input('File');
  readonly urlTabLabel = input('URL');
  readonly urlInputLabel = input('URL');
  readonly invalidUrlErrorLabel = input('Please enter a valid URL.');
  readonly addUrlButtonLabel = input('Add another URL');
  readonly uploadButtonLabel = input('Upload');
  readonly dropZoneLabel = input('Drag and drop files here');
  readonly previewAltLabel = input('Preview');
  readonly submitButtonLabel = input('Submit');

  protected readonly selectedTabIndex = signal(0);
  protected readonly isFileMode = computed(() => this.selectedTabIndex() === 0);

  protected readonly urlFormArray = new FormArray<FormControl<string>>([this.createUrlControl()]);
  protected readonly urlControls = signal(this.urlFormArray.controls);

  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly selectedUrls = signal<string[]>([]);
  protected readonly isUrlFormValid = signal(this.urlFormArray.valid);
  protected readonly isDragOver = signal(false);

  protected readonly shouldDisableSubmit = computed(() =>
    this.isFileMode()
      ? this.selectedFiles().length === 0
      : this.selectedUrls().length === 0 || !this.isUrlFormValid(),
  );

  protected readonly previewFile = computed(() =>
    this.isFileMode() && this.selectedFiles().length === 1 ? this.selectedFiles()[0] : null,
  );
  protected readonly previewUrl = computed(() =>
    !this.isFileMode() && this.selectedUrls().length === 1 ? this.selectedUrls()[0] : null,
  );
  private readonly previewFileObjectUrl = signal<string | null>(null);

  protected readonly preview = computed<{ kind: PreviewKind; src: string } | null>(() => {
    const url = this.previewUrl();
    if (url !== null) {
      const kind = previewKindFromUrl(url);
      return kind ? { kind, src: url } : null;
    }
    const file = this.previewFile();
    const objectUrl = this.previewFileObjectUrl();
    if (file !== null && objectUrl !== null) {
      const kind = previewKindFromMimeType(file.type);
      return kind ? { kind, src: objectUrl } : null;
    }
    return null;
  });

  readonly submit = output<FileUplinkSubmitPayload>();

  constructor() {
    this.urlFormArray.valueChanges.pipe(takeUntilDestroyed()).subscribe((values) => {
      this.selectedUrls.set(values.map((value) => value.trim()).filter((value) => value.length > 0));
      this.isUrlFormValid.set(this.urlFormArray.valid);
    });

    effect((onCleanup) => {
      const file = this.previewFile();
      if (!file) {
        this.previewFileObjectUrl.set(null);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      this.previewFileObjectUrl.set(objectUrl);
      onCleanup(() => URL.revokeObjectURL(objectUrl));
    });
  }

  protected addUrlControl(): void {
    if (!this.multiple() && this.urlFormArray.length >= 1) {
      return;
    }
    this.urlFormArray.push(this.createUrlControl());
    this.urlControls.set(this.urlFormArray.controls);
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  protected onSubmit(): void {
    if (this.shouldDisableSubmit()) {
      return;
    }
    this.submit.emit(this.isFileMode() ? { files: this.selectedFiles() } : { urls: this.selectedUrls() });
  }

  private addFiles(files: File[]): void {
    if (files.length === 0) {
      return;
    }
    if (this.multiple()) {
      this.selectedFiles.update((existing) => [...existing, ...files]);
    } else {
      this.selectedFiles.set([files[0]]);
    }
  }

  clear(): void {
    this.selectedFiles.set([]);
    this.urlFormArray.clear();
    this.urlFormArray.push(this.createUrlControl());
    this.urlControls.set(this.urlFormArray.controls);
  }

  private createUrlControl(): FormControl<string> {
    return new FormControl('', { nonNullable: true, validators: [urlValidator] });
  }
}
