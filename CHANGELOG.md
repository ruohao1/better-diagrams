# Changelog

Changes are grouped by version. Version headings describe prepared contents; npm and GitHub releases record publication status.

## Unreleased

## [0.1.0]

### Added

- A `better-diagrams` CLI with `check`, `build`, and `dev` commands.
- Architecture diagrams with fixed-size cards, summaries, local SVG logos, colors, typed connections, and nested boundaries.
- Flowcharts with action, decision, start, and end shapes, labeled outcomes, and authored main paths.
- Diagram-only viewing with an optional legend, pan and zoom controls, and modal details and internal views.
- Self-contained HTML and full active-view SVG export with embedded styles, logos, and fonts.
- Browser editing with file watching, conflict detection, draft downloads, and a recovery copy before each save.
- Version 2 source documents and continued support for reading, editing, and saving version 1 documents.
- A bundled agent skill, source-format reference, starter, and architecture and flowchart examples.
- Scoped npm packaging as `@isqrd/better-diagrams`, with versioned release notes and a GitHub release workflow.

### Fixed

- Dragging diagram text pans the canvas without selecting text or opening node details.
- Safe architecture shortcuts remove unnecessary connection bends while retaining blocked routes as fallbacks.
- Source updates arriving during a save preview are applied before write controls resume.
- Custom SVG text size checks include nested spans and transforms after uniform fitting.
- Source validation rejects array values where enum strings are required.
- Dev-server shutdown closes connections with incomplete HTTP headers.
