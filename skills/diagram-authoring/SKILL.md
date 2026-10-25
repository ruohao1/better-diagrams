---
name: diagram-authoring
description: Use when a coding agent needs to create or update interactive software architecture or workflow diagrams with Better Diagrams.
---

# Diagram authoring

Author diagram source. Better Diagrams supplies layout, exploration, editing, and export.

Use `better-diagrams` on PATH. A complete plugin bundle also provides `../../dist/cli.mjs` relative to this skill directory; invoke that file with Node if the command is absent. If neither is available, report the CLI prerequisite. Do not assume a same-named public registry package is this tool.

For a new diagram, establish its purpose, audience, visible scope, and detail level. Reuse choices already supplied or approved. If a consequential choice is missing, propose it before authoring.

Read [the source format](references/source-format.md). Start from [the minimal example](assets/minimal-diagram.json) when useful. Inspect the relevant code and callers; record paths and line numbers that support the diagram. Add a verified HTTP(S) permalink when available.

Create `diagram.json` in the chosen diagram directory. Use stable node IDs, named views, and `childViewId` for deeper structure. Put explanations and evidence in node details. The compiler places nodes and routes connections; the source has no coordinates. Put optional CSS in `theme.css` and inert SVG components in `templates/`.

| Command | Result |
| --- | --- |
| `better-diagrams check PROJECT` | Validate document structure and asset paths |
| `better-diagrams build PROJECT --out FILE.html` | Create self-contained HTML |
| `better-diagrams dev PROJECT` | Start local editing and watch diagram files; report the printed URL |

Run check and build after authoring. These commands do not verify rendering. If browser access is available, open the artifact and check node details, internal views, and Export SVG. If browser launch is denied or unavailable, return the artifact with rendering marked unverified. SVG export is a browser action; it exports the complete active view, excluding surrounding controls.

Return actual source/artifact paths, the selected purpose/detail, and observed checks. Diagram data, CSS, and templates update the live editor; application-code changes require regenerating diagram source.
