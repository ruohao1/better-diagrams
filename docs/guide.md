# Usage guide

Better Diagrams is a local compiler, browser editor, and coding-agent skill for architecture diagrams and flowcharts. Start with the [showcase](showcase.md) for previews and runnable examples.

## Use from a coding agent

The shared installer requires Node.js 22.20 or later:

```sh
npx skills add ruohao1/better-diagrams --skill diagram-authoring -g
```

Select your coding agent when prompted, then ask it to use `diagram-authoring`. Omit `-g` to install into the current project. The installed folder includes the CLI, viewer, editor, format reference, starter, and dependency licenses. The agent runs its bundled CLI with Node.js 22.18 or later. A global CLI installation is optional.

For example, ask your agent:

> Use diagram-authoring to map this repository's services for a new contributor. Keep the overview to the main components. Put code references in node details and deeper structure in internal views.

For upload-based skill environments, use `better-diagrams-skill.zip` from a release that includes this packaging. The published `v0.1.0` release has the earlier skill layout. The complete bundle is currently an Unreleased change, available through the repository installer above.

Manage installed skills with the shared installer:

```sh
npx skills check
npx skills update diagram-authoring
```

The root `plugin.json` provides portable plugin metadata. Agent installation uses the shared `skills` installer. npm updates apply to the separate npm global CLI installation.

## Use the CLI

Use Node.js 22.18 or later. Install the published CLI for direct terminal use:

```sh
npm install --global @isqrd/better-diagrams
better-diagrams --help
better-diagrams check examples/architecture-small
better-diagrams dev examples/architecture-small
```

The example paths assume a repository checkout. For your own diagram, replace them with its directory. Open the printed loopback URL. Browser edits change the source files when you choose **Save changes**.

From a checkout, you can instead run the committed skill bundle without installing dependencies:

```sh
node skills/diagram-authoring/bin/cli.mjs check examples/architecture-small
node skills/diagram-authoring/bin/cli.mjs dev examples/architecture-small
```

To create a shareable artifact:

```sh
node skills/diagram-authoring/bin/cli.mjs build examples/architecture-small --out dist/architecture-small.html
```

Open the HTML directly in a browser. It contains its scripts, styles, templates, logos, and source data and works offline. Choose **Export SVG** for a static diagram. `check` and `build` validate source structure and asset paths. They do not verify browser rendering. A build reports `rendering: "not-verified"`.

For a structured geometry report, open the built HTML and evaluate `await window.betterDiagrams.inspect()` with your browser automation. Inspection compiles every declared view, including hidden views, without changing the open diagram. It reports overlaps and render failures as errors, and crossings, long detours, and small internal route segments as warnings. A passed report can contain warnings. It does not prove visual readability or source accuracy.

From a repository checkout with development dependencies and Chromium available, collect the same report with:

```sh
node scripts/visual-check.mjs dist/architecture-small.html > dist/architecture-small.report.json
```

The collector inspects a private snapshot, blocks HTTP(S) requests, and records its artifact SHA-256 and browser version. It exits with `0` for passed checks, `1` for failed checks, or `2` when browser tooling is unavailable. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if Chromium is installed at a custom path. It does not install a browser. This script belongs to the checkout; the self-contained skill uses its host's browser automation. Rebuild edited source before inspecting it: the API describes the immutable standalone artifact, not a live editor draft. Without browser access, rendering remains unverified.

## Explore and export

Built HTML shows the diagram and an optional legend. Click a node for details and source references. Choose **Explore internals** for a deeper authored view. Both open in one modal with **Back** navigation.

Hover or focus the diagram for zoom and export controls. Large views start at readable scale. Drag to pan or choose **Fit**. SVG export contains the complete active diagram and optional legend. It excludes controls, modal frames, details, and other views.

## Author a diagram

A project contains `diagram.json`, optional `theme.css`, and optional SVG files in `templates/` and `logos/`. Start from [the v2 minimal example](../skills/diagram-authoring/assets/minimal-diagram.json) and read [the source format](../skills/diagram-authoring/references/source-format.md). Existing v1 sources stay v1 when edited and saved.

Nodes are canonical records with stable IDs, titles, summaries, details, and optional source references. Architecture views select one fixed size preset, typed labeled connections, and nested boundaries. Flowcharts declare action, decision, start, and end roles and an ordered main path of edge IDs. Set `childViewId` for internal views. The source contains no coordinates.

In the browser, edit labels, summaries, details, step kinds, and connection kinds and labels. Add or remove nodes and connections in the active view. Save and recovery controls remain available inside modals. Removing a node preserves its canonical record and other appearances. Flowchart removals retain the longest surviving contiguous main-path run. Edit references, views, boundaries, main paths, appearance, and asset choices in `diagram.json`.

## File changes and recovery

The live editor watches diagram source, CSS, templates, and logos. Application-code changes require agent regeneration. Valid file changes update the browser. Malformed assets retain the last valid display.

If source changes conflict with a draft, download the draft or reload files before saving. Stale saves are rejected, and the last pre-save document is kept in `.diagram-recovery/previous.json`. Revision checks are optimistic for a local authoring session. External writers do not share a transaction lock.

## Customize the appearance

Use `theme.css` to style SVG classes such as `.node-body`, `.node-label`, `.node-summary`, `.edge-path`, and `.group-body`. Project CSS is isolated from editor controls. Nodes can also specify safe hex background and border colors and a local SVG logo ID.

For architecture, set `template` to select `templates/NAME.svg`. Bind `data-field="label"`, `data-field="summary"`, or `data-field="data.KEY"`. V2 templates fit their fixed footprint. Text and geometry must stay inside a positive viewBox, with text at least 12 units after scaling. V1 templates retain measured intrinsic sizing. Flowchart roles determine their shapes. See [the legacy service template](../examples/skill-install/templates/service.svg) and the format reference for limits.

Templates and logos support inert vector primitives and local references. Scripts, events, HTML, asset style blocks, animation, and remote resources are rejected. Themes accept literal self-contained CSS, local fragments, and supported base64 image and font assets. CSS escapes, imports, and image functions are rejected. Embedded fonts load before measurement and remain in exported SVGs.

## Current limits

Routing compares a few layout candidates and simplifies safe architecture detours. Complex cases retain their ELK route. It is a bounded heuristic, not a global optimizer or a crossing-free guarantee.

Architecture and flowchart are implemented. Sequence, state machine, entity relationship, and dependency graph remain catalog entries. The included commerce and order diagrams are synthetic examples. The original [skill installation example](../examples/skill-install/diagram.json) covers v1 compatibility.

## Update an installation

Check the installed CLI version and available stable release:

```sh
better-diagrams --version
better-diagrams update --check
better-diagrams update
```

Update commands return JSON. A check reports the current and latest versions and whether an update is available. Before the first stable publication, it reports `published: false`. An update installs the exact checked version, verifies the result, and reports `updated: true`. Checks use npm's configured registry.

The updater requires the current npm global installation and respects its configured prefix. It disables lifecycle scripts and enforces Node engine requirements. Update checkout, local dependency, npx, and plugin copies through their owning installer. Diagram commands and offline browser artifacts do not check for releases.

## Develop and verify

```sh
npm ci
npx playwright install --with-deps chromium
npm run check
npm run build
npm run test:unit
npm run test:browser
```

After building, the development CLI is `node dist/cli.mjs`. To test a package, run `npm pack --pack-destination /tmp` and install the resulting tarball. See [release preparation](releasing.md) for the publication workflow.

The package tests install a local tarball, copy the skill by itself, and extract its ZIP outside the checkout. They check bundled v1 and v2 examples, offline exploration, runtime resources, and archive replacement. Building the ZIP requires Git and the standard `zip` tool. Its test also uses `unzip`. CI checks that the committed skill runtime matches the build.

Browser checks cover routing, fixed text, gestures, modal history and focus, editing races, conflicts, customization, real embedded fonts, and full active-view exports. See [the diagram-experience evaluation](../evals/diagram-experience.md) for actual host results and limits, and [the original evaluation](../evals/diagram-authoring.md) for the earlier v1 workflow.
