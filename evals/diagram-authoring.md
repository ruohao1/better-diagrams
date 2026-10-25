# Diagram-authoring evaluation

Observed on 2026-10-25 with Codex CLI 0.164.0, Node.js 22.23.1, npm 10.9.8, and Google Chrome 155.0.8059.84 on Linux. This records a small integration smoke test. It does not establish a general quality or speed improvement.

## Setup

The controlled project had two files:

```ts
// src/router.ts
import { saveTask } from './store';
export async function postTask(id: string, text: string) {
  await saveTask({ id, text });
  return { status: 201 };
}

// src/store.ts
const tasks = new Map<string, { id: string; text: string }>();
export async function saveTask(task: { id: string; text: string }) {
  tasks.set(task.id, task);
}
```

Baseline and candidate used separate disposable copies under `/tmp/better-diagrams-eval-__pytqdy/`. The candidate received only this new skill in its project-local `.agents/skills/` directory. Existing host skills remained installed. No global configuration changed.

The candidate CLI came from `npm pack`, followed by an offline installation into a disposable prefix. Its `bin/` directory was placed on the child process's PATH. The baseline used a wrapper around the earlier checkout build. The candidate also received the subsequently added CLI help and symlink-entry fix. These differences and the different timeouts prevent a controlled performance comparison.

Both sessions received this prompt. The candidate also received `Use $diagram-authoring for this task.`

> Create an interactive codebase diagram of src/router.ts and src/store.ts using the installed better-diagrams CLI. Purpose and scope are already approved: show how postTask stores a task for maintainers; show function/component relationships, with source references and a deeper authored view for storage. Save editable source in a diagram/ directory and self-contained HTML at diagram.html. Use automatic layout, not authored coordinates. Return actual output paths and distinguish source checks from browser checks. Work only in this temporary project, use local files and CLI, and do not install dependencies, commit, push, or use another diagram generator.

The host command was:

```sh
codex exec --ephemeral --ignore-user-config --skip-git-repo-check \
  --sandbox workspace-write --json -C PROJECT -o LAST_MESSAGE_FILE -
```

The prompt was supplied on stdin. The parent allowed 90 seconds for the baseline and 180 seconds for the candidate.

## Observed results

| Check | Baseline without this skill | Candidate with this skill |
| --- | --- | --- |
| Skill activation | No diagram-authoring skill installed | Explicitly announced it and read its SKILL.md, format reference, and example |
| Source inspection | Inspected both files and discovered the schema from this checkout | Inspected both files and searched for callers |
| Generated document | 8 nodes, 2 views, 8 source references | 7 nodes, 2 views, 15 source references |
| CLI validation/build | Passed | Passed through the installed CLI |
| Browser in nested host | Launch blocked by sandbox permissions | Chromium wrapper and Chrome launches blocked by environment restrictions |
| Completion | Timed out after producing source and HTML; no final response file | Exited 0 and returned actual paths with rendering explicitly unverified |

The baseline already produced a valid document and HTML. The candidate used the supplied reference directly and completed its response. These observations support packaging, activation, and basic workflow compatibility. They do not prove that the skill improves diagram quality.

The candidate's details correctly describe the awaited storage call, synchronous map write, same-key replacement, in-memory lifetime, returned status object, and absent HTTP adapter. References use real paths and line numbers. Neither session invented repository permalinks for the disposable project.

Candidate artifacts were `candidate/diagram/diagram.json` and `candidate/diagram.html` under the temporary root. These paths are execution evidence, not committed release artifacts.

## Browser follow-through

The parent test environment could launch Chrome with its permitted process access. It exercised the candidate through the offline-installed `better-diagrams dev` command:

1. Opened a node and checked its source reference.
2. Edited the storage label and saved it to `diagram.json`; source references were preserved.
3. Changed the document externally and observed the title update in the browser.
4. Entered the storage view and exported its complete four-node SVG without editor controls.
5. Rebuilt the HTML through the installed CLI, reopened it offline, and entered the same storage view.

All checks passed. The offline page issued zero HTTP(S) requests, and the editor reported no page errors. A screenshot of the generated storage view was inspected. These are parent browser results; the nested Codex session did not perform them.

The separate automated suite covers the source-grounded agent-skill installation fixture, including its internal verification view, zoomed export bounds, browser editing, conflicts, live CSS/templates, and offline reopening. The Codex comparison uses the smaller two-file fixture so both runs have the same inspectable ground truth.

## Trigger counterexample

A fresh project had the same skill installed and received:

> Explain how to sort a numeric array in ascending order in JavaScript. Answer briefly in chat. Do not create files or a diagram, install dependencies, commit, or push.

Codex exited 0. It answered with `.sort((a, b) => a - b)` and explained mutation and string sorting. It ran zero commands and created no diagram files.

## Limits

- This is a reference skill, so repeated wording-pressure tests for discipline rules were not applicable.
- The evaluation starts with approved purpose and scope. It does not exercise a multi-turn clarification conversation or large-codebase authoring.
- Chromium is the tested browser. Other browsers and native plugin installation UI were not exercised.
- The portable manifest and skill resources passed package checks. Actual host activation was verified through Codex project-local skill discovery.
- No package was published, and no external installer was executed.
