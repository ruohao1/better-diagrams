# Releases and CLI Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prepare `@isqrd/better-diagrams` releases and working CLI update commands.

**Architecture:** Keep source generation and browser behavior intact. Add release validation and publication scripts, and a small CLI update module that delegates registry and installation work to npm.

**Tech Stack:** Node >=22.18.0, TypeScript, npm, bundled semver, GitHub Actions, existing Playwright checks.

**Spec:** `docs/releases-and-updates.md`

## Global Constraints

- Package: `@isqrd/better-diagrams`; executable/plugin: `better-diagrams`; first version: `0.1.0`.
- Preserve current source versions, browser behavior, and `diagram-authoring` skill identity.
- Explicit checks and updates; no background network or installs during diagram commands.
- Keep plans with implementation; leave `docs/superpowers/` ignored.
- Install and update only in disposable prefixes during verification. Do not publish publicly.

## Review Focus

1. Scoped identity and global paths must refer to our package, including an installed CLI launched through its symlink.
2. Registry failures and malformed or prerelease metadata must not trigger an install or a downgrade.
3. Local/plugin/npx invocations must not overwrite an unrelated npm global installation.
4. An incompatible Node engine or failed install must not be reported as an updated CLI.
5. Release retries and bootstrap publication must not replace an existing version with different bytes.

---

### Task 1: Scope the package and prepare verified releases

**Files:** Modify `package.json`, `package-lock.json`, `test/package.test.ts`, `CHANGELOG.md`, `README.md`; create `scripts/release.mjs`, `test/release.test.ts`, `.github/workflows/release.yml`, `docs/releasing.md`.

**Interfaces:** Consume existing build and package tests. Produce scoped metadata, versioned changelog notes, a release validator, and integrity-checked publication for Task 2's final artifact.

- [x] **Step 1: Write failing release/package tests.** Validate that the packed package installs at `lib/node_modules/@isqrd/better-diagrams`, retains the executable/plugin identities, includes the changelog, and excludes source/test/planning trees. Execute release validation against a fixture: `v0.1.0` succeeds and returns its notes; wrong tag, divergent lock/plugin versions, missing notes, and a prerelease stable tag fail. Exercise publication with a local registry and controlled npm boundary: missing version publishes, matching integrity skips, different integrity and registry failures reject.
- [x] **Step 2: Run** `node --test test/release.test.ts test/package.test.ts`. Expected: FAIL on missing release script or old package identity.
- [x] **Step 3: Implement** scoped metadata and pinned bundled semver. Keep plugin identity unscoped. Rebuild before packing. Implement release validation/notes and exact-integrity reuse. Add the fully checked tag workflow and first-publication/trusted-publisher instructions; do not embed a guessed repository owner.
- [x] **Step 4: Run** `npm run check && npm run build && node --test test/release.test.ts test/package.test.ts`. Expected: PASS, including offline installed examples.
- [x] **Step 5: Commit** as `feat: prepare scoped npm releases`.

### Task 2: Add version discovery and explicit updates

**Files:** Create `src/updates.ts`, `test/updates.test.ts`; modify `src/cli.ts`, `tsconfig.json`, `test/cli.test.ts`, `test/package.test.ts`, `README.md`, `CHANGELOG.md`, `docs/releasing.md`.

**Interfaces:** Consume Task 1's name/version and tarball. Export `checkForUpdate()` and `updateInstallation()` from the CLI update module; `runCli` dispatches the new commands and preserves current JSON/error conventions.

- [x] **Step 1: Write failing CLI/update tests.** `--version` equals the packaged version offline. A disposable local registry drives current, newer, older, unpublished, malformed, prerelease, and failed checks. A real npm global installation updates to a checked fixture version and its next invocation reports that version. An incompatible engine is rejected. Checkout invocations leave the disposable global copy unchanged. Reject invalid command arguments before side effects.
- [x] **Step 2: Run** `npm run build && node --test test/cli.test.ts test/updates.test.ts`. Expected: FAIL on absent commands/module.
- [x] **Step 3: Implement** embedded metadata, strict semver validation, bounded npm checks, current-global-copy verification, exact-version installation with engine checks and no package lifecycle scripts, and installed-version verification. Update help and release/update instructions.
- [x] **Step 4: Run** `npm run check && npm run build && npm run test:unit && npm run test:browser` and `npm publish --dry-run --access public`. Expected: all exit 0, with no public publication. Record the live unpublished response and platform/authentication limits.
- [x] **Step 5: Commit** as `feat: check and install CLI updates explicitly`.

## Final verification

Execute natively and keep RED/GREEN evidence in the scratch ledger. Request one fresh whole-change review after both tasks, then fix important findings with regressions in one pass. Keep the implementation branch and report the publisher setup needed for the first actual release.
