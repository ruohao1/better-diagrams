# Releases and CLI updates

Use the npm organization supplied by the user: `isqrd`. Publish the package as `@isqrd/better-diagrams`; retain `better-diagrams` as the executable and plugin name. The first prepared version is `0.1.0`. A prepared artifact is not a published release.

## Approach

Use npm for installation and updates, and GitHub releases for the changelog and downloadable tarball. This reuses the existing Node/npm toolchain. GitHub-only downloads would need a separate installation mechanism. Silent self-updating would change installed software during diagram work; the selected default is an explicit check and explicit update.

- `better-diagrams --version` prints the embedded package version offline.
- `better-diagrams update --check` queries the configured npm registry's `latest` channel and returns JSON with current/latest versions, publication state, and update availability.
- `better-diagrams update` installs the exact checked newer version into the current npm global installation. It refuses to replace an unrelated global copy when called from a checkout, local dependency, npx cache, or plugin bundle. It checks the installed version after npm succeeds.
- npm retains registry, authentication, proxy, and global-prefix configuration. Checks have a bounded timeout. Invalid metadata, registry failures, and incompatible Node engines produce errors. A missing first release is reported as unpublished. Older releases never cause a downgrade.
- Checks occur when requested. Diagram build, validation, serving, and offline browser artifacts keep their existing behavior.

Use npm's semantic-version library for strict version validation and ordering. Bundle it into the CLI; do not add consumer runtime dependencies.

## Release contract

`CHANGELOG.md` supplies versioned release notes. Validate the tag against package, lockfile, and plugin versions before publication. Packing rebuilds generated assets. Keep tests, plans, prototypes, and source trees outside the published tarball.

A tag-triggered GitHub workflow runs the complete suite, packs the artifact, publishes through npm trusted publishing, and creates the matching GitHub release. Re-running publication may reuse an existing npm version only when its integrity matches the prepared tarball. Never overwrite a different artifact under the same version.

The first npm publication requires an authenticated organization publisher. Subsequent publications can use the configured GitHub trusted publisher. Repository identity is derived from the GitHub workflow environment. Configure the actual GitHub remote and npm publisher before launching the workflow. Do not publish or create a public repository as part of local verification.

## Acceptance

Run release validation against valid metadata and deliberate tag/version/changelog mismatches. Use a local npm registry fixture and a disposable global prefix to test release detection, an actual npm update, engine rejection, and refusal to update a checkout. Exercise version ordering, malformed metadata, missing publication, and registry errors. Run type checks, build, all native tests, all Chromium tests, and a publish dry run. Record live publication and untested platforms separately.
