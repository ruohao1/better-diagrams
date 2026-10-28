# Self-contained skill verification

Observed on Linux with Node.js 22.23.1, npm 10.9.8, skills 1.7.4, and Chrome 155.0.8059.84.

## Results

- Type checks passed. All 49 Node tests and 39 browser tests passed.
- The skill-only test first failed because a copied folder had no `bin/cli.mjs`. After bundling the existing CLI, viewer, editor, and licenses, that isolated copy passed version, source checks, HTML generation, and offline modal exploration. Its temporary path included spaces.
- ZIP creation first failed because its script was absent. The extracted archive now runs its own CLI outside the checkout, with no installed dependencies.
- An additional test demonstrated that recursive ZIP creation included an untracked local file. Packaging now selects Git-tracked skill files. Tests cover stale archive replacement, untracked-file exclusion, missing tracked runtime files, and symbolic-link rejection.
- The npm tarball retains its existing CLI paths and includes the complete skill with both dependency licenses. Existing updater tests remain green.
- Fresh builds match the generated runtime staged for Git. CI checks both tracked changes and missing tracked files that appear as untracked build outputs.
- The skill metadata validator passed.

## Shared installer

The real `skills@1.7.4` installer copied `diagram-authoring` into a disposable project's `.agents/skills/` and `.claude/skills/` locations. Telemetry and security-audit requests were disabled. No global skill installation was requested.

The installed CLI passed version, check, and build with npm's registry pointed at an unavailable loopback endpoint. Its local editor loaded in Chromium, saved a changed node label, and updated the disposable source file. Execution through a manually created skill-directory symlink also passed. The installer selected copy mode in this noninteractive agent environment.

## Limits

Local-source installation was exercised with the shared installer. Installation from the published GitHub default branch awaits integration of this feature. The complete bundle and ZIP are Unreleased; the published `v0.1.0` artifacts keep their earlier layout. This work does not publish a new npm version or change that tag.

ZIP production requires Git and the standard `zip` tool; its integration test also requires `unzip`. Native Windows/macOS execution and upload-based hosted-agent environments were not tested. Existing future trusted-publisher setup remains separate from this packaging change.
