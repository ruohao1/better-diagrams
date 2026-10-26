# Source format

A project contains `diagram.json`, optional `theme.css`, optional `templates/NAME.svg`, and optional `logos/NAME.svg`. Assets must stay inside the project. IDs start with a letter and use letters, digits, underscores, or hyphens. Unknown fields and authored position coordinates are rejected.

Use version **2** for new diagrams. Version **1** remains readable and editable without an automatic upgrade. The renderer normalizes data in memory; saves retain the source version and canonical metadata.

## Document and canonical nodes

| Field | Meaning |
| --- | --- |
| `version` | `2` for the format below |
| `title`, `purpose`, `audience` | Nonempty strings describing the diagram's intent |
| `rootViewId` | ID of the initial view |
| `nodes` | Object keyed by stable node IDs |
| `views` | Object keyed by named view IDs |

Each v2 node has `label`, `summary`, and `details` strings. Labels must be nonempty. Summaries are short descriptions; details hold full explanations. Node IDs are object keys, not separate `id` properties. Optional node fields are:

| Field | Meaning |
| --- | --- |
| `references` | Array of verified source references |
| `childViewId` | Authored internal view opened from this node's details modal |
| `logo` | Local architecture logo ID: `"storage"` selects `logos/storage.svg` |
| `appearance` | `{ "background": "#f0f8f5", "border": "#468975" }`; either color is optional |
| `template` | Architecture component ID: `"service"` selects `templates/service.svg` |
| `data` | Object containing string values for custom template slots |

Colors accept hex forms with 3, 6, or 8 digits. Logo/template IDs are not URLs or paths. An absent `default` template uses the built-in component. Other referenced assets must exist.

A reference is `{ "path": "src/router.ts", "line": 3, "url": "https://example.com/repository/source" }`. Paths are repository-relative. Line numbers are positive integers. URL is optional and must use HTTP(S). Verify each path, line, and permalink; omit invented links.

A canonical node can appear in several views. Its metadata is shared. Flowchart roles belong to each view. Removing a node from one view preserves its canonical record and other appearances. Child-view links must form an acyclic graph. The node that opens an internal view cannot also appear inside that view.

## Views and boundaries

Every view has `type`, `title`, `detailLevel`, `nodeIds`, and `edges`. Titles and detail levels are nonempty. Optional `legend` defaults to `true`; set it to `false` to omit it. The legend contains a compact view title, detail level, and meanings used in that view.

Optional `groups` contain direct memberships:

```json
[
  { "id": "platform", "label": "Platform", "nodeIds": [] },
  { "id": "backend", "label": "Backend", "parentId": "platform", "nodeIds": ["store"] }
]
```

A node belongs to at most one direct group in a view. Ancestor containment is implicit. Parents must exist in that view and must not form cycles. Empty views and groups are valid.

Architecture and flowchart are implemented. Sequence, state machine, entity relationship, and dependency graph remain catalog entries. Other `type` values are rejected.

## Architecture

Use `"type": "architecture"`. Optional `nodeSize` selects a fixed size for all nodes in that view:

| Preset | SVG units |
| --- | --- |
| `compact` | 224 × 128 |
| `standard` (default) | 252 × 136 |
| `large` | 288 × 152 |

An architecture edge is `{ "id": "save", "source": "router", "target": "store", "kind": "call", "label": "Await save" }`. Kinds are `call`, `data`, `event`, `telemetry`, and `dependency`. Every edge needs a nonempty label. Endpoints must be members of the view. Edge IDs are unique within each view. Cycles and self-edges are valid.

The default card supports a top-left logo, at most two title lines, a short summary, appearance colors, and an internal-view indicator. Titles that do not fit produce an error. Summaries use an ellipsis when needed; their full source text remains available in the modal. The compiler wraps connection labels before layout and compares a few ELK candidates. It simplifies safe architecture detours with at most two turns. Complex obstacle cases keep their ELK routes. This does not guarantee a globally optimal or crossing-free diagram.

## Flowcharts

Use `"type": "flowchart"`. `stepKinds` must contain exactly one role for every view member. Roles and fixed sizes are `action` (222 × 84), `decision` (174 × 108), and `start`/`end` (154 × 48). They render as rectangles, diamonds, and rounded terminals. Architecture templates/logos remain preserved on shared nodes, but flowchart roles determine their visible shapes.

`direction` defaults to `"down"`; `"right"` selects left-to-right flow. The author declares `mainPath` as ordered **edge IDs**, not node IDs. It may be empty for a fragment. Otherwise, its edges must form a contiguous chain without repeating nodes. Ordinary graph cycles and retries are allowed outside this path.

Flowchart edge kinds are:

| Kind | Label |
| --- | --- |
| `next` | No `label` field |
| `branch`, `error`, `retry`, `jump` | Required nonempty label |

Outgoing decision edges must be labeled outcomes, not `next`. The compiler favors a straight main path, puts alternatives beside it, and routes retries around it. Geometry remains automatic. See the bundled [minimal example](../assets/minimal-diagram.json) for a complete architecture with an internal flowchart.

## Custom assets and themes

SVG templates and logos declare a finite positive `viewBox`. They use inert vector primitives and local references. Scripts, event attributes, HTML, inline style attributes, template style blocks, animation, and remote resources are unsupported. Use SVG presentation attributes such as `fill` and `stroke`, with CSS in `theme.css`. Local IDs and references are scoped by render instance, node, and asset.

Templates bind `data-field="label"`, `data-field="summary"`, or `data-field="data.KEY"` on `text`/`tspan`. V2 architecture templates fit uniformly into the view's fixed footprint. Keep bound text and geometry inside the declared viewBox, reserve room for optional logos/indicators, and use a `.node-body` element for appearance colors. Text must remain at least 12 SVG units after scaling. The default card handles wrapping/summary truncation; custom slots must already fit their component. V1 templates retain measured intrinsic sizing.

Themes style SVG classes such as `.node-body`, `.node-label`, `.node-summary`, `.edge-path`, `.edge-label`, and `.group-body`. HTML controls are outside the project style scope. Themes use literal self-contained CSS. Remote URLs, imports, CSS escapes, and image functions are rejected. Local fragments and base64 PNG/JPEG/GIF/WebP or WOFF/WOFF2/TTF/OTF data assets are supported. Embedded fonts load before measurement and remain in exported SVGs.

## Viewing, editing, and compatibility

Built HTML shows only the diagram, an optional legend, and on-demand controls. Details and internal views use one modal with Back/Close. Large views open at readable scale; pan or choose Fit. Export SVG contains the complete active view and optional legend, regardless of pan/zoom. It excludes details, modal frames, controls, and other views.

The browser editor changes labels, summaries, details, step kinds, and active-view nodes/connections. Connection kinds/labels can be added or updated. Save, draft download, and conflict recovery remain available inside modals. Removing a flow step/edge keeps the longest surviving contiguous main-path run, with the earliest run winning ties. Views, main paths, references, boundaries, appearance, and asset choices remain file-authored.

The live editor watches diagram source, CSS, templates, and logos. It retains the last valid display on render errors. Dirty drafts survive asset updates and external source conflicts. Download the draft or reload files before resolving a source conflict. Saves retain `.diagram-recovery/previous.json` and use optimistic exact-byte document revisions for a local authoring session. Application-code changes require agent regeneration.

V1 omits `summary`, `logo`, `appearance`, view types, typed connections, flow roles, and nested parents. Its original required fields and validation rules remain unchanged. It renders through the new modal viewer with legacy measured node sizing. Do not add v2 fields to a v1 source.

`check` and `build` validate source structure and asset paths. A build reports `rendering: "not-verified"`. Real browser checks must be reported separately.
