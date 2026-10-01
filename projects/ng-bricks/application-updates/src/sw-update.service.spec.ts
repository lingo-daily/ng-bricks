import { TestBed } from '@angular/core/testing';
import { SwUpdate, type UnrecoverableStateEvent, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { SwUpdateService } from './sw-update.service';

class FakeSwUpdate {
  isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  readonly unrecoverable = new Subject<UnrecoverableStateEvent>();
  checkForUpdate = vi.fn(() => Promise.resolve(false));
  activateUpdate = vi.fn(() => Promise.resolve(true));
}

describe('SwUpdateService', () => {
  let swUpdate: FakeSwUpdate;

  function createService(): SwUpdateService {
    TestBed.configureTestingModule({
      providers: [{ provide: SwUpdate, useValue: swUpdate }],
    });
    return TestBed.inject(SwUpdateService);
  }

  beforeEach(() => {
    swUpdate = new FakeSwUpdate();
  });

  it('does not check for updates when the service worker is disabled', async () => {
    swUpdate.isEnabled = false;
    const service = createService();

    await service.checkForUpdates();

    expect(service.isEnabled).toBe(false);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });

  it('checks for updates when the service worker is enabled', async () => {
    const service = createService();

    await service.checkForUpdates();

    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('skips a check while another one is in progress', async () => {
    let resolveCheck: (value: boolean) => void = () => undefined;
    swUpdate.checkForUpdate.mockReturnValueOnce(
      new Promise<boolean>((resolve) => (resolveCheck = resolve)),
    );
    const service = createService();

    const firstCheck = service.checkForUpdates();
    await service.checkForUpdates();
    resolveCheck(true);
    await firstCheck;

    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('logs and recovers when the check fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    swUpdate.checkForUpdate.mockRejectedValueOnce(new Error('boom'));
    const service = createService();

    await service.checkForUpdates();
    await service.checkForUpdates();

    expect(error).toHaveBeenCalled();
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('delegates activateUpdate to SwUpdate', async () => {
    const service = createService();

    await expect(service.activateUpdate()).resolves.toBe(true);
    expect(swUpdate.activateUpdate).toHaveBeenCalled();
  });

  it('emits version updates only when the service worker is enabled', () => {
    const events: VersionEvent[] = [];
    const service = createService();
    service.swUpdatesWhenStable$.subscribe((event) => events.push(event));

    swUpdate.versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED', version: { hash: 'h' } });

    expect(events).toHaveLength(1);
  });
});
