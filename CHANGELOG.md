# Changelog

Changes are grouped by version. Version headings describe prepared contents; npm and GitHub releases record publication status.

## Unreleased

### Added

- An offline `window.betterDiagrams.inspect()` API that reports final geometry for every authored view, including hidden views and render failures. The repository's `scripts/visual-check.mjs` collects JSON reports with an artifact digest and explicit pass, failure, or unavailable-browser status.
- A visual showcase with architecture, internal-view, and flowchart examples, downloadable SVGs, and commands to explore them locally.
- A self-contained `diagram-authoring` skill with its own CLI, viewer, editor, and dependency licenses. Install it with the shared `skills` installer without a separate global CLI installation.
- A `pack:skill` command that builds `better-diagrams-skill.zip`, with the ZIP attached alongside the npm tarball in future GitHub releases.

### Fixed

- Architecture routing can choose fewer bends with at most 15% extra travel while preserving overlap, crossing, obstacle, and label safeguards. Layout candidates are assessed once during selection.
- Release checks handle npm's OIDC requests before reading update metadata and use the same npm version as publication.

## [0.1.0]

### Added

- A `better-diagrams` CLI with `check`, `build`, and `dev` commands.
- `--version`, `update --check`, and explicit updates of the current npm global installation. Updates pin the checked version and prefix and enforce Node engine requirements.
- Architecture diagrams with fixed-size cards, summaries, local SVG logos, colors, typed connections, and nested boundaries.
- Flowcharts with action, decision, start, and end shapes, labeled outcomes, and authored main paths.
- Diagram-only viewing with an optional legend, pan and zoom controls, and modal details and internal views.
- Self-contained HTML and full active-view SVG export with embedded styles, logos, and fonts.
- Browser editing with file watching, conflict detection, draft downloads, and a recovery copy before each save.
- Version 2 source documents and continued support for reading, editing, and saving version 1 documents.
- A bundled agent skill, source-format reference, starter, and architecture and flowchart examples.
- Scoped npm packaging as `@isqrd/better-diagrams`, with versioned release notes and a GitHub release workflow.

### Fixed

- The bundled flowchart uses concise terminal labels that fit wider fallback fonts.
- Dragging diagram text pans the canvas without selecting text or opening node details.
- Safe architecture shortcuts remove unnecessary connection bends while retaining blocked routes as fallbacks.
- Source updates arriving during a save preview are applied before write controls resume.
- Custom SVG text size checks include nested spans and transforms after uniform fitting.
- Source validation rejects array values where enum strings are required.
- Dev-server shutdown closes connections with incomplete HTTP headers.
- Updates enforce Node engine requirements even when npm's force setting is enabled.
- Release and update commands resolve standard Windows npm launchers without shell parsing.
