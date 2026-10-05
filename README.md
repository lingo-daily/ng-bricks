# ng-bricks
Reusable Angular components published as @lingo-daily/ng-bricks

## Releases

Versioning follows the lingo-daily
[release model](https://github.com/lingo-daily/ai-constitution/blob/main/release/Release.md):
merging a `feat/*` or `fix/*` PR makes `release.yml` bump the root `package.json` (minor or patch),
sync it into `projects/ng-bricks/package.json` (`npm run version:sync`), commit
`Release X.Y.Z (#PR)` to `main` and push the tag `X.Y.Z`. Never bump the version by hand.
Publishing to npm stays manual: pull `main`, `npm run build`, then `npm publish` from
`dist/ng-bricks`.
