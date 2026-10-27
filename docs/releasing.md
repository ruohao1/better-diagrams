# Release Better Diagrams

The npm package is `@isqrd/better-diagrams`. The executable and plugin names remain `better-diagrams`. Version `0.1.0` is prepared locally; no public publication is implied by the source version or changelog heading.

## Prepare a version

Update the version in `package.json`, the root and package entries of `package-lock.json`, and `plugin.json` together. Move the selected changes from `Unreleased` to `## [VERSION]` in `CHANGELOG.md`. Stable releases use `vVERSION` tags; prerelease tags are rejected by this workflow.

Run the checks from the repository root:

```sh
npm ci
npm run check
npm run build
npm run test:unit
npm run test:browser
node scripts/release.mjs notes v0.1.0
npm publish --dry-run --access public
```

Replace `v0.1.0` with the prepared version. Packing rebuilds the CLI and browser bundles. The tarball includes examples, skill resources, the changelog, and bundled dependency licenses. It excludes tests, source trees, plans, and prototypes.

## First publication

Choose and configure the actual GitHub repository before publishing. Set `repository.type` to `git` and `repository.url` to that repository's Git URL in `package.json`. The release workflow derives the same URL from its GitHub environment.

An npm account with publishing access to the `isqrd` organization must authenticate for the first publication. From the verified checkout:

```sh
npm login
npm pack --json --pack-destination dist > dist/package.json
node scripts/release.mjs publish dist/package.json
```

The publication script checks package/lock/plugin versions, release notes, and the archive's SHA-512 integrity. It publishes only when the version is absent. If an identical artifact is already published, it reports `published: false`. Different bytes under the same version stop the release.

Configure an npm trusted publisher for the package, using the actual GitHub owner/repository and the workflow filename `release.yml`. Allow direct `npm publish`. The workflow uses GitHub-hosted runners, Node 24, npm 12.2.1, and an OIDC token; it does not require a stored npm token. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

Commit the verified release files, create the matching tag, and push it to that GitHub repository. The tag workflow runs the full suite, prepares notes, packs and publishes the artifact, and creates a GitHub release with the tarball. The first tag can reuse the initial npm publication only when the tarball matches exactly. Preserve the same repository metadata and npm toolchain for that bootstrap artifact; different bytes require a new version.

## Updating installed copies

CLI update commands are added with the updater implementation. The package uses npm's stable `latest` channel. Diagram source, drafts, and application code are not part of an npm CLI update.

## Current validation limits

Local checks use disposable npm installations and a loopback registry. They do not publish to npm or run GitHub Actions. Configuring a GitHub remote, initial npm authentication, trusted-publisher setup, and an actual release remain separate deployment steps.
