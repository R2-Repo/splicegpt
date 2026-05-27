# Engine refactor V1 fiber group routing contract

This document defines the V1 planning target for the next SpliceGPT engine refactor. The goal is not to copy the older reference rules verbatim. The goal is to build a better deterministic engine from the lessons learned while keeping the app front-end only.

## Product goal

A Bentley CSV import should automatically create a clean splice detail diagram. The ideal import needs no user cleanup. Acceptable imports should require only small manual adjustments.

The app should optimize layout before the user sees the canvas. Manual dragging should be a polish tool, not the normal way to make the diagram readable.

## Architecture target

CSV to diagnostics to normalized splice model to cable, tube, and fiber grouping model to optimized layout plan to fiber group routing plan to React Flow shell plus SVG route overlay to future PDF export.

React Flow is the interaction shell only. The engine owns model, layout, grouping, and routing.

## Diagram zones

The diagram is divided into hard visual zones:

- Left cable zone
- Left buffer tube zone
- Left fiber color and OS label zone
- Center routing zone
- Right OS and fiber color label zone
- Right buffer tube zone
- Right cable zone

Fiber strand routes may only run inside the center routing zone. Routes must not pass through cable bodies, buffer tubes, fiber color labels, OS names, or outside cable areas.

## Vertical alignment model

Cable nodes on the same side should align to one vertical cable column.

The following elements should align vertically within their side columns:

- cable nodes
- buffer tube fan-out groups
- fiber strand fan-outs
- fiber color abbreviations
- OS names

The layout may dynamically shift groups up or down and may expand spacing between groups, but grouped elements must remain together. Flexibility is allowed at the group level, not by randomly stretching individual strands.

## Fiber group definition

A fiber group is two or more fiber strands from the same buffer tube.

A single fiber strand can route independently, but it is not a fiber group.

Fiber groups are normally created from adjacent or related fibers in one buffer tube. Many fibers are naturally paired. A duplicated OS name on both strands is a strong hint that those fibers should be treated as a nested pair when they are in the same buffer tube.

Primary grouping signals, in order:

1. same buffer tube
2. same target cable and target tube
3. same OS name
4. adjacent fiber color-code order

A fiber group cannot mix fibers from different buffer tubes.

## Nesting

Nested routing means related fiber strands travel as a clean ordered bundle.

Fiber groups should be nested in standard fiber color-code order: BL, OR, GR, BR, SL, WH, RD, BK, YL, VI, RO, AQ.

The group may move as a unit, but the engine must not stretch, compress, reorder, or split the group unless the fibers route to different target cable or target tube groups.

Spacing inside a fiber group is fixed and even. Fiber-to-fiber spacing should remain consistent across the full route span. Groups should not become too tight or too loose.

## Buffer tube group spacing

Fibers inside one buffer tube stay together in color-code order.

The layout engine may increase the vertical gap between buffer tube groups to create more routing room. This is the main vertical flexibility mechanism.

Allowed:

- shift a whole fiber group up or down
- increase spacing between buffer tube groups
- increase spacing between separate routing groups

Not allowed:

- change the order of fibers inside a buffer tube
- stretch spacing within a nested group
- compress spacing within a nested group
- mix strands from different buffer tubes into one group

## Center routing zone

The center routing zone is the only area used for splice routing. It should be used across its full width.

The routing engine should allocate center lanes across the available width instead of crowding all routes near the midpoint.

Conceptually:

- vertical lanes are X positions in the center zone
- horizontal rows are fiber Y positions
- routing corridors are reserved lane blocks for nested fiber groups

## Fiber strand route shape

A fiber strand is made of two legs joined by a splice dot.

Across both legs combined, a fiber strand may have at most two 90-degree bends.

Preferred route order:

1. straight horizontal route when source and target rows align
2. H-V-H route when source and target rows differ
3. same-side loop route when both endpoints are on the same canvas side

Do not solve conflicts by adding zig-zag paths or extra bend tracks.

## Crossings vs stacking

Crossings are sometimes unavoidable and are allowed when they are readable.

Allowed:

- a horizontal strand crossing a vertical strand
- a controlled crossover inside a same-side loop group

Not allowed:

- vertical strand stacked on top of another vertical strand
- horizontal strand stacked on top of another horizontal strand
- routes closer than the minimum spacing threshold
- unrelated groups visually merged without separation

The collision system should prevent parallel overlap and spacing violations. It does not need to prevent every horizontal and vertical crossing.

## Cross-side routing

For normal left-to-right or right-to-left groups:

- preserve nested fiber order
- keep the group together through the center routing zone
- assign distinct center lanes with fixed spacing
- allow horizontal and vertical crossings when needed
- never use same-side loop crossover behavior

If a subset of fibers peels off to a different cable or tube, that subset becomes a separate fiber group before routing.

## Same-side loop routing

Same-side routes need their own route template.

Examples: left to center to left, or right to center to right.

Rules:

- max two 90-degree bends across both legs
- one intentional crossover event is allowed inside the loop group
- the crossover should happen at only one bend zone
- this crossover behavior is only allowed for same-side loops
- normal cross-side routes must not use this crossover behavior

## Diagnostics and acceptance

The import should produce diagnostics before rendering if something is structurally wrong.

Required diagnostics:

- missing source or target anchor
- duplicate connection after Bentley mirror dedupe
- cable leg identity conflict
- fiber group with mixed buffer tubes
- fiber group order violation
- route outside center routing zone
- route through OS, label, tube, or cable zone
- more than two bends
- stacked vertical route
- stacked horizontal route
- spacing violation inside a nested group
- spacing violation between separate groups

## V1 implementation sequence

1. Fix Bentley CSV semantics and cable-leg identity.
2. Build a normalized model where every valid splice row has exactly one source anchor and one target anchor.
3. Add fiber group detection using same-buffer-tube membership first.
4. Add nested ordering and fixed spacing rules for groups.
5. Add layout-level vertical flexibility between buffer tube groups.
6. Replace midpoint routing with center-zone lane allocation.
7. Add separate cross-side and same-side-loop route templates.
8. Add diagnostics and fixture checks before PDF and export work.

## Non-goals for V1

- backend services
- full PDF export
- non-Bentley CSV formats
- arbitrary manual splice authoring
- copying the older rule engine directly without simplification
