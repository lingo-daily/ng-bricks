import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
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

  protected readonly selectedTabIndex = signal(0);
  protected readonly isFileMode = computed(() => this.selectedTabIndex() === 0);

  protected readonly urlFormArray = new FormArray<FormControl<string>>([this.createUrlControl()]);
  protected readonly urlControls = signal(this.urlFormArray.controls);

  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly selectedUrls = signal<string[]>([]);
  protected readonly isDragOver = signal(false);

  readonly submit = output<FileUplinkSubmitPayload>();

  constructor() {
    this.urlFormArray.valueChanges.pipe(takeUntilDestroyed()).subscribe((values) => {
      this.selectedUrls.set(values.map((value) => value.trim()).filter((value) => value.length > 0));
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
