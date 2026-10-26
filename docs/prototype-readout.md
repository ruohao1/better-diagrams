# Diagram experience prototype

Question: do the agreed fixed-size nodes, compact labeled routes, and modal exploration remain readable in small, dense, and branching diagrams?

This is throwaway code on `prototype/diagram-experience`, based on `f1439e9`. The production compiler, viewer, editor, source schema, package, and build script are unchanged. The examples are synthetic and do not claim to document a real repository. The user accepted the visual baseline after the drag/routing fixes on 2026-10-26; production integration is being planned separately.

## Run

```sh
node src/browser/diagram-experience.prototype.build.mjs
```

Open `dist/prototypes/diagram-experience.html`. Everything is embedded; no server or network access is needed.

- `?variant=small`: five-node architecture with nested boundaries.
- `?variant=dense`: eighteen-node architecture with twenty-three typed connections.
- `?variant=flow`: eight-step flowchart with a declared main path and retry loop.
- Add `&review=0` to hide the review-only example switcher.

Use the bottom arrows or the left/right keys to switch examples. Click Order service, then Explore internals, to try modal navigation. Hover the top-right corner of a diagram or focus its controls to reveal zoom and export actions. Drag the background or a node to pan; use the wheel to zoom. Descriptions in the details modal can be selected for copying.

## Scope and choices

- Use the installed ELK library for node placement and initial orthogonal routing. Fixtures contain no coordinates.
- Compare four layout candidates per view. Architecture candidates vary direction and spacing. Flowchart candidates vary branch side and spacing.
- Rank candidates by node/label overlaps, counted crossings, total Manhattan route length, and bend count, in that order. This is a small heuristic search, not a global optimizer.
- After selecting placement, simplify architecture detours with clear routes of at most two turns. Try different node sides and obstacle-edge corridors without moving nodes. Keep node, unrelated-boundary, heading, and label clearance; relocate the connection label and reject shortcuts that add crossings or obscure unrelated connections. Keep ELK's route when no suitable shortcut exists.
- Use a provisional 252 × 136 architecture-node preset. Flowchart presets are 222 × 84 for actions, 174 × 108 for decisions, and 154 × 48 for terminals. These exact dimensions are prototype choices for review.
- Wrap connection labels at a provisional 128-pixel width. Keep card text within its fixed bounds; shorten overflowing summaries with an ellipsis.
- Open at a scale of at least 0.9, with panning for larger views. Center each axis that fits. Fit is an explicit action and may reduce text below that scale.
- Use generic local vector marks as logos. Technology-specific logos and arbitrary user assets are not part of this prototype.
- Keep the example switcher outside the diagram and outside exports. It reserves its own review space and is omitted with `review=0` or a production bundle definition.

## Observations

The Chromium smoke check exercised offline loading, fixed node sizes, text containment, readable initial scale, two levels of modal exploration, Back, Escape, root-camera preservation, real wheel zoom/drag, Fit/Readable actions, keyboard example switching, and full active-view SVG export after pan/zoom. Follow-up regressions cover dragging from card text in the root and modal diagrams, avoiding accidental detail opening, selectable modal descriptions, and restoration of node keyboard focus.

| Case | Nodes | Connections | Node/label overlaps | Counted crossings | Total route length | Bends |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Small architecture | 5 | 4 | 0 | 0 | 1,063 | 4 |
| Dense architecture | 18 | 23 | 0 | 10 | 15,094 | 49 |
| Flowchart | 8 | 8 | 0 | 0 | 1,402 | 8 |

Lengths are SVG units, not screen pixels or a benchmark against another tool. The crossing counter measures strict orthogonal segment intersections; it does not assess collinear overlap, every boundary-heading interaction, or human reading effort.

The flowchart's main-path centers align on the same x coordinate. Comparing branch sides removed an avoidable main-path crossing. Increasing the cycle-direction priority kept the retry step below its decision rather than above the start. Turning on ELK's hierarchy-aware greedy switch did not change the dense case, so that extra option was dropped.

The active internal SVG contained its three internal nodes, without the root diagram or modal frame. Panning and zooming produced the same complete SVG as the initial view. The offline page made zero HTTP(S) requests and raised no page errors.

### Feedback: dragging and unnecessary turns

The original drag handler excluded nodes, so dragging card text selected it and could open a modal instead of panning. The canvas now disables native text selection, starts panning after a four-pixel threshold, and suppresses the click after a drag. Normal clicks and keyboard activation still work. Selection remains available in modal descriptions.

The reported Order service → Event stream connection initially left the bottom of its source and entered the top of its target through six turns over 2,484 SVG units. A clear right-side route uses two turns over 1,124 units, about 55% shorter. It avoids the worker boundary and other nodes. The shared simplification pass changes six dense connections: counted crossings fall from fourteen to ten, total route length from 18,525 to 15,094, and turns from sixty-six to forty-nine. Node positions are unchanged.

Reproduce the check with:

```sh
node src/browser/diagram-experience.prototype.check.mjs
node src/browser/diagram-experience.prototype.regression.mjs
```

The checks use the installed `/usr/bin/google-chrome`. They write screenshots, SVGs, `checks.json`, and `regressions.json` under the ignored `dist/prototypes/` directory. The regressions failed on both original symptoms before the fixes and now pass.

## Remaining work

- Review the dense diagram's long routes and ten counted crossings. The limited two-turn simplification and ELK search do not settle the production routing approach; routes that need more complex obstacle navigation keep their original ELK path.
- Review the provisional node dimensions, summary density, colors, and modal size in the actual browser.
- Mobile, other browsers, arbitrary user data, custom themes/logos, and source editing are not validated by this prototype.
- The production test suite was not rerun because its modules were not changed. Production integration needs its own plan and regression tests; this prototype is not a drop-in replacement.
