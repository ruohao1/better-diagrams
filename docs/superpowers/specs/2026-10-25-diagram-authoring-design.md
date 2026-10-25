# Better Diagrams Design

Date: 2026-10-25
Status: agreed product direction; implementation choices below are proposed for plan review.
Name: better-diagrams (repository, package, CLI, and plugin). Agent skill: diagram-authoring. The project lives in its own better-diagrams repository.

## Intent and success

Build a diagram compiler and browser authoring tool that coding agents can use through a small installable skill. The first use is explaining software architecture and request/workflow flows from repository evidence.

The replacement must address three observed problems with Archify: clicking a node did not reveal useful details, exports included the surrounding interface, and the diagram's purpose did not make its level of detail clear.

A successful first workflow is: an agent proposes the purpose and visible scope; the user confirms it; the agent writes diagram source; the compiler lays it out; the user explores and edits it; external diagram-file changes update the browser; and clean, portable artifacts can be exported.

## Approaches and chosen boundary

We considered a plugin that generates a custom page for every diagram, a standalone component library, and a compiler/editor with a thin agent integration. The chosen direction is the compiler/editor. Shared rendering and export behavior belong in the tool; the agent supplies intent and evidence. Components remain internal until a real embedding use requires a public library.

The authoring session runs locally. The exported HTML works independently. The existing agent-skills marketplace is only a read-only acceptance fixture, not the destination for this implementation. Keep this design and its plan on the eventual implementation feature branch and include both in the implementation PR.

## Agreed requirements

- The compiler owns node placement and connection routing.
- Agents propose purpose, audience, scope, and detail level before generating a diagram.
- Node clicks open explanations and code references in a details panel.
- A separate Explore internals action opens an authored deeper view; breadcrumbs lead back.
- Browser editing covers node text/details and graph structure. CSS and templates remain file-based with live preview.
- The local session watches diagram data, CSS, and templates. Application-source changes require the agent to update diagram source.
- Customization uses SVG components for the diagram surface, HTML for details, CSS for styling, and shared JavaScript interactions.
- Export standalone HTML with all authored views and details embedded.
- Export a static SVG of the active diagram view and detail level, excluding surrounding interface elements.
- Start with a compiler/editor CLI and an installable skill; validate the full workflow in Codex first.

## Source and views

A project contains diagram.json, optional theme.css, and optional templates/*.svg. The document contains a schema version, title, purpose, audience, root view, canonical nodes, and named views. Nodes have stable identifiers, labels, details, code references, optional template data, and an optional link to an internal view. Views select nodes, directed connections, groups, and a declared detail level. Connections belong to a view; a node may appear in several views.

The source contains relationships and content, not manually assigned coordinates. The first schema supports architecture and workflow node/connection diagrams. Specialized sequence timelines, state-machine validation, and general chart types are outside this first version.

Browser edits change the structured document. Saving an edited label must preserve the node's references, custom data, template choice, and links to deeper views. Removing a node from one view must not delete it from other views. The initial browser controls add/remove nodes and connections in a view and edit node content; advanced template/CSS changes remain source edits.

Code references contain a repository-relative path, optional line number, and an optional supplied HTTP(S) permalink. Show paths as text when no verified URL is available. The compiler checks the diagram's structure, not whether its claims match the application code. The agent and human review own semantic correctness.

## Rendering and customization

Use one browser rendering engine for local preview and standalone HTML. It validates native SVG templates, binds text safely, measures SVG content with the actual stylesheet, calls the layout engine, and produces the diagram surface. This keeps browser measurement, placement, and export on the same path.

The proposed engine is TypeScript with native DOM/SVG and ELK.js for layout. ELK supplies placement rather than a complete UI framework. [ELK.js documentation](https://github.com/kieler/elkjs)

SVG templates contain inert vector components and text slots. They do not contain arbitrary HTML, scripts, event handlers, or remote resources. Details panels use semantic HTML and safely inserted text/links. User-provided node strings are data, not executable markup. Theme changes that affect geometry cause measurement and layout to run again. Prefer system fonts and self-contained assets initially.

The active view supports node selection, fit/pan/zoom, keyboard activation, details, and navigation to internal views. The complete authored view remains the export boundary even when the screen is panned or zoomed. Static SVG contains the scene and its styling; its bounds must include labels, connections, strokes, and arrowheads.

## Authoring and synchronization

A local process reads the selected project, serves the editor, watches its diagram files, and accepts document saves. The browser never infers source from rendered DOM.

Use explicit Save as the initial operational default. Clean drafts accept newer source automatically. An external document change with unsaved browser edits preserves the draft and shows a conflict. A stale save is rejected. Stylesheet/template-only changes can update the preview without discarding a document draft. An invalid edit shows diagnostics while preserving the last valid preview.

Use exact document-byte revisions for stale-save checks and a separate whole-project revision for CSS/template changes. Order live messages so an older compile or save response cannot replace a newer view. File watching must survive normal editor rename-and-replace saves. Source writes are limited to the selected project's diagram document and must not follow escaping symlinks.

Conflict protection is optimistic for a single local authoring session. Revision checks and same-directory replacement prevent ordinary stale saves and torn writes; they are not a cross-process filesystem transaction. Retain a recoverable pre-save document, and document the remaining race with an uncoordinated external writer.

## Artifacts and commands

The proposed CLI commands are better-diagrams check PROJECT, better-diagrams build PROJECT --out FILE.html, and better-diagrams dev PROJECT. Check reports source/model validation as machine-readable output. It must not imply that visual quality or rendering has been checked.

Build packages the validated model, styles, templates, and viewer bundle into one HTML file. Layout runs in the browser, where SVG/CSS can be measured accurately. The exported viewer needs no local server or agent and must make no background network requests.

SVG export is an action in both the editor and exported viewer. It serializes the current complete view from the same rendering engine. A separate headless CLI-to-SVG renderer is not required for this first version.

## Proposed technical choices

These are implementation recommendations, not extra user requirements:

- Node.js >=22.18.0 and TypeScript using erasable syntax. Native type stripping allows unit tests without another TypeScript runner; type-check separately. [Node.js TypeScript documentation](https://nodejs.org/api/typescript.html)
- Native browser DOM/SVG, with ELK.js as the layout dependency.
- esbuild for browser/CLI bundles; no initial UI framework or public component package. [esbuild documentation](https://esbuild.github.io/api/)
- Node's HTTP, filesystem, crypto, and test modules. Use server-sent events for source updates.
- Playwright for real-browser acceptance checks; Chromium is the initial tested browser. [Playwright documentation](https://playwright.dev/docs/intro)
- An installable skill in skills/diagram-authoring/ and a portable root plugin.json. No MCP server is needed for a shell/CLI workflow. [Official OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)

Resolve and lock dependency versions at implementation time. Public publishing, licensing, cloud hosting, and multi-user collaboration are separate decisions. The selected package name does not establish registry availability. Do not invent production release metadata.

## Acceptance fixture

Use a distilled diagram of the real product-brief installation flow in ruohao1/agent-skills: select -> inspect existing configuration -> plan -> recheck -> invoke installer -> verify -> save receipt. Add an internal verification view and source links. Include preservation and failure branches at an appropriate detail level.

The trace was read from committed setup sources at revision 2368e346ec4bc9a86c793cb6f012d7fa5bb0c0aa. No installer was run. Relevant entry points include scripts/setup.py:430, scripts/setup.py:346, scripts/setup.py:245, and scripts/setup_inventory.py:155. The fixture is authored graph data; it does not copy or execute that installer.

## Observable release checks

The fixture must demonstrate automatic layout, useful node details, a deeper view with breadcrumbs, browser-edit/source-save roundtripping, external-file refresh, preserved drafts on conflicts, and invalid-source recovery.

Reopen the generated HTML under file:// with network disabled. Explore all authored views and export the active view as SVG. The SVG must exclude controls/panels and retain its styling and complete content bounds. Check long/Unicode labels, a directed cycle, disconnected nodes, group membership, and custom template identifiers that would otherwise collide.

Run a Codex session in a disposable project using the installed skill and packaged CLI. Record which host/version was actually exercised. Deterministic tests and a package install do not establish host skill activation.

## Current evidence and limits

The design comes from the user's decisions and read-only inspection of the acceptance fixture. Browser API and packaging documentation were checked. No prototype, runtime export, layout benchmark, package installation, or authenticated Codex integration test has been run for this tool.
