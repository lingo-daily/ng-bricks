import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  inject,
  input,
  isDevMode,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type MatButtonAppearance, MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router } from '@angular/router';
import {
  debounceTime,
  filter,
  fromEvent,
  map,
  mergeWith,
  type Observable,
  Subject,
  tap,
} from 'rxjs';
import { SwUpdateService } from './sw-update.service';

/** Window message that makes `ldpk-application-updates` show a demo update card. */
export const APPLICATION_UPDATES_SHOW_DEMO_MESSAGE = 'LDPK.application-updates.show-demo';

const DEFAULT_DEMO_CURRENT_VERSION = '1.0.0';

export interface VersionMessage {
  currentVersion: string;
  latestVersion: string;
  description?: string;
}

/** Shape expected in the service worker's `appData` (`ngsw-config.json`). */
export interface LdpkAppData {
  version: string;
  description?: string;
}

@Component({
  imports: [AsyncPipe, MatButtonModule, MatCardModule, MatIconModule],
  selector: 'ldpk-application-updates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './application-updates.scss',
  templateUrl: './application-updates.html',
})
export class ApplicationUpdates {
  private readonly document = inject(DOCUMENT);
  private readonly swUpdateService = inject(SwUpdateService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly autoReload = input(false);

  readonly titleLabel = input('updates are ready to use');
  readonly latestVersionLabel = input('ours');
  readonly currentVersionLabel = input('yours');
  readonly refreshButtonLabel = input('refresh');
  readonly refreshButtonAppearance = input<MatButtonAppearance>('tonal');
  readonly laterButtonLabel = input('later');
  readonly noDescriptionLabel = input('No description');
  readonly demoDescription = input('This is a demo of a version update message');

  protected readonly shouldShow = signal(false);
  private readonly demoVersionMessage$ = new Subject<VersionMessage>();

  protected readonly versionMessage$: Observable<VersionMessage> =
    this.swUpdateService.swUpdatesWhenStable$.pipe(
      takeUntilDestroyed(),
      filter((event) => event.type === 'VERSION_READY'),
      map((event) => ({
        currentAppData: event.currentVersion.appData as LdpkAppData | undefined,
        latestAppData: event.latestVersion.appData as LdpkAppData | undefined,
      })),
      // A deploy that leaves appData.version unchanged (a chore change or regenerated content)
      // still changes the service worker manifest, but isn't an update worth announcing.
      // Without a version on both sides the versions can't be compared, so the card still shows.
      filter(
        ({ currentAppData, latestAppData }) =>
          currentAppData?.version === undefined ||
          currentAppData.version !== latestAppData?.version,
      ),
      map(({ currentAppData, latestAppData }) => ({
        currentVersion: currentAppData?.version ?? '',
        latestVersion: latestAppData?.version ?? '',
        description: latestAppData?.description || this.noDescriptionLabel(),
      })),
      tap(() => {
        if (this.autoReload()) {
          void this.reload();
        }
      }),
      mergeWith(this.demoVersionMessage$),
      tap(() => this.shouldShow.set(true)),
    );

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    // Check for updates on navigation
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        debounceTime(isDevMode() ? 3_000 : 10_000), // avoid too frequent checks
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.swUpdateService.checkForUpdates());

    fromEvent<MessageEvent>(window, 'message')
      .pipe(
        filter((event) => event.data === APPLICATION_UPDATES_SHOW_DEMO_MESSAGE),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.showDemo());
  }

  async reload(): Promise<void> {
    if (this.swUpdateService.isEnabled) {
      try {
        await this.swUpdateService.activateUpdate();
      } catch (error) {
        console.warn('Failed to activate update:', error);
      }
    }

    if (this.isBrowser) {
      this.swUpdateService.reloadPage();
    }
  }

  hide(): void {
    this.shouldShow.set(false);
  }

  showDemo(): void {
    const currentVersion =
      this.document.querySelector<HTMLElement>('[data-version]')?.dataset['version'] ??
      DEFAULT_DEMO_CURRENT_VERSION;
    const latestVersion = currentVersion
      .split('.')
      .map((segment, index, segments) =>
        index === segments.length - 1 ? `${parseInt(segment, 10) + 1}-demo` : segment,
      )
      .join('.');

    this.demoVersionMessage$.next({
      currentVersion,
      latestVersion,
      description: this.demoDescription(),
    });
  }
}
