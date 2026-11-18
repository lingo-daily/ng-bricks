import { PLATFORM_ID, type Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router, type Routes } from '@angular/router';
import type { VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { APPLICATION_UPDATES_SHOW_DEMO_MESSAGE, ApplicationUpdates } from './application-updates';
import { SwUpdateService } from './sw-update.service';
import { updateCheckDebounce } from './update-check-debounce';

class FakeSwUpdateService {
  readonly swUpdatesWhenStable$ = new Subject<VersionEvent>();
  isEnabled = true;
  activateUpdate = vi.fn(() => Promise.resolve(true));
  reloadPage = vi.fn();
  checkForUpdates = vi.fn(() => Promise.resolve());
}

function versionReadyEvent(currentVersion: string, latestVersion: string): VersionEvent {
  return {
    type: 'VERSION_READY',
    currentVersion: { hash: 'current', appData: { version: currentVersion } },
    latestVersion: { hash: 'latest', appData: { version: latestVersion } },
  };
}

async function configureTestingModule(
  swUpdateService: FakeSwUpdateService,
  routes: Routes = [],
  extraProviders: Provider[] = [],
): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [ApplicationUpdates],
    providers: [
      provideNoopAnimations(),
      provideRouter(routes),
      { provide: SwUpdateService, useValue: swUpdateService },
      ...extraProviders,
    ],
  }).compileComponents();
}

describe('ApplicationUpdates', () => {
  let component: ApplicationUpdates;
  let fixture: ComponentFixture<ApplicationUpdates>;
  let swUpdateService: FakeSwUpdateService;

  beforeEach(async () => {
    swUpdateService = new FakeSwUpdateService();
    await configureTestingModule(swUpdateService);

    fixture = TestBed.createComponent(ApplicationUpdates);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  function card(): HTMLElement | null {
    return fixture.nativeElement.querySelector('mat-card');
  }

  function findButtonByText(text: string): HTMLButtonElement {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    const button = buttons.find((candidate) => candidate.textContent?.trim().includes(text));
    if (!button) {
      throw new Error(`Button "${text}" not found`);
    }
    return button;
  }

  async function postWindowMessage(data: unknown): Promise<void> {
    window.dispatchEvent(new MessageEvent('message', { data }));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function emitVersionReady(currentVersion: string, latestVersion: string): Promise<void> {
    swUpdateService.swUpdatesWhenStable$.next(versionReadyEvent(currentVersion, latestVersion));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('does not show anything on init', () => {
    expect(card()).toBeNull();
  });

  it('shows a demo card when the show-demo window message is posted', async () => {
    await postWindowMessage(APPLICATION_UPDATES_SHOW_DEMO_MESSAGE);

    expect(card()).not.toBeNull();
    expect(card()?.textContent).toContain('v1.0.1-demo');
    expect(card()?.textContent).toContain('v1.0.0');
  });

  it('derives demo versions from a [data-version] element', async () => {
    const versionElement = document.createElement('div');
    versionElement.dataset['version'] = '2.3.4';
    document.body.appendChild(versionElement);

    try {
      await postWindowMessage(APPLICATION_UPDATES_SHOW_DEMO_MESSAGE);

      expect(card()?.textContent).toContain('v2.3.5-demo');
      expect(card()?.textContent).toContain('v2.3.4');
    } finally {
      versionElement.remove();
    }
  });

  it('ignores other window messages', async () => {
    await postWindowMessage('LDPK-application-updates-show-demo');

    expect(card()).toBeNull();
  });

  it('shows current and latest versions when a new version is ready', async () => {
    await emitVersionReady('1.2.0', '1.3.0');

    expect(card()?.textContent).toContain('ours: v1.3.0');
    expect(card()?.textContent).toContain('yours: v1.2.0');
    expect(swUpdateService.reloadPage).not.toHaveBeenCalled();
  });

  it('ignores VERSION_READY when the version has not changed', async () => {
    await emitVersionReady('1.2.0', '1.2.0');

    expect(card()).toBeNull();
    expect(swUpdateService.activateUpdate).not.toHaveBeenCalled();
    expect(swUpdateService.reloadPage).not.toHaveBeenCalled();
  });

  it('does not auto-reload on VERSION_READY when the version has not changed', async () => {
    fixture.componentRef.setInput('autoReload', true);
    await emitVersionReady('1.2.0', '1.2.0');

    expect(swUpdateService.activateUpdate).not.toHaveBeenCalled();
    expect(swUpdateService.reloadPage).not.toHaveBeenCalled();
  });

  it('shows a later version change after ignoring an unchanged one', async () => {
    await emitVersionReady('1.2.0', '1.2.0');
    await emitVersionReady('1.2.0', '1.3.0');

    expect(card()?.textContent).toContain('ours: v1.3.0');
  });

  it('shows the card when appData has no version to compare', async () => {
    swUpdateService.swUpdatesWhenStable$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'current' },
      latestVersion: { hash: 'latest' },
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(card()).not.toBeNull();
  });

  it('ignores version events other than VERSION_READY', async () => {
    swUpdateService.swUpdatesWhenStable$.next({
      type: 'NO_NEW_VERSION_DETECTED',
      version: { hash: 'h' },
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(card()).toBeNull();
  });

  it('hides the card when "later" is clicked', async () => {
    await emitVersionReady('1.2.0', '1.3.0');

    findButtonByText('later').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(card()).toBeNull();
  });

  it('activates the update and reloads when "refresh" is clicked', async () => {
    await emitVersionReady('1.2.0', '1.3.0');

    findButtonByText('refresh').click();
    await fixture.whenStable();

    expect(swUpdateService.activateUpdate).toHaveBeenCalled();
    expect(swUpdateService.reloadPage).toHaveBeenCalled();
  });

  it('still reloads when activating the update fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    swUpdateService.activateUpdate.mockRejectedValueOnce(new Error('boom'));

    await component.reload();

    expect(warn).toHaveBeenCalled();
    expect(swUpdateService.reloadPage).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reloads automatically on VERSION_READY when autoReload is set', async () => {
    fixture.componentRef.setInput('autoReload', true);
    await emitVersionReady('1.2.0', '1.3.0');

    expect(swUpdateService.activateUpdate).toHaveBeenCalled();
    expect(swUpdateService.reloadPage).toHaveBeenCalled();
  });

  it('renders custom labels', async () => {
    fixture.componentRef.setInput('titleLabel', 'Nowa wersja');
    fixture.componentRef.setInput('refreshButtonLabel', 'odśwież');
    await postWindowMessage(APPLICATION_UPDATES_SHOW_DEMO_MESSAGE);

    expect(card()?.textContent).toContain('Nowa wersja');
    expect(findButtonByText('odśwież')).toBeTruthy();
  });

  it('uses the tonal appearance for the refresh button by default', async () => {
    await postWindowMessage(APPLICATION_UPDATES_SHOW_DEMO_MESSAGE);

    expect(findButtonByText('refresh').classList).toContain('mat-tonal-button');
  });

  it('applies a custom refresh button appearance', async () => {
    fixture.componentRef.setInput('refreshButtonAppearance', 'outlined');
    await postWindowMessage(APPLICATION_UPDATES_SHOW_DEMO_MESSAGE);

    expect(findButtonByText('refresh').classList).toContain('mdc-button--outlined');
  });
});

describe('ApplicationUpdates update checks', () => {
  const DEBOUNCE = updateCheckDebounce();

  let swUpdateService: FakeSwUpdateService;
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    swUpdateService = new FakeSwUpdateService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function createComponent(
    extraProviders: Provider[] = [],
  ): Promise<ComponentFixture<ApplicationUpdates>> {
    await configureTestingModule(swUpdateService, [{ path: '**', children: [] }], extraProviders);
    return TestBed.createComponent(ApplicationUpdates);
  }

  function showTab(): void {
    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function hideTab(): void {
    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  }

  async function navigate(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
  }

  it('checks for updates after the debounce when the tab becomes visible', async () => {
    await createComponent();
    showTab();

    vi.advanceTimersByTime(DEBOUNCE - 1);
    expect(swUpdateService.checkForUpdates).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(swUpdateService.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('does not check for updates when the tab is hidden', async () => {
    await createComponent();
    hideTab();

    vi.advanceTimersByTime(DEBOUNCE);
    expect(swUpdateService.checkForUpdates).not.toHaveBeenCalled();
  });

  it('checks for updates after the debounce on navigation', async () => {
    await createComponent();
    await navigate('/a');

    vi.advanceTimersByTime(DEBOUNCE - 1);
    expect(swUpdateService.checkForUpdates).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(swUpdateService.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('checks once when navigation and the tab becoming visible share a debounce window', async () => {
    await createComponent();
    showTab();
    vi.advanceTimersByTime(DEBOUNCE / 2);
    await navigate('/a');

    vi.advanceTimersByTime(DEBOUNCE);
    expect(swUpdateService.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('checks again for a later trigger outside the debounce window', async () => {
    await createComponent();
    await navigate('/a');
    vi.advanceTimersByTime(DEBOUNCE);
    hideTab();
    showTab();
    vi.advanceTimersByTime(DEBOUNCE);

    expect(swUpdateService.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending check and stops listening when destroyed', async () => {
    const fixture = await createComponent();
    showTab();
    fixture.destroy();

    vi.advanceTimersByTime(DEBOUNCE);
    showTab();
    await navigate('/a');
    vi.advanceTimersByTime(DEBOUNCE);

    expect(swUpdateService.checkForUpdates).not.toHaveBeenCalled();
  });

  it('does not check for updates during server-side rendering', async () => {
    await createComponent([{ provide: PLATFORM_ID, useValue: 'server' }]);
    showTab();
    await navigate('/a');

    vi.advanceTimersByTime(DEBOUNCE);
    expect(swUpdateService.checkForUpdates).not.toHaveBeenCalled();
  });
});
