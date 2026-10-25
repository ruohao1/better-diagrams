# Better Diagrams

A local diagram compiler, browser editor, and coding-agent skill. Write the diagram's purpose, nodes, and named views. The compiler places nodes and routes connections with ELK.

Click a node to read its details and source references. Choose **Explore internals** to open a deeper authored view. Each view states its detail level. Export creates a complete SVG of the active view, including content outside the zoomed viewport and excluding editor controls.

## Try it

Use Node.js 22.18 or later.

```sh
npm ci
npm run build
node dist/cli.mjs check examples/skill-install
node dist/cli.mjs dev examples/skill-install
```

Open the printed loopback URL. The example explains an agent-skill installation flow with source references and an internal verification view. Browser edits change the example files when you choose **Save**.

To create a shareable artifact:

```sh
node dist/cli.mjs build examples/skill-install --out dist/skill-install.html
```

Open that HTML file directly in a browser. It contains its scripts, styles, templates, and source data and works offline. Choose **Export SVG** in the viewer for a static diagram. `check` and `build` validate source structure and asset paths; they do not verify browser rendering.

## Author a diagram

A project contains `diagram.json`, optional `theme.css`, and optional `templates/NAME.svg`. Start from [the minimal example](skills/diagram-authoring/assets/minimal-diagram.json) and read [the source format](skills/diagram-authoring/references/source-format.md).

Nodes are canonical records with stable IDs, labels, details, and optional source references. Named views select nodes, connections, groups, and a detail level. Set a node's `childViewId` to link its internal view. The source contains no coordinates.

In the browser, edit node labels and details, add nodes and connections, or remove them from the active view. Removing a node from one view preserves its canonical record and appearances in other views. Edit source references, view definitions, and template choices in `diagram.json`.

The live editor watches diagram data, CSS, and SVG templates. Application-code changes require the agent to regenerate the diagram source. File changes update a clean editor automatically. If external document changes conflict with a draft, download the draft or reload the file before saving. Stale saves are rejected, and the last pre-save document is kept in `.diagram-recovery/previous.json`. Revision checks are optimistic; this is a local editor without a cross-process transaction lock.

## Customize the appearance

Use `theme.css` to style native SVG classes such as `.node-body`, `.node-label`, `.edge-path`, and `.group-body`. Project CSS is isolated from editor controls.

Set `template` on a node to select `templates/NAME.svg`. Templates need a positive `viewBox`. Bind text with `data-field="label"` or `data-field="data.KEY"`; the compiler measures the result and recalculates layout. See [the service template](examples/skill-install/templates/service.svg).

Templates support inert vector primitives and local references. Scripts, event handlers, HTML, template style blocks, animation, and remote resources are rejected. Themes accept literal self-contained CSS, local fragments, and supported base64 image/font assets. CSS escapes, imports, and image functions are rejected. Browser rendering reports unsupported custom assets and retains the last valid preview.

## Use from a coding agent

Build and pack a local release, then install its CLI:

```sh
npm run build
npm pack --pack-destination /tmp
npm install --global /tmp/better-diagrams-0.1.0.tgz
better-diagrams --help
```

The package is private and has not been published. These commands install this checkout's tarball.

Copy the skill into a target project's Codex skill directory:

```sh
mkdir -p /path/to/project/.agents/skills
cp -R skills/diagram-authoring /path/to/project/.agents/skills/
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

The package test installs a local tarball outside the checkout and opens its generated artifact offline. Browser tests cover layout, details, internal views, editing, source conflicts, customization, and SVG export. See [the agent evaluation](evals/diagram-authoring.md) for actual host results and limits.

Local planning files under `docs/superpowers/` are preserved and excluded from Git.
