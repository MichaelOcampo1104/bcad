# bcad — Agent / Development Log

> Living document for future development sessions. Captures architecture,
> current state, design decisions, and the roadmap. Update this as the app
> evolves so context is never lost between sessions.

## What bcad is

A browser-based 2D/3D drafting CAD — draw **nodes** and **members** (line
elements), tag them with editable labels, and export to CSV/JSON for downstream
use in STAAD, PLAXIS, and other engineering tools.
top toolbar · left tools · center 3D viewport · right properties + model-tree ·
bottom status bar.

**Stack:** Vite + TypeScript + Three.js. No backend, no framework — plain DOM
panels wired imperatively. Single source of truth is the `Model`.

## Current state (as of 2026-08-02)

**v1 is working end-to-end.** Confirmed features:

- ✅ SkyCiv-style layout: toolbar, left panel, right panel, status bar all render.
- ✅ **Tools** (keys 1–4): Select, Node, Line (member, with rubber-band preview),
  Delete. Click-vs-drag detection so orbit/pan never accidentally places nodes.
- ✅ **2D + 3D modes**: orthographic drafting (rotation locked) ↔ perspective
  orbit. View presets: Top / Front / Side / Iso. Frame-All.
- ✅ **Snap** to grid + existing nodes, with on-screen snap marker. Adjustable
  spacing (left panel).
- ✅ **Tagging**: nodes/members auto-labeled (N1, M1…), labels editable inline in
  the right Properties panel. Coordinates (X/Y/Z) editable there too.
- ✅ **Spreadsheet grids** (left panel): synchronized Node (X/Y/Z) + Member
  (A/B/Tag) editors. Enter moves down/across; cells commit to the Model on
  change. Reactive: entities drawn with the mouse, pasted, or loaded also appear.
  - **Delete rows**: hover-reveal × in the # cell (committed removes the entity;
    draft clears the cells).
  - **Paste rows**: lenient parse — one entity per line, values tab/comma/space
    separated (Excel/CSV/plain text). Nodes want `X Y Z`; members want `A B tag`
    (tag optional). Junk lines skipped. Single-number paste into a cell behaves
    normally (not intercepted).
  - **Scroll + counts**: grid body scrolls independently (headers pinned) past
    320px; a footer shows the live node/member count so it's clear more rows
    exist below the fold.
- ✅ **Model tree** (right panel): lists all nodes + members; click to select +
  frame in view.
- ✅ **Export**: CSV (`bcad_nodes.csv`, `bcad_members.csv`) + JSON project
  save/open (round-trippable).
- ✅ **Resizable panels**: left and right panels are draggable via splitter
  handles (double-click resets; arrow keys nudge). The 3D viewport reflows
  automatically via its `ResizeObserver`.
- ✅ **Copy & Array tools** (left panel, "Copy & Array" block): operate on the
  live selection (node or member). Two modes:
  - **Linear** — offset X/Y/Z. Copy = one duplicate; Array = N copies stepping
    along the offset. The new copy becomes the selection, so repeated Copy walks
    the offset (great for a row of columns).
  - **Polar** — rotate about a center (X/Y) by an angle (degrees) around Z.
    Copy = one rotated copy; Array = N copies around the pivot. Angle = 0 in
    Array means "full circle" (360°/count auto-distributed). For a member, both
    endpoints are duplicated, so a beam becomes a ring of radial beams.
  - Batch ops emit a single Model change event; copies snap/dedupe onto existing
    geometry. Enter = Copy, Ctrl/Cmd+Enter = Array.
- ✅ **Multi-select + deselect** (Select tool):
  - Click selects one; **Ctrl/Cmd-click (or Shift-click)** adds/toggles;
    click an already-selected entity to **deselect** it; click empty space or
    **Esc** clears. Works identically in the viewport and the Model Tree.
  - Copy/Array/delete operate on the **whole set** (connected copied groups stay
    connected via an old-id→new-id map). Multi-member retag via a bulk Tag
    dropdown in Properties.
  - `App` is the single source of truth for selection — viewport clicks now also
    update Properties / Tree / Copy&Array (previously only tree clicks did).
- ✅ Keyboard: 1–4 tools, Delete/Backspace removes selected, Esc cancels line / clears selection.
- ✅ Hot-reload dev server, strict typecheck + production build both pass.
- ✅ Pushed to GitHub: https://github.com/MichaelOcampo1104/bcad (branch `main`).
- ✅ **Loads & Combos domain** (new) — load cases, nodal loads, member point/distributed loads, load combinations. Tabbed data section in left panel: [Nodes] [Members] [Loads] [Combos]. Each tab has its own spreadsheet/editor panel.
  - **LoadsPanel**: case filter dropdown, +Add/Rename/Retype/Delete case, loads table (type badge, target, magnitude summary), inline editor (adapts to load kind), +Add Load buttons (auto-creates case if none exists).
  - **CombosPanel**: combinations table with factor summary (e.g. "1.2DL+1.6LL"), inline editor with one factor input per existing case, +Add button.
  - **STAAD .std parser** (`src/io/std.ts`): state-machine parser for `JOINT COORDINATES`, `MEMBER INCIDENCES`, `SUPPORTS` (PINNED/FIXED/FIXED BUT), `LOAD n`, `JOINT LOAD`, `MEMBER LOAD` (UNI/CON), `LOAD COMB`. Handles comments (`*`), continuation hyphens, `;`-separated data, `TO` ranges. Lossy by design (drops materials, sizing, design params).
  - **Python combo importer** (`src/io/pythonCombos.ts`): parses `basic_loads_data` and `load_combinations` from `.py` scripts using brace/bracket matching. Appends to existing model.
  - **LoadsView** (`src/render/LoadsView.ts`): 3D arrow visualization — force arrows (colored by case, auto-scaled to model extent) + moment arcs (torus segments) for nodal loads; point and distributed member load arrows. Palette cycles 10 stable colors per case id.
  - **STAAD .std exporter** (`writeStd`/`exportStd`): serializes model to STAAD command syntax (lossy).
- ✅ **Auto-show loads after file open** — when a file (.std, .json, .py) containing load cases is opened, the toolbar Loads toggle automatically turns ON and the first case is selected. No more manual toggling to see imported loads.
- ✅ **Right panel split layout** — Properties section (scrollable, max 45vh) separated from Model Tree (fills remaining space) by a visual border. No more clash between long property forms and the tree.
- ✅ **Member fixity visualization + editing** — 3D view shows orange torus rings at released member ends (inset from node along member axis). Color-coded: green (all MX/MY/MZ), blue (MZ only), pink (other combos). Properties panel has MX/MY/MZ toggle buttons per end (Start/End) for precise release control. Bulk fixity via multi-select also uses toggle grids.
- ✅ **Left panel help text** — moved to a fixed bottom section so it never overlays tab content (loads/combos/grids) when scrolling.
- ✅ **DEFINE UBC LOAD + JOINT WEIGHT** — parser extracts UBC seismic parameters (ZONE, I, RWX/RWZ, STYP, CT, PX/PZ, NA/NV) and joint weights on nodes. `UBC LOAD X/Z` commands are tracked on load cases via `ubcDirection`. Writer reproduces the full block on export. Joint weight is editable in Properties panel when a node is selected.
- ✅ **Section keyword system** — Section dropdown now shows STAAD keywords (PRIS, TABLE ST, TAPERED, UPTABLE, PIPE, TUBE, CHANNEL, ANGLE) instead of generic shape names. `sectionStaadKeyword` stored on each member for faithful round-trip. Section props input adapts label/placeholder per keyword. MEMBER <tag> data lines (COLUMN, RAFTER, SEC BEAM ROOF, etc.) parsed correctly.
- ✅ **Raw STRENGTH round-trip** — Full strength line (FY, FU, RY, RT for steel; FCU for concrete) stored verbatim per material type and written back in export.
- ✅ **CONSTANTS MATERIAL MEMB fix** — Parser now correctly skips the `MEMB` keyword in `MATERIAL STEEL MEMB <list>` format, so material/grade assignments work.
- ✅ **START USER TABLE** — Entire block parsed verbatim and round-tripped in export (TABLE number, units, profile name, geometry). Placed between DEFINE MATERIAL and MEMBER PROPERTY to match original file structure.
- ✅ **Parser stops at FINISH** — Main loop breaks on FINISH, preventing analysis output statistics from being parsed as commands. LOAD handler validates numeric ID before creating a load case.
- ✅ **Member local axes** — Shift+O or toolbar Axes toggle shows x/y/z arrows at each member's midpoint. Blue (x, along member), Red (y, perpendicular), Green (z, cross product). Follows STAAD local-axis convention.
- ✅ **Spring support parsing** — ELASTIC MAT, KFX/KFY/KFZ spring constants after FIXED BUT, and SPRING COMPRESSION blocks parsed and round-tripped.
- ✅ **REPEAT in JOINT COORDINATES** — REPEAT ALL and REPEAT n expanded into explicit joint coordinates. Non-ALL REPEAT uses original definitions as source with cumulative offsets.
- ✅ **ELEMENT INCIDENCES** — Plate/shell elements parsed with TO ranges and REPEAT expansion, stored as BcadElement with 3-4 node IDs. Exported with TO grouping. Rendered as semi-transparent blue wireframe in viewport.
- ✅ **Element UI** — Elements appear in Model Tree, editable in Properties panel (node ID fields), pickable in 3D view (white highlight on selection), deletable. "+ Add Element" button in Properties creates elements with editable nodes.
- ✅ **Joint range interpolation** — Non-consecutive IDs in JOINT COORDINATES (`1 0 0 0 5 2.4 0 0`) create all intermediate joints with linearly interpolated positions. Chained definitions (`;`-separated or space-separated) supported.
- ✅ **Member range shortcuts** — Non-consecutive member IDs in MEMBER INCIDENCES (`1 1 2 4`) create all intermediate members with incrementing node pairs. Supports chained (`;`-separated) definitions.
- ✅ **Spring support indicator** — Teal diamond (`◇`) shown beside fixity markers for nodes with spring stiffness or subgrade modulus.
- ✅ **Floor load parsing** — FLOOR LOAD blocks parsed with YRANGE/LOAD syntax, stored as FloorLoad type. Editor shows Y min/Y max/Magnitude fields. Loads table shows FL badge. Round-tripped in export.
- ✅ Pushed to GitHub: https://github.com/MichaelOcampo1104/bcad (branch `feat/loads-and-combinations`).
- ✅ **Branch cleanup** — `feat/loads-and-combinations` was fully merged into
  `main` (identical trees) and deleted locally + on GitHub. All work now lives on
  `main`.
- ✅ **Python importer extended** (`src/io/pythonCombos.ts`) — used to drive
  member loads from scripts like `ST31_Load_combinations.py`:
  - `ele_map` now parses `range(a,b)`, `list(range(a,b))`, and mixed explicit
    lists (fixes a latent bug — `list(range(...))` values previously broke the
    map parse and only the first `[..]` entry survived).
  - `basic_loads_data` rows accept two optional extra columns: **Distribution**
    (`"linear"` = interpolate Val_Start→Val_End down the mapped member list in
    order, one uniform load per member; e.g. lateral soil 0 at the top member →
    max at the bottom) and **Axis** (`"x"|"y"|"z"`, default `y` for vertical
    gravity; use `"x"` for lateral wall loads so they act horizontally).
  - Numeric variables (`NAME = 130`, trailing comments allowed) defined at the
    top of the script can be referenced in Val_Start/Val_End, including
    `-NAME` for sign-flipped rows, so magnitudes are edited in one place.
  - Verified end-to-end against a 34/35/9/11-member wall model.

## Architecture

### Layering
```
main.ts → App.ts (composition root)
            │
            ├── Model          (data: nodes/members + change events)  [single source of truth]
            ├── SceneView      (Three.js: scene, cameras, controls, picking, sync to Model)
            │     ├── Grid     (grid + colored X/Y/Z axes on XY plane)
            │     └── Labels   (CSS2DRenderer text overlay)
            ├── ToolController (mouse events → tool actions; click vs drag)
            │     └── Snapper  (snap to nodes, then grid)
└── UI panels      (pure DOM; read Model, call back to App)
      ├── Toolbar / LeftPanel / RightPanel / StatusBar
      ├── CopyArray  (Copy & Array command block, linear + polar)
      ├── Splitter   (draggable panel-width handles)
      └── helpers (el, button, Toggle, Segmented)
```

**Key invariant:** `Model` is the only state holder. The 3D view and every DOM
panel subscribe to `Model.on(change)` and re-render from it. Selection lives in
`App` (a `SelectionSet` = `Selection[]`) and is pushed into both the view
(`view.setState`) and the panels. **All** selection changes — viewport clicks,
model-tree clicks, keyboard — funnel through one `App.setSelection`, so the view
and panels never drift (this also fixed a latent bug where viewport clicks only
wrote to the view, not the panels).

### File map
| File | Responsibility |
|------|----------------|
| `src/types.ts` | `BcadNode`, `BcadMember`, `Tool`, `ViewPreset`, `ProjectionMode`, `Selection`, `SelectionSet` (= `Selection[]`), `selKey()`, `ModelSnapshot` |
| `src/model/Model.ts` | In-memory store: add/update/remove nodes+members, auto-id/label, dedup, spatial queries (`findNodeNear`/`findNodeAt`/`membersAtNode`), **copy/array (linear + polar, single + set-aware)**, `removeSelections`, `snapshot()`/`load()`. Batch adders use silent `putNode`/`putMember` + a single emit. |
| `src/render/SceneView.ts` | Three.js scene, persp + ortho cameras, OrbitControls, picking (`pick`), plane projection (`pointerToPlane`), rebuilds meshes/labels on Model changes; selection is a `SelectionSet` (one key-set for O(1) highlight) |
| `src/render/Grid.ts` | `GridHelper` rotated to XY plane + colored axis lines |
| `src/render/Labels.ts` | `CSS2DRenderer` label layer; add/remove per-entity text labels |
| `src/interact/ToolController.ts` | Binds pointer events on canvas; implements each tool; modifier-click multi-select; reports selection to `App` via `onSelect` (App = source of truth) |
| `src/interact/Snapper.ts` | Snap priority: existing node (tol) → grid → raw |
| `src/ui/Toolbar.ts` | Top bar: New/Open/Save/Export, view presets, 2D/3D, Snap/Labels/Grid toggles |
| `src/ui/LeftPanel.ts` | Tools segmented control, snap spacing, **Copy & Array block** (via `CopyArray`), Node + Member grids |
| `src/ui/NodeGrid.ts` | Spreadsheet node editor (X/Y/Z), synced to Model. Hover-× delete, lenient paste, scroll + row count. |
| `src/ui/MemberGrid.ts` | Spreadsheet member editor (A/B/Tag), synced to Model. Same delete/paste/scroll as NodeGrid. |
| `src/ui/RightPanel.ts` | Properties (edit selected; multi-select summary + bulk Tag + Clear) + Model Tree (multi-highlight; plain/Ctrl click) |
| `src/ui/StatusBar.ts` | Cursor coords, active tool, snap state, node/member counts |
| `src/ui/CopyArray.ts` | Copy & Array command block: Linear/Polar mode toggle, offset/center/angle/count inputs, Copy + Array buttons. Operates on the whole `SelectionSet`; reads live selection via `setSelection`. |
| `src/ui/Splitter.ts` | Draggable vertical handle that resizes a neighbouring panel (pointer-capture drag, min/max clamp, dbl-click reset, arrow-key nudge). |
| `src/ui/helpers.ts` | `el()`, `button()`, `Toggle`, `Segmented` |
| `src/ui/LoadsPanel.ts` | Load cases + loads table + inline editor (kind-adaptive); auto-creates case on first add-load |
| `src/ui/CombosPanel.ts` | Load combinations table + factor editor (one input per existing case; 0 = remove term) |
| `src/io/csv.ts` | CSV export + generic `triggerDownload` |
| `src/io/json.ts` | `saveJson`, `parseProject` |
| `src/io/std.ts` | STAAD .std import + export (lossy state-machine parser; handles JOINT COORDINATES, MEMBER INCIDENCES, SUPPORTS, LOAD/LOAD COMB, JOINT LOAD, MEMBER LOAD) |
| `src/io/pythonCombos.ts` | Python script parser for `basic_loads_data` + `load_combinations` + `ele_map` (brace/bracket matching, not a real interpreter). Handles `range(a,b)`/`list(range(...))` id maps, numeric variables (`NAME = 130`, `-NAME`), per-member `"linear"` distribution and a global load-axis column |
| `src/render/LoadsView.ts` | 3D arrow/arc visualization for loads (force arrows, moment tori, member point/distributed); colored by case id; auto-scaled to model bounding box |
| `src/App.ts` | Composition root; wires all callbacks; owns selection (`SelectionSet`); keyboard; copy/array/bulk-tag dispatch (single source of truth via `setSelection`) |
| `src/main.ts` | Boot |
| `src/styles.css` | Full dark theme (CSS vars in `:root`) |

### Data model
```
Node   { id: number, label: string, x, y, z: number, fixity?: NodeFixity }     // label defaults N1, N2…
Member { id: number, label: string, nodeAId, nodeBId, tag: MemberTag, fixity?: MemberFixity, material?: MaterialType, section?: SectionShape }  // label defaults M1, M2…
        // tag ∈ none | beam | column | truss | brace | cable | rafter | other (color-coded)
LoadCase { id: number, label: string, type: LoadCaseType }   // type ∈ dead|live|wind|snow|quake|temperature|other
BcadLoad (discriminated union by kind):
  nodal           → { kind: "nodal", nodeId, fx, fy, fz, mx, my, mz, direction }
  member_point    → { kind: "member_point", memberId, dist, fx, fy, fz, direction }
  member_distributed → { kind: "member_distributed", memberId, axis, da, db, wa, wb, direction }
LoadCombo { id: number, label: string, factors: { caseId: number, factor: number }[] }
ModelSnapshot { version: 1, nodes[], members[], loadCases[], loads[], loadCombos[],
                nextNodeId, nextMemberId, nextLoadCaseId, nextLoadId, nextLoadComboId, view{...} }
```
- Nodes dedupe at identical coords (epsilon 1e-6).
- Members dedupe on endpoint pair (either order); refuse zero-length.
- Deleting a node cascades to its members.
- Copy/array reuse the same adders, so copies that land on existing geometry
  snap/dedupe instead of stacking.

## Development

```bash
npm install
npm run dev        # http://localhost:5173 (auto-opens; hot reload)
npm run build      # tsc --noEmit (strict) + vite build → dist/
npm run typecheck  # tsc only
npm run preview    # serve production build
```
- Node 18+ (developed on Node 24).
- PowerShell note: if `npm` is blocked by execution policy, use `npm.cmd` or
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (one-time).

### Conventions to keep
- **Strict TS** (`strict`, `noUnusedLocals`, `noUnusedParameters`). Don't relax.
- No framework — panels are plain DOM built in `src/ui/*`. Match the existing
  `el()`/`button()`/`Segmented`/`Toggle` patterns.
- UI components must **not** fire callbacks during construction (caused a real
  crash where panels never mounted — see `Toggle.apply` in `helpers.ts`). New
  components: set visual state without side effects in the constructor.
- Every feature that changes data should go through `Model` mutations; the view
  + panels update automatically via the change event. Don't hand-maintain UI
  state in parallel with the Model.

## Known limitations / gotchas

- **No undo/redo yet.** (Roadmap.)
- **Multi-select works via modifier-click**, but **no marquee box-select / drag
  rectangle** yet (Roadmap). So building a large selection still needs repeated
  Ctrl-clicks.
- **Transform tools partial:** copy/array (linear + polar, single + multi) are
  done; **move, rotate-in-place, mirror, offset** are still missing.
- **Copy/Array polar axis is fixed to Z** (rotates in the XY plane). No arbitrary
  axis / UCS rotation yet.
- **Load arrows are visual-only** — not pickable or editable from the 3D view.
  Edit loads in the Loads tab (left panel) only.
- **Member fixity shown in Properties** but only exported to STAAD — not yet
  used for internal analysis or visualization.
- **STAAD .std parser is lossy** — drops materials, member sizing, BETA angles,
  end releases, design parameters, analysis commands. Support data on same line
  as header (e.g. `SUPPORTS 1 7 PINNED`) is handled; general inline block data
  (after `JOINT COORDINATES`, `MEMBER INCIDENCES`) is not.
- **No measure / dimensioning.**
- **No layers.** Everything is one flat layer.
- **No sections/materials.** Members carry structural tags but no full section
  or material database yet.
- Drafting plane is selectable (XY / XZ / YZ) from the toolbar, but always passes through
  the origin. No offset/CSV-datum / UCS rotation yet — that would unlock polar arrays on
  arbitrary axes.
- Three.js bundle is ~520 kB (gzip ~132 kB). Acceptable for now; code-splitting
  is a later optimization.
- Build emits a chunk-size warning — cosmetic only.

## Roadmap (prioritized)

### Tier 1 — Engineering readiness
1. ~~**STAAD `.std` exporter.**~~ **Done.** Also has a lossy `.std` importer + Python combo importer.
2. **DXF exporter.** Universal CAD interchange → importable into STAAD, PLAXIS,
   Rhino, AutoCAD. Use the AutoCAD DXF ASCII R12 format (minimal entities).
3. **Structural properties on members:** section name, material, member type
   (beam/truss/cable), end releases. Partially done — `BcadMember` carries
   `material`, `section`, and `fixity`; Properties panel renders these; STAAD
   exporter and RightPanel editor exist. Next step: dedicated sizing/property UI.
4. **PLAXIS geometry export** (likely via DXF as the entry path; native PLAXIS
   import is limited).

### Tier 2 — Drafting productivity
5. **Undo/redo** (command stack in `Model` or `App`).
6. **Remaining transform tools:** move, rotate-in-place, mirror, offset.
   (Copy + linear/polar array, single + multi, are **done**.) Extend the Copy &
   Array block or add a dedicated Transform section.
7. **Marquee box-select** (drag a rectangle on empty space). Multi-select itself
   is **done** (modifier-click); this is the drag-rectangle upgrade on top.
8. **Measure tool** (distance, angle).
9. **Layers** with visibility/lock.
10. **Free drafting plane / 3D click placement** (define active UCS) — would also
    unlock polar arrays on arbitrary axes.

### Tier 3 — Polish
11. **Dimensioning / annotation.**
12. **Themes** (light/dark) — CSS vars already centralized in `:root`.
13. **Unit system** selector (m/mm/ft) — currently unitless.
14. **Code-split Three.js** to cut initial bundle.
15. **GitHub Pages deploy** (static `dist/`) so the app is viewable live.

## Change log

- **Initial build:** Scaffolded Vite+TS+Three.js app; Model, SceneView, tools,
  snapping, all UI panels, CSV/JSON export. Verified build + dev server.
- **Fix:** Toolbar/left/right panels not rendering — root cause was `Toggle`
  firing `onChange` during construction (App's `this.toolbar` not yet assigned).
  Fixed by separating visual `apply()` from callback-firing `set()`.
- **Feature:** Added X/Y/Z typed coordinate inputs + "+ Add Node" to left panel.
- **Pushed** initial commit + fixes to GitHub `main`.
- **Feature:** Resizable panels — new `Splitter` component (pointer-capture drag,
  min/max clamp, dbl-click reset, arrow-key nudge). Workspace switched grid→flex
  so panel widths are draggable; viewport reflows via its `ResizeObserver`.
  Removed the now-redundant panel borders; added `.splitter` styles.
- **Feature:** Copy & Array tools (linear) — `Model` gained silent `putNode`/
  `putMember` + `copyNode`/`copyMember`/`arrayNode`/`arrayMember`/`copySelection`/
  `arraySelection` (single batch event per op; dedup-aware). New `CopyArray` UI
  block in the left panel (offset X/Y/Z, count, Copy + Array buttons; Enter =
  Copy, Ctrl+Enter = Array). `App.setSelection` now pushes the live selection to
  the left panel; `onModelChange` routes selection-clearing through it too.
- **Feature:** Copy & Array tools (polar) — `rotateAbout` + `copyNodePolar`/
  `copyMemberPolar`/`arrayNodePolar`/`arrayMemberPolar`/`copySelectionPolar`/
  `arraySelectionPolar` in `Model` (rotate about a center in XY, around Z).
  `CopyArray` gained a Linear/Polar mode toggle (Center X/Y + Angle°; angle 0 in
  Array = full circle, auto 360°/count). Wired through `LeftPanel` + `App`
  (deg→rad conversion).
- **Pushed** resizable panels + copy/array (linear + polar) to GitHub `main`.
- **Feature:** Multi-select + deselect — new `SelectionSet` (= `Selection[]`) +
  `selKey` in `types.ts`. `Model` gained set-aware ops: `copySet`/`arraySet`/
  `copySetPolar`/`arraySetPolar` (an old-id→new-id map keeps copied connected
  groups connected) + `removeSelections`. `SceneView` highlights the whole set
  (one key-set) and frames over it. `ToolController` implements modifier-click
  (Ctrl/Cmd/Shift = toggle, empty click = clear) and reports selection to `App`
  via a new `onSelect` callback. `RightPanel` does multi-highlight tree + a
  multi-select Properties summary (bulk Tag dropdown + Clear). Copy/Array/delete
  now operate on the whole set.
- **Fix (latent):** Viewport clicks now sync Properties/Tree/Copy&Array —
  previously `ToolController.doSelect` wrote selection to the **view only**, so
  only tree clicks updated the panels. Resolved by making `App` the single
  source of truth (all selection → `App.setSelection`).
- **Pushed** multi-select + deselect to GitHub `main`.
- **Feature:** Spreadsheet grid delete/paste/scroll — both `NodeGrid` and
  `MemberGrid` gained a hover-reveal × in the # cell (committed removes the
  entity, draft clears cells), a lenient `paste` handler (one entity per line,
  tab/comma/space separated; nodes `X Y Z`, members `A B tag`; junk lines
  skipped; single-number paste not intercepted), and a taller independently
  scrolling body (240→320px, headers pinned) with a live row-count footer.
  Updated `agent.md` "Current state" to match the grids (the old "+ Add Node"
  blurb was stale).
- **Pushed** grid delete/paste/scroll to GitHub `main`.
- **Fix:** Left panel tools no longer scroll out of view when grids grow — split into a fixed top section (Tools/Snap/Copy & Array) and a scrollable bottom section (grids + help).
- **Fix:** Member grid now auto-generates a blank draft row when a member is created (same as node grid). Root cause was `evaluate()` setting `row.memberId` directly, causing `reconcile()` to skip `promoteDraft()` and create a duplicate row instead of a fresh blank draft. Both grids now let `reconcile()` own the row-to-entity linking via `promoteDraft()`.
- **Feature:** Drafting plane selector — use the new **Plane** segmented control (XY / XZ / YZ) in the toolbar to choose which plane mouse clicks project onto. The grid rotates to match, so you can draw on XY (top-down), XZ (front elevation), or YZ (side elevation). Status bar now shows all three coordinates (x/y/z). Draft plane is saved/restored in `.json` project files.
- **Feature:** Plane offset input (toolbar, right after Plane selector) — enter a value to shift the drafting plane along its normal axis (Z for XY, Y for XZ, X for YZ). The grid and all mouse placements move with it. Also persisted in project files.
- **Feature:** Plane lock/unlock toggle — when locked (default), placement is constrained to the active drafting plane. When unlocked, the Line tool can pick and connect to any existing node in 3D, regardless of which plane it sits on. Toggle is in the toolbar (Lock button, right after the offset input).
- **Pushed** drafting plane + offset + lock to GitHub `main`.
- **Feature:** Loads & Combos domain — new data model (LoadCase, BcadLoad discriminated union, LoadCombo), tabbed Data section in left panel (Loads/Combos tabs), LoadsPanel (case management, loads table, inline editor), CombosPanel (combinations table, factor editor), STAAD .std parser/export (state machine: JOINT COORDINATES, MEMBER INCIDENCES, SUPPORTS, LOAD/LOAD COMB), Python combo importer, 3D load visualization (LoadsView: colored arrows + moment arcs, auto-scaled to model extent), fixity/material/section properties on nodes/members. New files: `src/ui/LoadsPanel.ts`, `src/ui/CombosPanel.ts`, `src/io/std.ts`, `src/io/pythonCombos.ts`, `src/render/LoadsView.ts`.
- **Pushed** loads & combinations to GitHub `feat/loads-and-combinations`.
- **Fix:** Auto-show loads after file open — when a .std/.json/.py file with load cases is opened, the toolbar Loads toggle now auto-enables and selects the first case. Previously stayed off, making imported loads invisible until manual toggling.
- **Fix:** Right panel collapse safety — added `min-width: 80px` to `.right-panel` CSS so the panel never vanishes in edge cases.
- **Fix:** Open button blocked on some browsers — replaced `hidden` attribute (which applies `display: none`, blocking programmatic `.click()` on file inputs) with CSS offscreen positioning (`left: -9999px`, `opacity: 0`). Applied on top of `feat/loads-and-combinations` branch.
- **Feature:** .txt file support — added `.txt` to the file input `accept` list and switched file type detection from extension-based to content-based. Now tries JSON first, falls back to STAAD for any extension (.txt, .std, .json, or none), so users can name STAAD files freely.
- **Pushed** Open button fix to GitHub `feat/loads-and-combinations`.
- **Fix:** Keep Data tab headers pinned — moved Data title + Nodes/Members/Loads/Combos tab buttons from `.left-panel-scroll` to `.left-panel-fixed` so they never scroll out of view when the grid content grows. Added `flex: 1 1 auto` to `.tab-panels` to fill remaining space.
- **Pushed** tab-pinning fix to GitHub `feat/loads-and-combinations`.
- **Fix:** File input selector scope — the hidden `<input id=file-input>` sits outside `#app` in `index.html`, but `App.start()` queried it via `this.root` (`#app`), returning `null`. `this.fileInput.click()` threw silent TypeError on every Open button press. Fixed by querying from `document` instead.
- **Pushed** file-input fix to GitHub `feat/loads-and-combinations`.
- **Fix:** .std parser BOM handling — STAAD files from Windows may have a UTF-8 BOM prefix that caused `expectStaadHeader` to fail. Strip BOM in `parseStd`. Also replaced `.py` import `alert()` with non-blocking status bar message, and added visible feedback (file name + entity counts) on every successful load.
- **Pushed** BOM + feedback fix to GitHub `feat/loads-and-combinations`.
- **Fix:** Floor load parsing dropped all but the last load — `parseFloorLoad` accumulated each YRANGE/LOAD pair but only created one floor load entry at the end (the last pair). Multiple floor loads in one FLOOR LOAD block (e.g. `yrange 2.99-3.01 load -1` then `yrange 5.19-5.21 load -1`) lost the earlier ones. Also `parseFloorLoad` did not break on `LOAD COMB` (only on `LOAD n`), so it consumed all combination lines inside the floor block — combos were never parsed. Fix: flush each completed pair immediately, and break on `LOAD COMB` as well.
- **Fix:** Circular call stack in Segmented/Toggle setters — `App.setProjection()` → `toolbar.setProjection()` → `projSegmented.set()` → fired `onSelect` back to `App.setProjection()` → infinite recursion (same for preset, draft plane, tool selector, and all toggles). Added `Segmented.apply()` (visual-only, no callback) to match `Toggle.apply()` pattern; changed all Toolbar/LeftPanel programmatic setters to use `apply()` instead of `set()`. Made `Toggle.apply()` public.
- **Pushed** circular-call fix to GitHub `feat/loads-and-combinations`.
- **Fix:** Exported USER TABLE data lines not wrapped — the import joins `-` continuation lines into single long lines, but the export wrote them back without continuation marks. Long lines (e.g. TC6 section properties >200 chars) broke STAAD's `INPUT WIDTH 79` limit. Added `wrapLine()` helper to break long lines at the nearest space within the width limit, appending ` -` continuation per STAAD convention. Applied during USER TABLE block export.
- **Fix:** Right panel hidden on narrow windows — viewport's default `min-width: auto` prevented shrinking below the Three.js canvas intrinsic size, pushing the right panel off-screen. Added `min-width: 0` to `.viewport` and `overflow-x: auto` to `.workspace` so the right panel stays reachable (horizontal scroll if needed).
- **Pushed** narrow-window fix to GitHub `feat/loads-and-combinations`.
- **Feature:** Switching to Loads/Combos data tab auto-enables the 3D loads view (arrows) if any load cases exist. Added `onDataTab` callback to `LeftPanelCallbacks`; `App` wires it to toggle loads visibility + select first case. Previously the user had to manually click the toolbar Loads toggle after switching tabs.
- **Pushed** loads-tab-auto-show to GitHub `feat/loads-and-combinations`.
- **Fix:** Change auto-select from first case to "All cases" when enabling loads view — prevents CON loads in other cases from being hidden.
- **Feature:** Load combination visualization — combos now appear in the toolbar case dropdown (with disabled separator label). When selected, loads from referenced cases are multiplied by combo factors and drawn with proportional arrow lengths. Uses negative IDs (`-comboId`) to distinguish combos from cases.
- **Pushed** all-cases-default + combo viz to GitHub `feat/loads-and-combinations`.
- **Fix:** Load case rename — Manage button called `renderCaseBar()` instead of `reconcile()`, so the rename/retype/delete panel never appeared. Fixed by calling `reconcile()`.
- **Feature:** STAAD parser now imports material & section data — reads `DEFINE MATERIAL` blocks (material name + type: CONCRETE/STEEL), `MEMBER PROPERTY` blocks (section shapes: TABLE ST→i_beam, PRIS→rectangular, TUBE/PIPE→hss_round), and `CONSTANTS MATERIAL` assignments (applies to member ranges or ALL). Data is stored on each `BcadMember` in the snapshot.
- **Pushed** rename-fix + material-import to GitHub `feat/loads-and-combinations`.
- **Fix:** STAAD export now writes DEFINE MATERIAL, MEMBER PROPERTY, and CONSTANTS blocks from member data. Groups members by section shape and material type with compact range output.
- **Fix:** "+ Case" now auto-opens the Manage panel so the user can immediately rename/retype the new case instead of hunting for the Manage button.
- **Pushed** export-materials + add-case-flow to GitHub `feat/loads-and-combinations`.
- **Fix:** DEFINE UBC LOAD was eating all subsequent loads — the main loop called `parseDefineMaterial()` for ANY `DEFINE` block, but `DEFINE UBC LOAD` has no `END` terminator, so it consumed LOAD commands as plain text. Only `DEFINE MATERIAL` blocks now dispatch to the material parser; other DEFINE blocks are skipped until the next recognized header.
- **Pushed** UBC-fix to GitHub `feat/loads-and-combinations`.
- **Feature:** MEMBER PROPERTY parsing with `MEMBER <tag>` prefix (COLUMN, RAFTER, SEC BEAM ROOF, SIDE BEAM, STUBCOLUMN, BRACING) + TAPERED section mapping.
- **Feature:** START GROUP DEFINITION parsing → member tags (COLUMN→column, RAFTER→rafter, BRACING→brace, etc.).
- **Feature:** MEMBER RELEASE parsing → sets fixity to pinned at released ends.
- **Feature:** MEMBER TRUSS parsing → tags members as "truss".
- **Feature:** BETA angle in CONSTANTS → stored on each member.
- **Fix:** toSnapshot now applies tag, release, beta maps to output members.
- **Feature:** STAAD export now writes MEMBER RELEASE, MEMBER TRUSS, and BETA (grouped by angle) blocks.
- **Pushed** member-property + release/truss/beta parsing/export to GitHub `feat/loads-and-combinations`.
- **Feature:** Beta angle input in Properties panel (right panel, under Section) — editable number field, populated from parsed .std BETA lines.
- **Pushed** beta-input to GitHub `feat/loads-and-combinations`.
- **Feature:** Material strength grades — parser extracts STRENGTH FCU/FY from DEFINE MATERIAL, converts to grade labels (FCU 27579 kPa → C28). Grade text input in Properties panel. Export writes STEEL_S275 / CONC_M25 naming with STRENGTH lines and MEMB keyword in CONSTANTS.
- **Pushed** material-grade + export to GitHub `feat/loads-and-combinations`.
- **Feature:** .py file now imports actual loads — parses `ele_map` (element key → member IDs), `basic_loads_data` (Val_Start/Val_End values), and creates `member_distributed` loads on mapped members. Status bar shows case/combo/load counts.
- **Pushed** .py-loads import to GitHub `feat/loads-and-combinations`.
- **Visual:** Smaller node spheres (radius 0.18→0.10).
- **Visual:** Separate label toggles (Nodes / Members) in toolbar.
- **Visual:** 3D fixity & release indicators (red cube=fixed, orange cone=pinned, orange sphere=released end).
- **Pushed** visual improvements to GitHub `feat/loads-and-combinations`.
- **Feature:** Interpolated distributed load visualization — arrows vary in size from wa at start to wb at end.
- **Feature:** Bulk-apply loads to multiple members — selection-based (sorted by height) + manual range input ("1-10" or "1,3,6,10") with linear interpolation.
- **Feature:** STAAD export uses grouped LIN/TRAP/UNI syntax instead of one line per member.
- **Feature:** Parse LIN (linearly varying) and TRAP (trapezoidal) member load syntax.
- **Pushed** bulk-distribute + LIN/TRAP to GitHub `feat/loads-and-combinations`.
- **Fix:** Left panel help text (Mouse/Keys) now fixed at bottom, separate from scrollable tab content — no more overlap with inputs.
- **Fix:** `MemberFixity` expanded to track specific released DOFs (MX/MY/MZ) per end instead of a binary fixed/pinned — parser now captures exact DOFs, writer emits only those DOFs, and the parser handles combined `START <dofs> END <dofs>` on a single line. Round-trip is now faithful for any DOF combination. Updated `types.ts`, `std.ts` (parser + writer), `RightPanel.ts`, `SceneView.ts`.
- **Pushed** member-release-fix to GitHub `feat/loads-and-combinations`.
- **Visual:** Member end releases now show as orange torus rings offset from the node along the member axis (instead of tiny spheres at the node position) — clearly visible and distinguishable from node fixity markers. Ring is oriented perpendicular to the member.
- **Pushed** release-ring-visual to GitHub `feat/loads-and-combinations`.
- **Visual:** Release rings are now color-coded by DOF combination — green (all MX MY MZ), blue (MZ only), pink (any other combo).
- **Feature:** Member end releases now editable in Properties panel with MX/MY/MZ toggle buttons per end (replaces the old Fixed/Pinned dropdown). Bulk fixity also uses toggle grids.
- **Pushed** color-coded-rings + dof-toggles to GitHub `feat/loads-and-combinations`.
- **Feature:** `DEFINE UBC LOAD` block now parsed — extracts ZONE, I, RWX/RWZ, STYP, CT, PX/PZ, NA/NV parameters as `UbcParams` on the model. `JOINT WEIGHT` sub-block assigns weights to nodes. `UBC LOAD X/Z` commands tracked on load cases via `ubcDirection`. Writer reproduces the full UBC block + JOINT WEIGHT + UBC LOAD lines. Updated `types.ts`, `Model.ts`, `std.ts`.
- **Pushed** ubc-parse to GitHub `feat/loads-and-combinations`.
- **Fix:** DEFINE UBC parser was skipping JOINT WEIGHT — `isBlockHeader()` treated `JOINT` as a top-level block break, so the UBC parser exited before reaching the joint weight lines. Fixed by allowing `JOINT WEIGHT` through as a sub-block.
- **UI:** Joint weight now visible and editable in node Properties panel (numField under Z coordinate). Shows `—` when unset.
- **Pushed** ubc-parse-fix + joint-weight-ui to GitHub `feat/loads-and-combinations`.
- **Fix:** Right panel Properties and Model Tree no longer clash — split into a fixed-top scrollable Properties section (max 45vh) and a flex-bottom Tree section that fills remaining space. Separated by a border line.
- **Pushed** right-panel-split to GitHub `feat/loads-and-combinations`.
- **Feature:** Section dropdown uses STAAD keywords (PRIS, TABLE ST, TAPERED, UPTABLE, PIPE, TUBE, CHANNEL, ANGLE). `sectionStaadKeyword` stored per member for faithful round-trip. Writer groups by (keyword + props). Fix: sectionProps input was never appended to DOM (invisible). Fix: `isBlockHeader` in `parseMemberProperty` rejected MEMBER <tag> data lines. Fix: `MEMBER SEC BEAM ROOF` tag left "ROOF" in token stream causing parse failure.
- **Pushed** section-keyword-system to GitHub `feat/loads-and-combinations`.
- **Feature:** LOADTYPE/TITLE capture during import — `LOADTYPE Live TITLE LLL` on its own line is stored as the case label, so the exporter writes `LOAD 2 LOADTYPE Live TITLE LLL` as one line.
- **Feature:** `fload` one-liner — floor loads export as `yrange 2.99 3.01 fload -.5` with `floor load` header. Import handles both `fload`/`rload` combined tokens and traditional two-line format.
- **Pushed** loadtype-fload to GitHub `feat/loads-and-combinations`.
- **Feature:** GROUP DEFINITION round-trip — captures raw block text (group names + member ranges) from `START`-wrapped `GROUP DEFINITION` blocks only. Skipped standalone `GROUP DEFINITION` blocks that have no matching END (common in STAAD files where END is commented out). Includes `END` marker in stored text for valid export.
- **Pushed** group-definition to GitHub `feat/loads-and-combinations`.
- **Docs:** README records the member local-axis color convention — blue = local X (along the member, A→B), red = local Y (perpendicular), green = local Z (cross product); follows STAAD convention.
- **Branch cleanup:** `feat/loads-and-combinations` merged into `main` (trees identical) and deleted locally + on GitHub; `main` is now the single line of development.
- **Feature:** Python importer `ele_map` now supports `range(a,b)`, `list(range(a,b))`, and mixed id lists (fixes a latent bug where `list(range(...))` values broke the map and dropped everything after the first `[...]` entry). `parseEleMap` parses values up to the next top-level comma instead of requiring a bare `[..]`.
- **Feature:** `basic_loads_data` rows support optional **Distribution** + **Axis** columns: `"linear"` interpolates Val_Start→Val_End down the mapped member list (one uniform load per member, first = start, last = end), and `"x"|"y"|"z"` sets the global axis of the distributed load (default `y`; use `"x"` for lateral wall loads). `parsePythonLoads` emits per-member loads for linear rows and skips members whose interpolated value is 0.
- **Feature:** Numeric variables — `parseNumericVars` scans `NAME = 130` assignments (trailing comments allowed) and `stripValue` resolves `NAME` / `-NAME` references in Val_Start/Val_End, so script magnitudes can be defined once at the top.
- **Pushed** README + python-importer upgrades to GitHub `main`.
- **Pushed** current-state docs (agent.md + README) to GitHub `main`.
