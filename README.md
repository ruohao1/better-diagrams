# Better Diagrams

An agent-friendly diagram compiler and browser editor with automatic layout, explorable node details, live source updates, and self-contained HTML and SVG exports.

The design and implementation plan are ready. Application implementation has not started.

- [Design](docs/superpowers/specs/2026-10-25-diagram-authoring-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-25-diagram-authoring.md)

The plan has three delivery milestones:

1. **Usable diagram:** source model, automatic SVG layout, node details, internal views, and offline HTML/SVG exports.
2. **Live authoring:** browser graph edits, source saves, file watching, and draft-preserving conflict handling.
3. **Customization and agent use:** SVG templates, CSS themes, packaged CLI, and an installable skill validated in Codex.

Start with the source model and installation-flow fixture. Prove layout and clean export before building editor features.

Keep the design and plan with the implementation branch and its pull request.
