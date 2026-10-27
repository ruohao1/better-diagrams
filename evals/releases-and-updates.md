# Release and update verification

Observed on 2026-10-27 on Linux with Node.js 22.23.1, npm 10.9.8 and 12.2.1, and Google Chrome 155.0.8059.84.

The prepared package is `@isqrd/better-diagrams@0.1.0`. Its executable and plugin remain `better-diagrams`. The user selected `ruohao1/better-diagrams` for GitHub metadata. Configuring a local origin URL does not create or publish that repository.

## Results

- Type checks and the build passed.
- The complete suite passed with npm 12.2.1: 44 Node tests and 38 Chromium tests.
- Fourteen focused CLI, release, packaging, and updater tests passed with npm 10.9.8.
- `npm publish --dry-run --access public --json` passed with npm 12.2.1. It described `isqrd-better-diagrams-0.1.0.tgz`, containing 20 files. It warned that publisher authentication was absent. No public publication occurred.
- Offline installation of the scoped tarball retained a working executable, embedded version, skill resources, v1/v2 examples, logos, and browser exports. Source/test/planning/prototype trees stayed outside the tarball. Bundled dependency licenses were included.

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

## Limits

The `99.0.0` and `100.0.0` update versions are local fixtures. They were never published publicly. No normal user installation, authentication file, or agent configuration was changed.

GitHub Actions, initial npm authentication, trusted-publisher setup, and a public release were not exercised. The workflow selects Node 24; local verification used Node 22.23.1. Windows and macOS self-update behavior was not tested. Diagram rendering and offline exports retain their existing browser checks.
