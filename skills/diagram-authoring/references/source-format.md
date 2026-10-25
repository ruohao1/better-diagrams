# Source format

A project contains `diagram.json`, optional `theme.css`, and optional `templates/NAME.svg`.

The document fields are:

| Field | Meaning |
| --- | --- |
| `version` | Must be `1` |
| `title`, `purpose`, `audience` | Nonempty strings describing the diagram's intent |
| `rootViewId` | ID of the initial view |
| `nodes` | Object keyed by stable node IDs |
| `views` | Object keyed by named view IDs |

Each node has `label` and `details` strings. Optional fields are `references`, `childViewId`, `template`, and `data`.

- A reference is `{ "path": "src/router.ts", "line": 3, "url": "https://example.com/repository/source" }`. Paths are repository-relative. Line numbers are positive integers. URL is optional and must use HTTP(S). Use source paths and URLs you have verified.
- `childViewId` opens an authored internal view. A child view does not need to repeat its parent node. Internal-view references must not form a cycle.
- `template` selects `templates/NAME.svg`; omit it for the built-in component.
- `data` contains string values for custom template text slots.

Each view has `title`, `detailLevel`, `nodeIds`, and `edges`. An edge is `{ "id": "calls", "source": "router", "target": "store", "label": "await" }`; label is optional. Both endpoints must appear in that view. Directed cycles and empty views are valid.

Optional `groups` contain `{ "id": "backend", "label": "Backend", "nodeIds": ["router", "store"] }`. A node belongs to at most one group in a view. A canonical node may appear in several views. Removing it from one view preserves the other appearances.

IDs use letters, digits, underscores, and hyphens and start with a letter. Node IDs and view IDs are object keys; nodes do not have a separate `id` property. Unknown fields are rejected. The document contains no position coordinates.

SVG templates declare a positive `viewBox`, use inert vector primitives, and bind text with `data-field="label"` or `data-field="data.KEY"` on `text`/`tspan`. Local IDs and references are namespaced per node. Scripts, events, HTML, template style blocks, animation, and remote resources are unsupported. Keep styling in `theme.css`.

Themes use literal self-contained CSS. Remote URLs, imports, CSS escapes, and image functions are rejected. Local fragments and base64 PNG/JPEG/GIF/WebP or WOFF/WOFF2/TTF/OTF data assets are supported. The live editor watches these diagram files; it does not analyze application code automatically.

The browser editor changes node labels/details and view nodes/connections. Saving preserves references, data, template choices, and internal-view links. The last pre-save source is retained in `.diagram-recovery/previous.json`; conflict protection is optimistic for a single local authoring session.
