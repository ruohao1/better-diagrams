---
name: diagram-authoring
description: Use when a coding agent needs to create or update interactive software architecture or workflow diagrams with Better Diagrams.
---

# Diagram authoring

Author diagram source. Better Diagrams supplies layout, exploration, editing, and export.

Use the bundled CLI with Node.js 22.18 or later. Resolve `bin/cli.mjs` relative to this `SKILL.md` and replace that path in the commands below with its absolute installed path. Keep the user's working directory: project and output paths resolve from there. The skill includes its runtime and needs no npm installation. If the bundled CLI is missing, report an incomplete skill installation.

For a new diagram, establish its purpose, audience, visible scope, and detail level. Reuse choices already supplied or approved. If a consequential choice is missing, propose it before authoring.

Read [the source format](references/source-format.md). Start from [the minimal example](assets/minimal-diagram.json) when useful. Inspect the relevant code and callers; record paths and line numbers that support the diagram. Add a verified HTTP(S) permalink when available.

Create new diagrams with source version 2. Use `architecture` for components and their relationships, or `flowchart` for actions, decisions, and outcomes. Keep an existing version 1 document at version 1 unless its upgrade is requested. Sequence, state machine, entity relationship, and dependency graph are catalog entries with no renderer yet.

Create `diagram.json` in the chosen directory. Use stable canonical node IDs, short titles and summaries, named views, and `childViewId` for deeper structure. Put full explanations and verified evidence in details. Each flowchart view declares its step kinds and an ordered main path of **edge IDs**. Architecture connections have a kind and a clear label. Flowchart `next` connections have no label; branches, errors, retries, and jumps have labels.

The compiler places nodes and routes connections; the source has no coordinates. Define nested boundaries with direct node membership and `parentId`. Put optional CSS in `theme.css`, inert architecture components in `templates/`, and local SVG logos in `logos/`. A node's `logo` selects the filename without `.svg`. Use concise text that fits the fixed presets; the default architecture component truncates overflowing summaries and keeps the complete text available in its modal.

| Command | Result |
| --- | --- |
| `node bin/cli.mjs check PROJECT` | Validate document structure and asset paths |
| `node bin/cli.mjs build PROJECT --out FILE.html` | Create self-contained HTML |
| `node bin/cli.mjs dev PROJECT` | Start local editing and watch diagram files; report the printed URL |

Run check and build after authoring. These commands do not verify rendering. If browser access is available, open the artifact and check fixed text bounds, labeled routes, details, modal Back/Close, and Export SVG after pan/zoom. Use Fit when a node is outside the readable initial viewport. If browser launch is denied or unavailable, return the artifact with rendering marked unverified. Built HTML contains only the diagram and optional legend, with on-demand controls. Details and internal views use one modal. SVG export contains the complete active diagram and optional legend, excluding the modal, outer views, and controls. Routing is a bounded heuristic with an ELK fallback, not a guarantee of a global optimum.

Return actual source/artifact paths, the selected purpose/detail, and observed checks. Diagram data, CSS, templates, and logos update the live editor. Application-code changes require regenerating diagram source.
