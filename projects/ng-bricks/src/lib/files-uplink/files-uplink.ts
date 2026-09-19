import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';

export interface FilesUplinkSubmitPayload {
  urls?: string[];
  files?: File[];
}

@Component({
  imports: [MatTabsModule],
  selector: 'ldpk-files-uplink',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './files-uplink.scss',
  templateUrl: './files-uplink.html',
})
export class FilesUplink {
  readonly fileTabLabel = input('File');
  readonly urlTabLabel = input('URL');

  protected readonly selectedTabIndex = signal(0);
  protected readonly isFileMode = computed(() => this.selectedTabIndex() === 0);

  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly selectedUrls = signal<string[]>([]);

  readonly submit = output<FilesUplinkSubmitPayload>();

  clear(): void {
    this.selectedFiles.set([]);
    this.selectedUrls.set([]);
  }
}
