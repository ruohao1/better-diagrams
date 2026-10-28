# Better Diagrams

A local diagram compiler, browser editor, and coding-agent skill. Author architecture diagrams and flowcharts with a stated purpose, audience, and detail level. The compiler places fixed-size nodes and routes typed connections with ELK.

See the [changelog](CHANGELOG.md) for the current unreleased changes.

Built HTML shows the diagram and an optional legend. Click a node for details and source references. Choose **Explore internals** for a deeper authored view. Both open in one modal with Back navigation. Hover or focus the diagram for zoom/export controls. Large views start at readable scale; drag to pan or choose **Fit**. SVG export contains the complete active diagram and optional legend, excluding controls, modal frames, details, and other views.

## Try it

Use Node.js 22.18 or later.

```sh
npm ci
npm run build
node dist/cli.mjs check examples/architecture-small
node dist/cli.mjs dev examples/architecture-small
```

Open the printed loopback URL. Browser edits change the example files when you choose **Save changes**. The included cases are:

- `examples/architecture-small`: fixed cards, a local logo, and nested boundaries.
- `examples/architecture-dense`: eighteen nodes and twenty-three typed relationships.
- `examples/order-flow`: decisions, an authored main path, and retry routing.
- `examples/skill-install`: the original source-grounded v1 compatibility example.

The commerce/order cases are synthetic examples. They do not describe this repository's architecture.

To create a shareable artifact:

```sh
node dist/cli.mjs build examples/architecture-small --out dist/architecture-small.html
```

Open the HTML directly in a browser. It contains its scripts, styles, templates, logos, and source data and works offline. Choose **Export SVG** for a static diagram. `check` and `build` validate source structure and asset paths; they do not verify browser rendering. A build reports `rendering: "not-verified"`.

## Author a diagram

A project contains `diagram.json`, optional `theme.css`, and optional SVG files in `templates/` and `logos/`. Start from [the v2 minimal example](skills/diagram-authoring/assets/minimal-diagram.json) and read [the source format](skills/diagram-authoring/references/source-format.md). Existing v1 sources stay v1 when edited and saved.

Nodes are canonical records with stable IDs, titles, summaries, details, and optional source references. Architecture views select one fixed size preset, typed labeled connections, and nested boundaries. Flowcharts declare action/decision/start/end roles and an ordered main path of edge IDs. Set `childViewId` for internal views. The source contains no coordinates.

In the browser, edit labels, summaries, details, step kinds, and connection kinds/labels. Add or remove nodes/connections in the active view. Save and recovery controls remain available inside modals. Removing a node preserves its canonical record and other appearances. Flowchart removals retain the longest surviving contiguous main-path run. Edit references, views, boundaries, main paths, appearance, and asset choices in `diagram.json`.

The live editor watches diagram source, CSS, templates, and logos. Application-code changes require agent regeneration. Valid file changes update the browser; malformed assets retain the last valid display. If source changes conflict with a draft, download the draft or reload files before saving. Stale saves are rejected, and the last pre-save document is kept in `.diagram-recovery/previous.json`. Revision checks are optimistic for a local authoring session; external writers do not share a transaction lock.

## Customize the appearance

Use `theme.css` to style SVG classes such as `.node-body`, `.node-label`, `.node-summary`, `.edge-path`, and `.group-body`. Project CSS is isolated from editor controls. Nodes can also specify safe hex background/border colors and a local SVG logo ID.

For architecture, set `template` to select `templates/NAME.svg`. Bind `data-field="label"`, `data-field="summary"`, or `data-field="data.KEY"`. V2 templates fit their fixed footprint; text and geometry must stay inside a positive viewBox, with text at least 12 units after scaling. V1 templates retain measured intrinsic sizing. Flowchart roles determine their shapes. See [the legacy service template](examples/skill-install/templates/service.svg) and the format reference for limits.

Templates/logos support inert vector primitives and local references. Scripts, events, HTML, asset style blocks, animation, and remote resources are rejected. Themes accept literal self-contained CSS, local fragments, and supported base64 image/font assets. CSS escapes, imports, and image functions are rejected. Embedded fonts load before measurement and remain in exported SVGs.

Routing compares a few layout candidates and simplifies safe architecture detours. Complex cases retain their ELK route. It is a bounded heuristic, not a global optimizer or a crossing-free guarantee. Architecture and flowchart are implemented. Sequence, state machine, entity relationship, and dependency graph remain catalog entries.

## Use from a coding agent

Install the published CLI:

```sh
npm install --global @isqrd/better-diagrams
better-diagrams --help
```

The executable remains `better-diagrams`. To test a checkout, run `npm pack --pack-destination /tmp` and install the resulting tarball. See [release preparation](docs/releasing.md) for the publication workflow.

Check the installed version and available stable release:

```sh
better-diagrams --version
better-diagrams update --check
better-diagrams update
```

Update commands return JSON. A check reports the current/latest versions and whether an update is available. Before the first stable publication, it reports `published: false`. An update installs the exact checked version, verifies the result, and reports `updated: true`. Checks use npm's configured registry. The updater requires the current npm global installation and respects its configured prefix. Update checkout, local dependency, npx, and plugin copies through their owning installer. Diagram commands and offline browser artifacts do not check for releases.

Copy the installed skill into a target project's Codex skill directory:

```sh
mkdir -p /path/to/project/.agents/skills
cp -R "$(npm root --global)/@isqrd/better-diagrams/skills/diagram-authoring" /path/to/project/.agents/skills/
```

Invoke `$diagram-authoring` in that project. The skill guides source inspection, purpose/detail choices, authoring, and accurate check/build reporting. It requires the CLI on PATH. A complete plugin bundle also supports invoking its bundled CLI with Node. The root `plugin.json` provides portable plugin metadata; the recorded Codex evaluation uses project-local skill discovery.

## Verify changes

```sh
npm ci
npx playwright install --with-deps chromium
npm run check
npm run build
npm run test:unit
npm run test:browser
```

The package test installs a local tarball outside the checkout and opens its bundled v1/v2 examples and starter offline. Browser checks cover routing, fixed text, gestures, modal history/focus, editing races, conflicts, customization, real embedded fonts, and full active-view exports. See [the diagram-experience evaluation](evals/diagram-experience.md) for actual host results and limits, and [the original evaluation](evals/diagram-authoring.md) for the earlier v1 workflow.

Local planning files under `docs/superpowers/` are preserved and excluded from Git.
