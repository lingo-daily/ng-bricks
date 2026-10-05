// Copies the root package.json version into the published library's manifest.
// release.yml bumps the root version and then runs this as `npm run version:sync`.
import { readFileSync, writeFileSync } from 'node:fs';

const LIBRARY_MANIFEST = 'projects/ng-bricks/package.json';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync(LIBRARY_MANIFEST, 'utf8'));
manifest.version = version;
writeFileSync(LIBRARY_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
