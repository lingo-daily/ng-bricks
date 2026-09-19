import { Component, output, signal } from '@angular/core';

export interface FilesUplinkSubmitPayload {
  urls?: string[];
  files?: File[];
}

@Component({
  imports: [],
  selector: 'ldpk-files-uplink',
  styleUrl: './files-uplink.scss',
  templateUrl: './files-uplink.html',
})
export class FilesUplink {
  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly selectedUrls = signal<string[]>([]);

  readonly submit = output<FilesUplinkSubmitPayload>();

  clear(): void {
    this.selectedFiles.set([]);
    this.selectedUrls.set([]);
  }
}
