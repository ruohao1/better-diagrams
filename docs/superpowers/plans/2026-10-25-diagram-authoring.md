# Better Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally editable, automatically laid-out diagram tool with useful node details, live source updates, standalone HTML, clean SVG export, and a working Codex skill.

**Architecture:** One structured source model drives a shared browser SVG compiler, viewer, and editor. A small Node process provides project reads, guarded saves, and file-change events; a thin agent skill writes source and invokes the CLI. Layout and SVG export use the browser's actual SVG/CSS measurements, including in standalone HTML.

**Tech Stack:** Node.js >=22.18.0; erasable TypeScript; native DOM/SVG; ELK.js; esbuild; Node test runner; Playwright/Chromium. ELK.js is bundled into the browser outputs; the packaged Node CLI uses built-in modules. Keep build/test dependencies out of the installed CLI's runtime dependencies. Avoid adding a UI framework, schema library, server framework, or TypeScript runner.

**Spec:** [Better Diagrams Design](../specs/2026-10-25-diagram-authoring-design.md)

## Global Constraints

- The project lives in its own better-diagrams repository. All implementation paths below are relative to that repository.
- Keep the design and this plan on the implementation feature branch and in its PR. Do not create a standalone planning PR.
- Node.js >=22.18.0; TypeScript uses erasable syntax and is type-checked separately.
- The compiler owns node placement and connection routing.
- Customization uses SVG components for the diagram surface, HTML for details, CSS for styling, and shared JavaScript interactions.
- Browser editing covers node text/details and graph structure. CSS and templates remain file-based with live preview.
- Watch diagram data, CSS, and templates. Application-source changes require the agent to update diagram source.
- Standalone HTML contains all authored views/details and makes no background network requests.
- SVG export contains the active complete view and its styling, excluding surrounding interface elements.
- Source writes stay within the selected diagram project. Preserve drafts and reject detected stale saves.
- The first integration is the CLI plus an installable skill, validated in Codex first.
- Public publishing, a public component package, automatic application-code analysis, and collaboration are outside this implementation.

## Review Focus

1. Long/Unicode labels, cycles, disconnected nodes, and groups must lay out without lost content or overlapping unrelated nodes: Task 2.
2. Script-shaped source text and template identifiers must remain data; assets must not escape the project or execute active markup: Tasks 3, 4, and 6.
3. Atomic file replacement, invalid intermediate source, and browser/source edits arriving in either order must preserve the last valid view and draft: Tasks 4 and 5.
4. Editing one shared node or removing it from one view must preserve references, custom data, other views, and valid group/edge membership: Task 5.
5. Reopened offline HTML and SVG from a zoomed internal view must retain all required assets, the selected scope, and complete bounds without UI: Tasks 3 and 6.

These are planning checks, not reported test results. Each condition has an owning test below.

---

## Delivery milestones

| Milestone | Tasks | Result and gate |
| --- | --- | --- |
| 1. Usable diagram | 1-3 | Generate an automatically laid-out HTML diagram, inspect node details, enter an internal view, and export a clean SVG. Reopen it offline. Layout and export must work before editor features begin. |
| 2. Live authoring | 4-5 | Edit nodes/connections in the browser, save source, and see external diagram-file changes. Prove that conflicts preserve drafts and reject stale saves. |
| 3. Customization and agent use | 6-7 | Change SVG components/CSS with live geometry updates, install the packaged CLI outside the checkout, and exercise the skill in Codex. |

The tasks are sequential: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7. Each task ends with a working, testable deliverable and its own implementation commit.

Native execution is recommended for this plan because the tasks share model and renderer contracts. Keep the implementation in one session and review the completed branch independently. Execution selected: native, authorized by the user to start work.

## Repository entry and delivery

- [x] Repository created at /home/ubuntu/projects/better-diagrams on feat/diagram-authoring. Initial inspection found README.md, .gitignore, and these design/plan documents; there is no application source or package configuration yet.
- [x] The design and plan are in their final repository-relative paths. They remain uncommitted and ship with Task 1, not in a separate PR.
- [x] The repository/package/bin/plugin name is better-diagrams. The initial package stays private; public publishing is outside this plan.
- [ ] Before execution, reread applicable AGENTS.md files and git status. Preserve any work added since planning.
- [ ] Start in the existing feature branch. The repository currently has no HEAD commit, so do not attempt to add a Git worktree yet. Task 1 creates the first commit with implementation and its planning documents together. Later isolation can use that commit as its base if needed.

This is one cohesive tool, not separate frontend/backend/plugin projects. Use one package and lockfile.

## File map

README.md, .gitignore, and the two planning documents already exist. All other files below are proposed implementation files.

| Files | Responsibility |
| --- | --- |
| package.json, package-lock.json, tsconfig.json | Package, pinned dependencies, native TS tests, type checking |
| scripts/build.mjs | Bundle CLI, viewer, editor, and browser test entry |
| src/model.ts | Source types and structural validation |
| src/project.ts | Contained project reads, hashes, saves, and file watching |
| src/protocol.ts | Browser/server snapshot and event types |
| src/html.ts, src/cli.ts | Safe standalone packaging and check/build/dev commands |
| src/server.ts | Loopback authoring endpoints and event stream |
| src/browser/compiler.ts | Measurement, ELK placement/routing, SVG scene, SVG serialization |
| src/browser/templates.ts | Default and custom inert SVG components/text binding |
| src/browser/viewer.ts, viewer-entry.ts | Shared exploration UI and standalone bootstrap |
| src/browser/editor.ts, editor-entry.ts | Draft editing, saving, conflicts, live transport bootstrap |
| src/browser/default-node.svg, default-theme.css, src/assets.d.ts | Built-in component/theme and asset import types |
| examples/skill-install/ | Small source-grounded acceptance diagram, stylesheet, optional templates |
| test/*.test.ts, test/browser/*.spec.ts, playwright.config.ts | Model/filesystem/CLI and real-browser behavior |
| plugin.json, skills/diagram-authoring/ | Portable plugin and self-contained workflow instructions |
| README.md, .github/workflows/check.yml | Local use, limitations, deterministic checks |

## Shared source contract

Task 1 defines these names in src/model.ts; later tasks import them rather than inventing variants.

```ts
type SourceRef = { path: string; line?: number; url?: string };
type DiagramNode = {
  label: string;
  details: string;
  references?: SourceRef[];
  template?: string;
  data?: Record<string, string>;
  childViewId?: string;
};
type DiagramEdge = { id: string; source: string; target: string; label?: string };
type DiagramGroup = { id: string; label: string; nodeIds: string[] };
type DiagramView = {
  title: string;
  detailLevel: string;
  nodeIds: string[];
  edges: DiagramEdge[];
  groups?: DiagramGroup[];
};
type DiagramDocument = {
  version: 1;
  title: string;
  purpose: string;
  audience: string;
  rootViewId: string;
  nodes: Record<string, DiagramNode>;
  views: Record<string, DiagramView>;
};
type ProjectInput = {
  document: DiagramDocument;
  themeCss: string;
  templates: Record<string, string>;
};
type ProjectSnapshot = ProjectInput & {
  revision: string;          // Hash of source and sorted project assets.
  documentRevision: string;  // Hash of exact diagram.json bytes.
};
```

Named views are authored detail levels, not guessed numeric depth. Groups are non-overlapping sets of nodes within one view; deeper structure uses childViewId. Directed graph cycles are valid; cycles in internal-view references are invalid. Empty views are valid so removing the last node does not break editing. IDs match `^[A-Za-z][A-Za-z0-9_-]*$`. Edges reference nodes in their view. Code URLs, when supplied, use HTTP(S). The schema contains no coordinates. Reject unknown schema fields instead of silently discarding them.

### Task 1: Define the source model and acceptance fixture

**Files:** Create package.json, package-lock.json, tsconfig.json, src/model.ts, test/model.test.ts, examples/skill-install/diagram.json. Preserve the existing README.md, .gitignore, design, and plan and include them in this first implementation commit.

**Interfaces:**
- Consumes: the shared source contract above.
- Produces: the exported types above and `parseDocument(value: unknown): DiagramDocument`, throwing a readable validation error.

- [x] **Step 1: Write model tests.** Load a seven-node overview and an internal verification view from the fixture. Include tests named accepts-install-flow, rejects-missing-endpoint, rejects-duplicate-membership, rejects-view-cycle, accepts-directed-cycle, and accepts-empty-view. Pin the important assertions:
  ```ts
  assert.equal(parseDocument(fixture).rootViewId, "overview");
  assert.throws(() => parseDocument(missingEndpoint), /missing/i);
  assert.throws(() => parseDocument(cyclicViews), /view.*cycle/i);
  assert.doesNotThrow(() => parseDocument(cyclicGraph));
  assert.doesNotThrow(() => parseDocument(emptyView));
  ```
- [x] **Step 2: Run** `node --test test/model.test.ts`. Expected: FAIL because the parser does not exist.
- [x] **Step 3: Implement** parseDocument and the fixture. Use direct checks for this small fixed schema. The overview has node IDs select, inventory, plan, recheck, install, verify, and receipt. Its Prepare group contains the first four; its Install group contains the last three. Include the recheck -> install connection across the groups. The verify node opens the verification view; include receipt there as a shared node to exercise edits. Code references use the spec's source revision. Keep preservation/failure branches in appropriate views. Do not execute or copy the installer.
- [x] **Step 4: Add only the tooling this task needs:** private ESM package version 0.1.0, TypeScript, @types/node, strict no-emit type checking, native TS-compatible imports, and test:unit/check scripts. Pin resolved versions in package-lock.json. No scaffolding generator.
- [x] **Step 5: Run** `node --test test/model.test.ts` and `npm run check`. Expected: all assertions pass and tsc exits 0.
- [ ] **Step 6: Commit the listed source, fixture, tooling, existing README.md/.gitignore, spec, and plan together** as `feat: define diagram source model`. This is the repository's first commit; do not create a separate documentation-only bootstrap commit.

### Task 2: Prove automatic SVG layout and clean bounds

**Files:** Create src/browser/compiler.ts, src/browser/templates.ts, src/browser/default-node.svg, src/browser/default-theme.css, src/assets.d.ts, scripts/build.mjs, playwright.config.ts, test/browser/layout.spec.ts; update package.json and package-lock.json.

**Interfaces:**
- Consumes: ProjectInput and parseDocument.
- Produces: `CompiledView = { viewId: string; svg: SVGSVGElement; bounds: { x: number; y: number; width: number; height: number } }`.
- Produces: `compileView(input: ProjectInput, viewId: string, host: HTMLElement): Promise<CompiledView>` and `exportSvg(view: CompiledView): string`.
- Produces: `instantiateNode(template: string, nodeId: string, node: DiagramNode): SVGSVGElement`; initially use the built-in template.

- [ ] **Step 1: Add ELK.js and browser-test/build tooling:** esbuild and @playwright/test. Add build/test:browser scripts; bundle compiler.ts to dist/test/compiler.js as an IIFE named DiagramCompiler for browser tests. Install Chromium for the test environment. This is test setup; no render success is claimed.
- [ ] **Step 2: Write layout tests.** Assert all seven overview nodes exist, unrelated node rectangles do not intersect, groups contain their members, and all routed coordinates are finite. Exercise the recheck -> install cross-group connection and verify its endpoints attach to the intended nodes after group coordinates are normalized. Add a cycle, disconnected node, and a long Unicode label. An empty view produces a valid empty SVG with positive finite bounds. Assert exported bounds contain labels, strokes, edge labels, and arrowheads. Assert the serialized scene has no foreignObject or interface controls.
  ```ts
  expect(svgNodeIds.sort()).toEqual(input.document.views.overview.nodeIds.slice().sort());
  expect(overlappingUnrelatedPairs).toEqual([]);
  expect(elementsOutsideExportBounds).toEqual([]);
  ```
- [ ] **Step 3: Run** `npx playwright test test/browser/layout.spec.ts --project=chromium`. Expected: FAIL on the missing compiler.
- [ ] **Step 4: Implement** compileView using native SVG measurement after styles/fonts are ready, then [ELK layered layout](https://github.com/kieler/elkjs) with [orthogonal routing](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html). Convert local group coordinates consistently. Use the bundled ELK browser entry without a separate worker asset. The same engine will run offline. Render labels as text; use the native DOM, not string interpolation of node content.
- [ ] **Step 5: Implement** exportSvg as serialization of the diagram scene with its theme and full measured bounds. Keep navigation/pan state outside export geometry. Add keyboard-focusable node activation and accessible node names as part of rendering.
- [ ] **Step 6: Run** the layout tests and `npm run check`. Expected: PASS. Inspect one screenshot for readable labels, obvious routing mistakes, and clipping; record the outcome rather than substituting geometric checks for visual review.
- [ ] **Step 7: Commit** as `feat: compile diagrams to automatic SVG layouts`.

**Gate:** If measurement, grouped routing, or clean SVG cannot pass this fixture, fix that here before building editor features.

### Task 3: Deliver an offline explorable HTML diagram

**Files:** Create src/browser/viewer.ts, src/browser/viewer-entry.ts, src/html.ts, src/project.ts, src/cli.ts, test/project.test.ts, test/cli.test.ts, test/browser/viewer.spec.ts. Modify scripts/build.mjs to emit dist/cli.mjs and dist/viewer.js; declare the better-diagrams bin in package.json.

**Interfaces:**
- Consumes: ProjectInput, ProjectSnapshot, compileView, exportSvg.
- Produces: `readProject(root: string): Promise<ProjectSnapshot>`.
- Produces: `buildStandaloneHtml(input: ProjectInput, viewerJs: string): string`.
- Produces: `runCli(argv: string[]): Promise<number>`.
- Produces: `ViewerHandle = { update(input: ProjectInput): Promise<void>; currentViewId(): string; destroy(): void }`.
- Produces: `mountViewer(host: HTMLElement, input: ProjectInput, options?: { initialViewId?: string; renderDetails?: (host: HTMLElement, nodeId: string) => void }): Promise<ViewerHandle>`. The details callback is an internal seam for Task 5; the default panel remains the standalone viewer behavior.

- [ ] **Step 1: Write tests** for contained project reads and CLI check/build, spawning the built dist/cli.mjs. In the browser, open the built HTML under file:// with network requests blocked; click Verify installed content, inspect references, Explore internals, return by breadcrumb, and export SVG after zooming. Assert the exported node set matches the active complete view and contains no toolbar, breadcrumb, or details panel.
- [ ] **Step 2: Add the source-injection case.** Put `</script><script>globalThis.pwned=true</script>` in a label/details field. Assert it remains visible text, pwned is undefined, and offline navigation still works. Assert an invalid or javascript: code URL is rejected.
  ```ts
  expect(backgroundRequests).toEqual([]);
  expect(await page.evaluate(() => Reflect.has(globalThis, "pwned"))).toBe(false);
  await expect(page.getByRole("heading", { name: "Verify installed content" })).toBeVisible();
  ```
- [ ] **Step 3: Run** `node --test test/project.test.ts test/cli.test.ts` and `npx playwright test test/browser/viewer.spec.ts --project=chromium`. Expected: FAIL on missing loader/commands/viewer.
- [ ] **Step 4: Implement** readProject for diagram.json plus optional theme.css/templates/*.svg. Validate document structure and contained asset paths; hash exact document bytes and sorted whole-project content separately. Implement source text/code links and distinct detail-level/view labels in the viewer. Cancel or ignore older asynchronous compiles; update must retain the last valid display on errors.
- [ ] **Step 5: Implement** safe HTML serialization with embedded project data and a single bundled viewer script. The script reads data, inserts CSS safely, and calls mountViewer. Implement `better-diagrams check PROJECT` with machine-readable source validation and exit 0/1, and `better-diagrams build PROJECT --out FILE.html`. Check/build must distinguish source validation from successful browser rendering.
- [ ] **Step 6: Run** `npm run build`, then the project/CLI and viewer test commands above. Build the fixture and reopen it offline. Expected: PASS with zero background requests, correct details/navigation, escaped data, and an unclipped diagram-only SVG.
- [ ] **Step 7: Commit** as `feat: build standalone explorable diagrams`.

SVG export is initially the browser action, available in both generated HTML and the editor. Do not add a second headless runtime renderer merely to expose another CLI command.

### Task 4: Add guarded local authoring and live source updates

**Files:** Extend src/project.ts, src/cli.ts, src/html.ts, test/project.test.ts, and scripts/build.mjs; create src/protocol.ts, src/server.ts, src/browser/editor-entry.ts, test/server.test.ts. Add dist/editor.js to the build outputs.

**Interfaces:**
- Consumes: readProject, ProjectSnapshot, parseDocument, mountViewer, and built browser assets.
- Produces in protocol.ts: `LiveSnapshot = ProjectSnapshot & { sequence: number }`, `ProjectEvent = { type: "snapshot"; snapshot: LiveSnapshot } | { type: "error"; message: string }`, and `ApiError = { code: string; message: string }`.
- Produces: `saveDocument(root: string, document: DiagramDocument, expectedDocumentRevision: string): Promise<ProjectSnapshot>`.
- Produces: `watchProject(root: string, onChange: (error?: Error) => void): () => void`.
- Produces: `startDev(root: string, options: { port?: number; editorJs: string }): Promise<{ url: string; close(): Promise<void> }>`.

- [ ] **Step 1: Write project/server integration tests** using disposable directories and an ephemeral loopback port. Assert an external rename-and-replace updates the source snapshot, malformed source emits an error without losing the last good snapshot, one of two same-base saves conflicts, and stale-save failure leaves file bytes unchanged.
- [ ] **Step 2: Add boundary tests.** An escaping template symlink/path must fail; browser saves must target only diagram.json; invalid documents fail before writing. A foreign Origin or missing session token receives 403. A JSON body above 2 MiB receives 413. A stale/invalid save leaves disk bytes unchanged; a successful save preserves one bounded pre-save copy. Browser draft preservation is exercised in Task 5.
  ```ts
  assert.equal(staleSave.status, 409);
  assert.equal(await readFile(documentPath, "utf8"), externalBytes);
  assert.equal(foreignSave.status, 403);
  ```
- [ ] **Step 3: Run** `node --test test/project.test.ts test/server.test.ts`. Expected: FAIL on missing authoring functions/endpoints.
- [ ] **Step 4: Implement** fixed same-origin endpoints: GET /api/project, GET /api/events using server-sent events, and PUT /api/document with `{ document, expectedDocumentRevision }`. Failures return `{ error: ApiError }`: CONFLICT/409, INVALID_DOCUMENT/422, FORBIDDEN/403, BODY_TOO_LARGE/413, BAD_REQUEST/400, or IO_ERROR/500. Use increasing sequence values for successful snapshots and save acknowledgements. Bind only to 127.0.0.1; validate Host/Origin, a random per-session save token, content type, and body size. Do not provide arbitrary file or shell endpoints.
- [ ] **Step 5: Implement** serialized local saves, current-byte revision rechecks, a bounded pre-save copy at .diagram-recovery/previous.json, and same-directory temporary-file replacement. Refuse escaping symlinks, including recovery paths. Watch the project directory so editor atomic replacements remain visible; debounce matching source/style/template changes and exclude outputs/recovery files. Surface watcher/I/O failures as diagnostics. Document optimistic cross-process limits instead of claiming filesystem compare-and-swap.
- [ ] **Step 6: Implement** `better-diagrams dev PROJECT`; the CLI loads its bundled editor.js and passes it to startDev. The initial editor-entry.ts mounts the existing viewer and applies source events as a live read-only preview. Print the actual local URL and close the HTTP server, watchers, and event streams on shutdown.
- [ ] **Step 7: Run** the project/server tests and `npm run check`. Expected: PASS with no writes outside the temporary project and no stale file overwrite in the tested cases.
- [ ] **Step 8: Commit** as `feat: serve live diagram authoring sessions`.

### Task 5: Support browser graph editing without losing work

**Files:** Create src/browser/editor.ts and test/browser/editor.spec.ts; extend src/browser/editor-entry.ts to connect the Task 4 shell, transport, and shared viewer.

**Interfaces:**
- Consumes: LiveSnapshot, ProjectEvent, DiagramDocument, and mountViewer.
- Produces: `EditorTransport = { save(document: DiagramDocument, expectedDocumentRevision: string): Promise<LiveSnapshot>; subscribe(listener: (event: ProjectEvent) => void): () => void }`.
- Produces: `mountEditor(host: HTMLElement, initial: LiveSnapshot, transport: EditorTransport): Promise<{ destroy(): void }>`.
- The browser entry supplies fetch/EventSource transport; save failures expose the ApiError code/message and preserve the draft. Editor state and draft behavior do not contain HTTP parsing.

- [ ] **Step 1: Write browser tests** for editing a label/details, adding a node and edge, removing a node from the current view, and Save -> source file -> refreshed preview. Assert changing a shared node updates its other appearances; removing it from one view preserves other views and cleans that view's edges/groups. Assert source references, template/data fields, and childViewId survive unrelated edits.
  ```ts
  expect(saved.nodes.receipt.references).toEqual(before.nodes.receipt.references);
  expect(saved.views.overview.nodeIds).not.toContain("receipt");
  expect(saved.views.verification.nodeIds).toContain("receipt");
  ```
- [ ] **Step 2: Write conflict tests** for a clean external change, a dirty external change, an older event/compile arriving later, an own-save event arriving before its response, and a rejected stale save. Assert drafts survive, older state never replaces newer state, and stylesheet-only changes do not erase edits.
- [ ] **Step 3: Run** `npx playwright test test/browser/editor.spec.ts --project=chromium`. Expected: FAIL because editing/draft behavior is absent.
- [ ] **Step 4: Implement** accessible fields and graph controls with explicit Save and clear dirty/saving/conflict/error status. Use the viewer details seam for node forms. Keep layout automatic. Name removal Remove from view; do not silently delete shared nodes globally. Do not add drag placement or an embedded CSS/source editor.
- [ ] **Step 5: Implement** baseline-revision draft tracking and ordered event handling. A clean incoming document replaces the baseline; a conflicting dirty document is held separately. Offer an explicit reload/discard action and draft JSON download for recovery. Reject stale saves without clearing the draft. Keep last valid rendering when draft/source validation fails.
- [ ] **Step 6: Run** editor tests plus project/server tests. Expected: PASS, including exact source preservation and source/browser update roundtrip.
- [ ] **Step 7: Commit** as `feat: edit diagram graphs with live source sync`.

### Task 6: Make customization and exports survive real content

**Files:** Extend src/browser/templates.ts, src/browser/compiler.ts, src/browser/viewer.ts, src/project.ts; create examples/skill-install/theme.css, examples/skill-install/templates/service.svg, test/browser/customization.spec.ts.

**Interfaces:**
- Consumes: existing ProjectInput.templates/themeCss, instantiateNode, compileView, exportSvg, and live source events.
- Produces: project template lookup through the existing instantiateNode contract; no second renderer or new public component API.

- [ ] **Step 1: Write tests** using two instances of a custom SVG component with a local clip/gradient identifier. Assert instance identifiers do not collide and label/data text is escaped. Assert an unknown template, foreignObject, script, event handler, or remote asset produces a useful diagnostic. No unsafe template is attached to the live document.
- [ ] **Step 2: Add integration assertions** that CSS font-size and template geometry changes cause measurement/routing to run again while a dirty draft is retained. Reopen custom HTML offline and export the internal view as SVG. Assert no external requests, no foreignObject, correct styles, complete bounds, and no interface elements.
  ```ts
  expect(new Set(svgIds).size).toBe(svgIds.length);
  expect(backgroundRequests).toEqual([]);
  expect(svgXml).not.toContain("foreignObject");
  ```
- [ ] **Step 3: Run** `npx playwright test test/browser/customization.spec.ts --project=chromium`. Expected: FAIL because project customization is not yet supported.
- [ ] **Step 4: Implement** native DOMParser validation and inert vector template cloning. Use a documented viewBox and text slots named label or data.KEY. Bind with textContent. Prefix local identifiers/references per node. Support vector primitives, text, gradients, and clipping; keep scripts, animation, arbitrary HTML, template style blocks, and remote resources out. Project CSS belongs in theme.css; self-contained data assets/system fonts are the initial asset contract.
- [ ] **Step 5: Implement** theme isolation from editor controls and geometry-aware recompilation. Serialize the diagram's actual styling into SVG. Ensure pan/zoom affects the screen, not which nodes/bounds are exported. Preserve accessible selection and focus as views change.
- [ ] **Step 6: Run** layout/viewer/editor/customization browser tests once, then inspect the default/custom overview and internal view screenshots. Expected: PASS with legible labels, clean exports, and a recorded visual assessment.
- [ ] **Step 7: Commit** as `feat: customize SVG nodes and themes`.

### Task 7: Package the CLI and validate the Codex workflow

**Files:** Create plugin.json, skills/diagram-authoring/SKILL.md, skills/diagram-authoring/references/source-format.md, skills/diagram-authoring/assets/minimal-diagram.json, test/package.test.ts, evals/diagram-authoring.md, .github/workflows/check.yml. Update the existing README.md and finalize package.json files/bin declarations.

**Interfaces:**
- Consumes: the check/build/dev CLI, source contract, and examples.
- Produces: a local npm tarball with the better-diagrams executable and prebuilt browser assets, plus a self-contained installable diagram-authoring skill and portable plugin manifest version 0.1.0.

- [ ] **Step 1: Before authoring the skill, apply the skill-creator and writing-skills workflows.** Record a baseline prompt and a narrower counterexample. Keep the skill limited to creating/updating these software diagrams and invoking the existing CLI; do not duplicate compiler logic.
- [ ] **Step 2: Write package tests.** Assert npm and portable plugin names/versions agree; the skill's example passes parseDocument; npm pack includes the CLI, both browser bundles, manifest, and skill resources while excluding dist/test/. Install the tarball into a disposable prefix, run its binary on the fixture outside the source checkout, and verify a standalone artifact opens offline.
  ```ts
  assert.equal(plugin.version, packageJson.version);
  assert.ok(packFiles.includes("skills/diagram-authoring/SKILL.md"));
  assert.equal(installedCheck.status, 0);
  ```
- [ ] **Step 3: Run** `node --test test/package.test.ts`. Expected: FAIL on missing packaging/skill resources.
- [ ] **Step 4: Implement** minimal portable plugin.json with root skills/ discovery, following [official OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins), and a skill with name/description plus self-contained source guidance. The workflow must inspect evidence, propose purpose/audience/scope/detail, wait for the user's content confirmation, author source, run check/build, and return actual artifact/editor locations with accurate validation claims. State that diagram source changes are watched, whereas application code changes require regeneration. Do not add an MCP server, hooks, credentials, or global configuration writes.
- [ ] **Step 5: Document** local installation, check/build/dev usage, node/detail authoring, customization limits, optimistic save conflicts, and browser SVG export. Configure CI for type checking, native unit/integration tests, build, and Chromium browser tests; keep authenticated host validation separate.
- [ ] **Step 6: Run** `npm ci`, `npm run check`, `npm run build`, `npm run test:unit`, and `npm run test:browser`, in that order. Expected: all exit 0. The package test performs npm pack and the disposable-prefix installation against that completed build.
- [ ] **Step 7: Start Codex in a disposable project with only this skill installed project-locally and the packaged CLI on its PATH.** Explicitly invoke diagram-authoring on the fixed install-flow prompt. Confirm purpose/scope, inspect generated source/details, edit/save in the browser, modify a diagram file externally, and reopen the exported HTML offline. Compare baseline/candidate and the counterexample. Record host version, actual commands/artifacts, observed behavior, and skips in evals/diagram-authoring.md. If authenticated host loading is unavailable, mark it unverified; packaging tests cannot substitute for this release acceptance.
- [ ] **Step 8: Commit** as `feat: package diagram authoring for coding agents`.

## Final acceptance and review

The finished feature branch contains both docs and all implementation tasks. Its implementation PR describes the actual resulting behavior and test evidence. No public package publication or deployment is part of this plan.

| Requirement | Owning tasks |
| --- | --- |
| Explicit purpose/detail and source evidence | 1, 3, 7 |
| Automatic layout, grouping, routing | 2 |
| Clickable details, internal views, breadcrumbs | 3 |
| Standalone offline HTML and clean active-view SVG | 2, 3, 6 |
| Source file watching and safe local saves | 4 |
| Browser node/edge editing and lossless roundtrip | 5 |
| Dirty/external conflict handling and diagnostics | 4, 5 |
| CSS/custom native SVG components and live geometry | 6 |
| CLI plus real Codex skill integration | 3, 4, 7 |

Self-review checklist:
- [x] Every agreed spec requirement maps to an owning task above.
- [x] Later signatures, field names, and revision semantics match the shared contracts.
- [x] Each task has a failing behavior test, the implementation step, an exact verification command, and an independently reviewable commit.
- [x] Every Review Focus condition appears in an owning task's assertions.
- [x] Test expectations in this document are predictions; runtime results are recorded only during execution.

## Documentation checked for this plan

The stack/API choices were checked against [Node TypeScript](https://nodejs.org/api/typescript.html), [Node filesystem](https://nodejs.org/docs/latest-v22.x/api/fs.html), [ELK.js](https://github.com/kieler/elkjs), [ELK orthogonal routing](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html), [esbuild](https://esbuild.github.io/api/), and [Playwright](https://playwright.dev/docs/intro). This verifies the intended APIs, not their behavior in this application.

The portable root plugin.json and skills/ layout follow [official OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins); project-local skill discovery and explicit invocation follow [official OpenAI skills guidance](https://learn.chatgpt.com/docs/build-skills). Verify the target host version when executing Task 7.
