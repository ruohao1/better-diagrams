# Self-contained skill delivery implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this task. Keep this plan with its implementation changes.

**Goal:** Install a working Better Diagrams skill through the shared `skills` installer, with no separate CLI installation.

**Architecture:** Keep `skills/diagram-authoring/` as the installable unit. Generate copies of the existing CLI, viewer, editor, and dependency licenses inside that folder. Commit these generated files so installation from GitHub works directly. Keep the existing npm CLI paths and produce a release ZIP from the same skill folder.

**Tech stack:** Node.js, the existing esbuild build, the shared `skills` installer, and the standard `zip`/`unzip` build tools.

**Spec:** The user approved Archify's delivery model: one complete skill in this repository, shared agent installation, and retained npm CLI distribution.

## Constraints and choices

- Keep the skill name `diagram-authoring` and the package name `@isqrd/better-diagrams`.
- Runtime support stays at Node.js `>=22.18.0`. The shared installer's current Node requirement is separate.
- Reuse the existing bundles. Generated copies add package size but preserve existing npm entry paths and updater behavior.
- The skill invokes its own `bin/cli.mjs` through Node, so it does not depend on a command on PATH.
- Include the existing ELK and semver licenses with the skill.
- The ZIP includes only Git-tracked skill files and rejects missing runtime files and symbolic links.
- Keep `docs/superpowers/` ignored and untouched.
- Keep the published `v0.1.0` tag and npm archive unchanged. New delivery files remain unreleased until a new version is published.
- Use the existing workspace on a new feature branch; the user asked to continue implementation.

## Alternatives

The accepted approach reuses `skills` and distributes a complete folder. A custom skill installer would duplicate the shared installer. A thin skill that downloads the CLI when invoked would retain a network prerequisite during use. Moving the npm executable into the skill would change existing paths and updater assumptions; generated copies avoid that migration.

## Review focus

- A copied skill must work outside the checkout, including paths with spaces.
- The skill must carry both viewer and editor bundles, not just the CLI.
- The archive must not retain files from an older build or include repository-only material.
- npm installation and self-update must retain their current behavior.
- Checked-in generated files must match a fresh build.

## Task 1: Complete the installable skill

**Files:** `scripts/build.mjs`, `scripts/package-skill.mjs`, `package.json`, `skills/diagram-authoring/`, `test/package.test.ts`, `.github/workflows/check.yml`, `.github/workflows/release.yml`, `README.md`, `docs/releasing.md`, `CHANGELOG.md`.

- [x] Add an integration test that copies only the skill folder, then runs its CLI and opens an offline artifact. Run it and observe the missing bundled CLI failure.
- [x] Copy the existing generated runtime and licenses into the skill during the build. Update the skill's command paths. Run the isolated test again.
- [x] Test a ZIP built from the skill, including replacement of an older archive. Add `npm run pack:skill` using the standard ZIP tool and verify the extracted copy.
- [x] Require the bundled runtime in the npm package test. Preserve the existing npm executable, examples, and updater tests.
- [x] Check generated-file freshness in CI and attach the skill ZIP in the release workflow.
- [x] Run the actual shared installer into a disposable project, then use the installed skill to check/build a diagram without a global CLI.
- [x] Update installation/release documentation and the Unreleased changelog. Validate the skill metadata.
- [x] Run type checks, the complete Node suite, and the existing browser suite. Obtain one fresh final review, fix material findings, and keep the plan with the implementation.
