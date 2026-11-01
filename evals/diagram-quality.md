# Diagram quality evaluation

Observed on 2026-10-30 in the `feat/diagram-quality` worktree, based on `4db1c3a5bb8b105b112bc203b315477b8455cd96`. This evaluates candidate scoring, final geometry inspection, and the architecture bend policy. Search and PNG remain a separate batch.

## Geometry comparison

The baseline compiler and four source inputs were frozen before edits. The same browser captured node transforms, group rectangles, paths, labels, bounds, and normalized SVGs before and after the changes. Generated SVG instance IDs were excluded from comparison. Each capture used one cold compile and three warm compiles. Warm and cold geometry agreed for each input.

After scoring each candidate once, all four examples had exact geometry matches. The full routing change retained exact geometry for the small architecture, flowchart, and legacy v1 examples. The dense architecture retained node/group positions and export bounds while changing two edges:

| Dense architecture | Before | After |
| --- | ---: | ---: |
| Total bends | 52 | 47 |
| Total Manhattan route length | 15230.612 | 15235.612 |
| Forbidden overlaps in final-scene browser test | 0 | 0 |

The changed edges are `bus-reconcile` and `fulfill-metrics`. Their labels remain present and move with their routes. Before/after screenshots were inspected. The original Order service → Event stream route still meets its two-turn, obstacle, and full-export regression checks.

A separate frozen obstacle fixture demonstrates the new tradeoff: a four-turn route with length 300 becomes a two-turn route with length 332, with zero overlaps or crossings. Adding a blocking boundary retains the original route instead of accepting a long perimeter detour. This fixture is a controlled regression, not evidence of general diagram quality.

Timing samples varied across runs and do not support a whole-render speedup claim. The scoring change removes repeated route assessments; text measurement and ELK costs remain. Temporary captures and the comparison script are under ignored `dist/quality-baseline/` in the implementation worktree.

## Inspection and delivery

The standalone API checks every declared view, including unreachable views, and reports compilation failures per view. Browser tests exercise root-render failure, invalid source, source digest binding, repeated inspection, temporary DOM cleanup, and preservation of camera, modal, and focus. Geometry findings reuse the existing route predicates and describe the final shortened scene. Ordinary viewing does not collect findings.

Collector tests exercise real built HTML, hidden failures, unavailable Chromium, invalid artifacts, browser launch failures, page errors, blocked HTTP(S) requests, changes to the original artifact during inspection, a stalled inspection, snapshot cleanup, and malformed or contradictory reports. The collector's digest identifies a private copy of the captured HTML bytes.

An independent review found that a contradictory report could claim a pass despite a failed child. A real-artifact regression reproduced exit 0 before the fix. Report schema and status consistency checks now reject that input, incomplete views, duplicate view IDs, and contradictory geometry. A genuine generated report remains accepted.

## Agent instruction check

A fresh agent reading the old skill and source-format reference could not find a documented method for structured all-view inspection. After the skill update, a separate fresh agent used only those instructions and browser automation on an actual offline artifact. It obtained three passing view reports and the unreachable `hidden` view's `compile-failed` result without navigating into that view. The overall result was failed. No browser page errors occurred. The agent kept visual readability, source accuracy, interaction checks, and export checks explicitly unverified.

This is a bounded documentation/application check. It does not establish broad agent authoring gains.

## Limits

Final verification passed: type check, build, 62 unit/package tests, and 43 Chromium browser tests. No tests were skipped. The bundled CLI, viewer, and editor matched a fresh build byte for byte. The independent review's one material collector finding was fixed and verified with its failing-then-passing regression and the full suites.

Chromium is the exercised browser. Geometry inspection does not prove source accuracy, human readability, or optimal routing. Crossing, stretch, and short-segment findings are warnings; necessary detours can remain. The inspection API describes standalone HTML, not live editor drafts. The collector is a checkout tool; the installed skill uses the host's browser automation.

No release, merge, registry update, or global skill installation was performed. Source-validation PR3 remains separate.
