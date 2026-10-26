# Diagram experience

These decisions were agreed during the design discussion. They describe intended production behavior; a throwaway prototype is available for review.

## Diagram catalog

- Architecture
- Flowchart
- Sequence
- State machine
- Entity relationship
- Dependency graph

Refine architecture first, then flowcharts. The remaining types stay in the catalog; their detailed rules are not yet defined.

## Built output

- Show the diagram and an optional legend.
- Exclude the surrounding page header, toolbar, and permanent sidebar.
- Keep node details and internal views clickable. Display them in a modal.
- Use one modal with Back navigation rather than stacked modals. Closing it returns to the main diagram.
- Show a small zoom/export menu on hover or keyboard focus.
- Open large diagrams at a readable scale with panning. Keep Fit available in the on-demand menu.
- Dragging the background or a node pans without selecting diagram text or opening details. A click still opens details; modal descriptions remain selectable for copying.
- The optional legend can include a compact diagram title and detail level. Include only symbol and connection meanings used in the active view.
- Export the complete active diagram and its optional legend. When an internal diagram is active, export that internal view. Exclude controls, modal frames, and details from the exported image.

## Architecture

- All nodes in a view share one fixed size. Different views can choose different size presets.
- Each node supports an optional logo at the top left, a title, a short summary, a background color, and a border.
- Keep the font readable and require concise titles. Truncate overflowing summary text and show the full explanation in the modal.
- Connections are typed, directed, and clearly labeled.
- Layout must keep connections and labels readable and avoid unnecessary connection length.
- Prioritize readable labels and no overlaps, then fewer crossings, then shorter connections, then fewer bends. Wrap labels before stretching connections to accommodate them.
- Named boundaries can nest.
- Show a small indicator at the top right of nodes that have internal views. Clicking the node opens details; the modal offers access to its internals.

## Flowcharts

- Use rectangles for actions, diamonds for decisions, and rounded terminals for start/end.
- Keep details and internal views in modals.
- Default to top-to-bottom flow, with a per-view option for left-to-right.
- Label decision branches, errors, retries, and jumps. Leave ordinary next-step arrows unlabeled.
- Use a fixed size preset for each step kind, consistently within the view. Keep visible text concise and full explanations in the modal.
- The author or agent declares the main path. The compiler favors keeping it straight, places alternatives beside it, and routes loops around it. Geometry remains automatic.

## Visual validation

The architecture and flowchart decisions above are implemented for version 2 sources. Version 1 retains its measured node sizing and uses the new modal viewer. The throwaway visual baseline remains on `prototype/diagram-experience`; its review switcher and prototype modules were not promoted.

Production checks use small and dense architecture diagrams, a branching/retry flowchart, custom assets, and live source updates. They exercise readable initial scale, fixed text, routing, modal navigation, editing, and clean exports. See [the prototype readout](prototype-readout.md) for historical observations and [the production evaluation](../evals/diagram-experience.md) for installed-host evidence. The user accepted the visual baseline after the drag/routing fixes and requested integration on 2026-10-26.
