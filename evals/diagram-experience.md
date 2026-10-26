# Diagram-experience integration evaluation

Observed on 2026-10-26 with Codex CLI 0.164.0, Node.js 22.23.1, npm 10.9.8, and Google Chrome 155.0.8059.84 on Linux.

This is a controlled integration check of the installed CLI and project-local skill. It does not establish a general diagram-quality or performance improvement.

## Controlled source and setup

Separate disposable projects contained these two files:

```ts
// src/router.ts
import { saveTask } from './store';
export async function postTask(id: string, text: string) {
  await saveTask({ id, text });
  return { status: 201 };
}
```

```ts
// src/store.ts
const tasks = new Map<string, { id: string; text: string }>();
export async function saveTask(task: { id: string; text: string }) {
  tasks.set(task.id, task);
}
```

The temporary root was `/tmp/better-diagrams-experience-eval-mglj2twx/`. Baseline and candidate used separate source projects and project-local copies of `diagram-authoring`. The baseline used the existing v1 reference. The candidate used the updated v2 reference and starter. Both CLI installations came from local tarballs installed offline into disposable prefixes. No global configuration or user installation changed.

Both sessions received the same approved purpose/scope: explain `postTask` storage for maintainers, provide an architecture overview and a deeper `saveTask` flowchart, declare a main path, add a local storage logo, and verify source paths/lines. They were asked to write `diagram/` and `diagram.html`, distinguish source checks from browser checks, and avoid dependency installation, commits, pushes, or other diagram generators.

The host command was:

```sh
codex exec --ephemeral --ignore-user-config --skip-git-repo-check \
  --sandbox workspace-write --json -C PROJECT -o LAST_MESSAGE_FILE -
```

The prompt arrived on stdin. Each run had a 180-second parent timeout. The installed prefix's `bin/` directory was added only to that child process's PATH.

## Actual host results

| Observation | Existing reference | Updated reference |
| --- | --- | --- |
| Exit | 0 | 0 |
| Source | v2; 7 nodes, 2 typed views | v2; 6 nodes, 2 typed views |
| Verified path/line references | 7 | 16 |
| Local SVG logo | Present | Present |
| CLI check/build | Passed | Passed |
| Nested browser checks | Chrome attempt denied by socket permissions | Not performed; reported unverified |

The baseline explicitly recognized that its reference described the older format and recovered the v2 contract from packaged examples. It already produced valid v2 output. The updated reference supplies that contract directly. These observations support reference accuracy and host compatibility; they do not demonstrate better diagrams.

The packaged starter had a separate failing acceptance check: it still produced 224-unit legacy cards. After updating its source, the installed starter produced 252 × 136 architecture cards and an internal flowchart. This checks the starter's rendered behavior, not its prose.

The candidate correctly described the awaited call, synchronous `Map.set`, same-key replacement, process-local memory, returned status, and lack of an HTTP framework or persistent database in the supplied files. Its internal flow had no invented decision branch. All sixteen references named real files and valid source lines. No repository permalink was invented for the disposable project.

Candidate artifacts were `candidate/diagram/diagram.json`, `candidate/diagram/logos/storage.svg`, and `candidate/diagram.html` under the temporary root. These are execution evidence, not committed release files.

## Parent browser follow-through

The parent could launch Chrome with permitted process/IPC access. It refreshed the disposable installation from the final build and checked the actual candidate output:

1. Opened the self-contained HTML offline and checked fixed architecture cards and the local logo.
2. Opened `saveTask` details, verified a source reference, and entered its internal flowchart.
3. Zoomed and panned, then exported the complete active flow without outer architecture nodes or modal controls.
4. Used Back/Escape and checked keyboard focus restoration.
5. Started `better-diagrams dev` through the offline-installed binary.
6. Edited the label and summary inside the modal and saved v2 source. References, the child-view link, and the logo selection survived.
7. Changed source text and the internal-view title on disk and observed the modal refresh.
8. Rebuilt the artifact through the installed CLI.

The offline page issued zero HTTP(S) requests and raised zero page errors. The live editor raised zero page errors. These checks were performed by the parent, not the nested Codex session. Captures and results are generated under the ignored `dist/experience-acceptance/` directory.

## Regression checks and limits

A clean offline dependency install, type check, build, 34 native tests, and 38 Chromium tests passed. Coverage includes v1 preservation, v2 validation, asset containment/watchers, actual SVG geometry, the reported two-turn dense route, fallback routing, fixed text, nested/empty boundaries, flow directions, modal history/focus, text dragging, touch controls, source/save races, raw draft recovery, local SVG identifiers, real embedded fonts, and offline installed-package examples.

The post-save race test injects a newer source snapshot after the save reply while its preview is still rendering. It failed when that snapshot was discarded and passed after deferred events were drained before write controls resumed. Server shutdown also has a failing-then-passing regression for incomplete HTTP headers.

A fresh whole-branch review found two important issues. Enum validation coerced arrays into strings, and custom SVG text could bypass the minimum size through transforms or nested spans. Both have failing-then-passing regressions. Validation now requires actual strings. Custom templates fit uniformly, and each text run is measured in the fixed node frame. Coverage includes root/group transforms, nonuniform scaling, and span overrides. Legacy template sizing remains unchanged.

The small, dense, flowchart, desktop viewer, and touch captures were inspected. The dense routing check counts no forbidden overlaps in the compiled fixture; it does not establish a global optimum. Complex architecture routes retain their ELK fallback.

Chromium is the validated browser. Other browsers, large real repositories, native plugin-installation UI, and a public release were not exercised. The actual host check used Codex project-local skill discovery. Architecture and flowchart are implemented; other catalog types remain unsupported.
