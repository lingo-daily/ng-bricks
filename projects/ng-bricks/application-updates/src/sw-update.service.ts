import { DOCUMENT, inject, Injectable, isDevMode, signal } from '@angular/core';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { NEVER, type Observable } from 'rxjs';

const CHECK_TIMEOUT = 42_000;
const UNRECOVERABLE_RELOAD_DELAY = 5_000;

type CheckResult = 'timeout' | 'uptodate' | 'available';

function log(message: string): void {
  if (isDevMode()) {
    console.log(message);
  }
}

@Injectable({
  providedIn: 'root',
})
export class SwUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);
  private readonly isCheckingForUpdates = signal(false);

  readonly swUpdatesWhenStable$: Observable<VersionEvent> = this.swUpdate.isEnabled
    ? this.swUpdate.versionUpdates
    : NEVER;

  get isEnabled(): boolean {
    return this.swUpdate.isEnabled;
  }

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }
    this.swUpdate.unrecoverable.subscribe((event) => {
      console.error('Service worker is unrecoverable:', event.reason);
      // Force a page reload to clean the slate
      setTimeout(() => this.reloadPage(), UNRECOVERABLE_RELOAD_DELAY);
    });
  }

  activateUpdate(): Promise<boolean> {
    return this.swUpdate.activateUpdate();
  }

  reloadPage(): void {
    this.document.defaultView?.location.reload();
  }

  async checkForUpdates(): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      log('Service Worker updates are not enabled.');
      return;
    }

    if (this.isCheckingForUpdates()) {
      log('Update check already in progress...');
      return;
    }

    this.isCheckingForUpdates.set(true);
    log('Checking for updates...');

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<CheckResult>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), CHECK_TIMEOUT);
      });

      const checkResult = await Promise.race([
        this.swUpdate
          .checkForUpdate()
          .then((result): CheckResult => (result ? 'available' : 'uptodate')),
        timeout,
      ]);

      switch (checkResult) {
        case 'available':
          log('A new version is available.');
          break;
        case 'uptodate':
          log('Already on the latest version.');
          break;
        case 'timeout':
          log(
            `Timed out checking for new version after ${Math.round(CHECK_TIMEOUT / 1000)} seconds.`,
          );
          break;
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    } finally {
      clearTimeout(timeoutId);
      this.isCheckingForUpdates.set(false);
    }
  }
}
