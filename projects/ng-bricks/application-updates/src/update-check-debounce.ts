import { isDevMode } from '@angular/core';

/**
 * Delay after the last navigation or tab-visible event before checking for updates.
 * A function, so dev mode is read when the component is created rather than at module load.
 * Internal: not exported from the public API.
 */
export function updateCheckDebounce(): number {
  return isDevMode() ? 3_000 : 10_000;
}
