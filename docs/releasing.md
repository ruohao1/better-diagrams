# Release Better Diagrams

The npm package is [`@isqrd/better-diagrams`](https://www.npmjs.com/package/@isqrd/better-diagrams). Version `0.1.0` is published. The GitHub repository is `ruohao1/better-diagrams`. The executable and plugin names remain `better-diagrams`.

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

Choose and configure the actual GitHub repository before publishing. Set `repository.type` to `git` and `repository.url` to `git+https://github.com/OWNER/REPOSITORY.git`, using the actual owner/repository spelling. The release workflow derives the same URL from its GitHub environment.

An npm account with publishing access to the `isqrd` organization must authenticate and enable 2FA for the first publication. Complete npm's browser authentication challenge when prompted. Use Node 24 and npm 12.2.1, matching the release workflow. From the verified checkout:

```sh
npm login
node scripts/release.mjs notes v0.1.0
npm pack --json --pack-destination dist > dist/package.json
npm publish dist/isqrd-better-diagrams-0.1.0.tgz --access public --ignore-scripts
```

Run the first publish directly so npm can handle interactive authentication. The notes command validates package/lock/plugin versions and the versioned changelog. Use the tarball just produced by npm pack.

The automated publication script checks those versions and notes plus the archive's SHA-512 integrity. It publishes only when the version is absent. If an identical artifact is already published, it reports `published: false`. Different bytes under the same version stop the release.

Immediately before the first new version that CI will publish, configure an npm trusted publisher for the package. Use the actual GitHub owner/repository and the workflow filename `release.yml`. Allow direct `npm publish`. A new publisher configuration must complete a successful publication within two days; reusing an existing bootstrap version does not validate it. The workflow uses GitHub-hosted runners, Node 24, npm 12.2.1, and an OIDC token; it does not require a stored npm token. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

Commit the verified release files, create the matching tag, and push it to that GitHub repository. The tag workflow runs the full suite, prepares notes, packs and publishes the artifact, and creates a GitHub release with the tarball. The first tag can reuse the initial npm publication only when the tarball matches exactly. Preserve the same repository metadata and npm toolchain for that bootstrap artifact; different bytes require a new version.

If a workflow stops after npm publication, preserve the published tag and archive. Fix the workflow on the branch. To finish the GitHub release manually, verify the saved archive against npm's `dist.integrity`, then use `gh release create` with `--verify-tag`, that archive, and the notes for the published version. Do not repack the updated branch as the published version.

## Updating installed copies

```sh
better-diagrams --version
better-diagrams update --check
better-diagrams update
```

The package uses npm's stable `latest` channel. Checks return JSON with `package`, `current`, `latest`, `published`, and `updateAvailable`. A missing first release returns `latest: null` and `published: false`. Invalid metadata, timeouts, and registry failures return an error and a nonzero exit status.

An update runs only for the current npm global installation. Keep custom prefix configuration consistent with that installation, for example `npm_config_prefix=/your/prefix better-diagrams update`. Other copies use their owning installer. The command pins the global prefix, checks the tag, validates the exact release, installs that version with Node engine checks and lifecycle scripts disabled, and verifies the installed version before returning `updated: true`. A changed `latest` tag or prefix configuration does not redirect the selected update. Older versions do not trigger downgrades.

Checks happen only when requested. Diagram source, drafts, and application code are outside the npm CLI installation.

## Current validation limits

Version `0.1.0` was published with interactive 2FA. Its public archive integrity, installation, version output, and update check were verified. Trusted publishing for a future new version and native Windows/macOS updates remain unverified. See [release evidence](../evals/releases-and-updates.md) for the bootstrap CI failure and verification details.
