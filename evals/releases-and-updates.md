# Release and update verification

Observed on 2026-10-27 and 2026-10-28 on Linux with Node.js 22.23.1, npm 10.9.8 and 12.2.1, and Google Chrome 155.0.8059.84.

The published package is `@isqrd/better-diagrams@0.1.0`. Its executable and plugin remain `better-diagrams`. The public GitHub repository is `ruohao1/better-diagrams`.

## Results

- Type checks and the build passed.
- The initial complete suite passed with npm 12.2.1: 47 Node tests and 38 Chromium tests. Hosted Check run 40581074291 passed 47 Node tests and 39 Chromium tests after the wider-font regression was added.
- Twelve focused launcher, release, and updater tests passed with npm 10.9.8 after the review fixes.
- `npm publish --dry-run --access public --json` passed with npm 12.2.1. It described `isqrd-better-diagrams-0.1.0.tgz`, containing 20 files. The later public publication used interactive 2FA. npm's public `dist.integrity` matches the verified archive.
- Installation from public npm into a disposable prefix passed. `--version` reported `0.1.0`; `update --check` reported `published: true`, `latest: "0.1.0"`, and `updateAvailable: false`.
- Offline installation of the scoped tarball retained a working executable, embedded version, skill resources, v1/v2 examples, logos, and browser exports. Source/test/planning/prototype trees stayed outside the tarball. Bundled dependency licenses were included.
- Two independent npm 12 packs produced the same SHA-512 integrity. The workflow's repository metadata command preserved the package file byte for byte. The local candidate and verification record are under `dist/release-candidate/`.

## Release tests

Tests execute the release script against disposable source fixtures. A matching tag extracts only that version's notes. Wrong tags, inconsistent lock/plugin versions, missing notes, private packages, and prerelease versions fail validation.

Publication tests run the actual npm client against a loopback registry with a fixture-only token. A missing version receives one publication. The same artifact is reused without another publication. Conflicting remote integrity, registry failures, and modified archive bytes stop publication.

npm 10 emits a pack-result array; npm 12 emits an object keyed by package name. npm 12 also retains one-element arrays in view results. The first npm 12 run failed on these differences. The corrected release and update readers passed with both clients. Release tests also exercise both pack-result shapes explicitly.

## Update tests

Tests install the actual compiled CLI into disposable npm global prefixes. The loopback registry serves controlled release metadata and real packed fixture tarballs.

- Newer, current, older, and unpublished release checks return the expected JSON status.
- An actual npm update installs the checked fixture version. Moving `latest` during lookup does not select the replacement version.
- Current, older, and unpublished releases do not cause installation or downgrade.
- Package lifecycle scripts remain disabled during an update.
- An incompatible Node engine is rejected, and the prior CLI remains usable.
- Checkout invocations and invalid arguments preserve the separate global installation.
- Wrong package names, malformed/prerelease versions, registry failures, and a stalled registry do not install a release.
- Changing npm's configured global prefix during an update originally redirected the install and failed verification. That regression failed before the fix and passed after the checked prefix was pinned; the unrelated prefix stayed untouched.

An earlier malformed-tag test also failed: npm view converted an invalid tag to a synthetic E404, which looked like an unpublished package. Raw dist-tag validation now precedes an exact-version manifest lookup.

## Final review

A fresh reviewer found two important issues and no critical or minor issues. Inherited npm force configuration bypassed engine checks. Standard Windows npm command scripts could not be launched with `execFile('npm', ...)`.

Both fixes have failing-then-passing regressions. Updates now pass `--force=false` explicitly. Release and update commands share a launcher that resolves Windows native executables or runs the module next to a standard `npm.cmd` through Node. Linux tests execute those resolved launchers and verify that paths containing spaces and shell characters remain literal arguments. Missing npm produces `ENOENT`. These tests do not substitute for native Windows execution.

## Limits

The `99.0.0` and `100.0.0` update versions are local fixtures. They were never published publicly. No normal user installation or agent configuration was changed. Authorized npm login stored normal local authentication, and the account owner enabled 2FA in npm's browser interface.

The public GitHub repository now exists. Its first two Check runs passed installation, type checks, and the build, then failed the packaged flowchart smoke test. Diagnostics identified the `Order received` title as too wide for the hosted browser's font. The same failure reproduced locally with DejaVu Sans and generic monospace. The bundled terminal labels are now shorter. The new wider-font regression failed before that fixture change and passed afterward; all 15 affected flowchart and editor tests passed. Fixed node sizes and overflow validation were preserved.

The initial tag release run 40749700635 passed installation, type checks, the build, and 46 of 47 Node tests. The moving-tag fixture counted npm's OIDC request as its first metadata read and changed `latest` before the updater read it. A fake OIDC token against the loopback registry reproduced the failure locally. Advancing the tag only after the dist-tag response fixed that regression. The corrected regression passed with npm 10 and 12; type checks and all 47 Node tests passed with npm 12.2.1. Check CI now uses npm 12.2.1 so it exercises the same OIDC path as release CI.

The published `v0.1.0` tag stays at commit `17cf7c3e11bf34e95ae990d730e7a13d11664247`. Its npm archive is preserved for GitHub release recovery; the branch's later test and documentation fixes do not replace that artifact.

Trusted publishing for a future new version remains unverified. The release workflow selects Node 24; local verification used Node 22.23.1. Windows and macOS self-update behavior was not tested. Diagram rendering and offline exports retain their existing browser checks.
