# Search and PNG evaluation

Observed on 2026-10-31, based on `f97057ba20c09c7538f98b51beb0feead37f0de3`. This is the second diagram-quality batch: active-view Search and native PNG export. Compiler geometry and source formats are unchanged.

## Search

Browser checks cover case-insensitive literal matching of IDs, labels, summaries, and source paths; duplicate labels in source order; empty queries; no results; and inert script-shaped text. Selection reveals and focuses a node, preserves scale when it fits, and accounts for the optional legend. Root and internal views remain separate. Touch controls, oversized target fitting, modal Back/Close, accepted file changes, and invalid-source recovery are exercised.

Independent review found one keyboard issue: Escape on the Search trigger could close the internal-view modal while Search remained open. A Shift+Tab regression failed before moving the Escape handler to the canvas. The regression and final full suites passed after the fix. No other material findings remain.

## PNG fidelity and limits

The converter uses clean SVG export, targets 2× resolution, and bounds decoding and canvas allocation to 16,777,216 pixels and 8,192 pixels per edge. Tests exercise fractional and extreme bounds, invalid input, decode/allocation/context/draw/encoding failures, resource cleanup, and retry. Viewer tests cover root and internal exports, details-modal exports, unchanged output after pan/zoom/Search, pending controls, download URL cleanup, and destruction during conversion.

In Chromium 155, the real embedded Codicon glyph crop matched the live SVG exactly. A missing-font control differed, demonstrating that the matching output was not a shared font fallback. Logos, gradients, clipping, CSS variables, and appearance colors were preserved. Ordinary Unicode text showed small document-versus-image antialiasing differences, with a maximum observed channel difference of 66. Live/native images and the full architecture PNG were visually inspected. Temporary comparison evidence is retained under ignored `dist/png-feasibility/`.

## Agent and package checks

A fresh agent reading the previous skill found no documented Search or PNG workflow. A separate agent used only the updated skill/reference and a built artifact to find an internal node by source path and export `verification.png` after pan/zoom. The PNG was 2522 × 822 pixels. Its five internal nodes and legend were present; outer nodes and UI were absent. The same-view SVG confirmed membership and unchanged bounds. This bounded instruction check preceded only the later Escape fix; the final browser suite covers that fix.

The isolated skill installation also exercised Search, PNG download, geometry inspection, and offline operation outside the checkout. Final verification passed: type check, build, **62 unit/package tests**, and **60 Chromium browser tests**, with no skips. All three distributed runtime files matched a fresh build byte for byte.

Firefox, WebKit, and other operating systems were not tested. Geometry and export checks do not establish source accuracy. No release or publication is included in this batch.
