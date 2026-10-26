# Better Diagrams

Better Diagrams creates software diagrams for people and coding agents.

## Language

**Diagram output**:
The generated diagram and its optional legend, without surrounding application UI. Node details and internal views are available through exploration modals.
_Avoid_: Viewer page

**Diagram type**:
A family in the diagram catalog: architecture, flowchart, sequence, state machine, entity relationship, or dependency graph. Each family defines the meaning of its visual elements and relationships.

**Exploration modal**:
An overlay that displays a selected node's details or an internal view of the diagram.
_Avoid_: Sidebar, permanent details panel

**Internal view**:
An authored diagram that shows structure inside a selected node. It opens in an exploration modal.

**Internal-view indicator**:
A small mark at the top right of a node that has an internal view.

**Architecture node**:
A fixed-size visual element representing part of an architecture, with a title, a short summary, a background color, a border, and an optional logo at the top left.

**Node size preset**:
A named fixed width and height. A view uses one preset for all architecture nodes, or a preset for each flowchart step kind.

**Node summary**:
The short description visible inside an architecture node. Full explanations are available in the exploration modal.

**Connection**:
A typed, directed relationship between nodes. Label requirements depend on the diagram type.

**Flowchart step**:
A node representing an action, a decision, a start, or an end in a flowchart.

**Main path**:
An authored sequence of flowchart steps that represents the view's primary flow.

**Boundary**:
A named architectural grouping that can contain nodes and other boundaries.

**Legend**:
An optional key to the symbols and connection meanings used in a view. It can also contain a compact diagram title and detail level.
