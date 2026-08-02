# bcad

A browser-based 2D/3D drafting CAD — draw nodes and members, tag them with
labels, and export to CSV/JSON for use in STAAD, PLAXIS, and other engineering
tools. The UI is inspired by SkyCiv: top toolbar, left tools, central 3D
viewport, right properties + model-tree panel.

Built with **Vite + TypeScript + Three.js**. No backend — everything runs in
the browser. Projects persist as `.json` files you save/open yourself.

## Quick start

```bash
npm install
npm run dev      # opens http://localhost:5173
npm.cmd run dev```

Other scripts:

```bash
npm run build      # typecheck (tsc) + production build to dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit only
```

Requires Node 18+ (developed on Node 24).

## Using it

### Tools (left panel / keys 1–4)
- **Select** (`1`) — click a node or member to inspect/edit it in the right
  panel; click again on empty space to deselect.
- **Node** (`2`) — click on the grid to place a node (snaps to grid + existing
  nodes).
- **Line** (`3`) — click the first point, then the second; a node is created at
  each endpoint (reusing an existing node if you snap to one) and a member is
  drawn between them. A dashed preview shows the in-progress segment.
- **Delete** (`4`) — click a node or member to remove it. Deleting a node also
  removes every member attached to it.

### Navigation
- **Left-drag** — orbit (3D mode)
- **Right-drag** — pan
- **Wheel** — zoom

### View (toolbar)
- **Top / Front / Side / Iso** — orthographic view presets.
- **2D / 3D** — toggle between orthographic drafting mode (rotation locked) and
  perspective orbit mode. Draft 2D on the XY plane, then switch to 3D to model
  in Z.
- **Frame All** — zoom to fit everything.
- **Snap / Labels / Grid** — display toggles. Snap spacing is set in the left
  panel. **Text S/M/L** scales all label text (nodes, members, fixity chips,
  load values).

### Member local axes (toolbar **Axes** toggle / `Shift+O`)
Arrows at each member's midpoint follow the **STAAD local-axis convention**:
- **Blue** = local **X** — along the member, from start node (A) to end node (B)
- **Red** = local **Y** — perpendicular to X (right-hand rule)
- **Green** = local **Z** — cross product of X and the reference axis (Global Z
  for vertical members, Global Y otherwise)

So red means Y, green means Z, and blue means X (the member axis itself).

### Supports & releases (3D view)
- **Node supports** — red flat plate = fully fixed; yellow cone = pinned
  (translations fixed, rotations free); green cone + small text chip = custom
  fixity (e.g. `FIXED BUT MZ KFY 30` shows a `MZ KFY 30` chip listing the
  released DOFs and spring values). Explicitly free nodes show no marker;
  spring supports show a teal diamond. The text chips can be hidden with the
  toolbar **Fixity text** toggle.
- **Member end releases** — orange rings at the released ends, color-coded by
  which moment DOFs are free: green = all (MX MY MZ), blue = MZ only,
  pink = any other combination.
- Edit both in the right panel: node fixity presets, individual DOFs and spring
  constants per node; MX/MY/MZ toggle buttons per end on members.

### Keyboard
- `1`–`4` — switch tools
- `Delete` / `Backspace` — remove the selected entity
- `Esc` — cancel the in-progress line and clear selection

### Files (toolbar)
- **New** — clear the model (confirms if unsaved work exists).
- **Open…** — load a project or model data:
  - `.json` — a project previously saved by bcad.
  - `.std` / `.txt` — STAAD input: geometry, supports, loads, combos, materials,
    sections, UBC seismic, group definitions, plate elements…
  - `.py` — Python load-combination scripts (`basic_loads_data`,
    `load_combinations`, `ele_map`); member loads map onto the model's member IDs.
- **Save** — download the current model + view settings as `bcad-project.json`.
- **Export** — CSV (`bcad_nodes.csv`, `bcad_members.csv`) and STAAD `.std`.

## Loads & combinations (left panel Data tabs)

Tabbed [Nodes] [Members] [Loads] [Combos] data section:

- **Loads** — load cases (dead/live/wind/…), nodal + member (point, uniform,
  linearly varying) loads, case management, and a kind-adaptive inline editor.
- **Combos** — load combinations with one factor input per case.
- **3D visualization** — force arrows colored per case (auto-scaled to the
  model), moment arcs, and member load arrows. Combos are selectable from the
  toolbar case dropdown.
- **Python import** (`.py`) — parses `basic_loads_data` + `load_combinations`
  + `ele_map`:
  - `ele_map` maps element keys to member IDs; `range(a, b)` /
    `list(range(a, b))` / explicit lists are all supported.
  - Each `basic_loads_data` row may add an optional **Distribution** column
    (`"linear"` = interpolate Val_Start→Val_End down the member list, first
    member = start, last = end) and an **Axis** column (`"x"|"y"|"z"`, default
    `y` for vertical gravity loads; use `"x"` for lateral wall loads).
  - A **Load_Type** containing `nodal`/`joint`/`point` (e.g. `"-nodal"`)
    imports the row as point loads on node ids instead of member loads — the
    ele_map value is then a list of node ids and Val_Start acts on the axis
    column (default y → FY).
  - Val_Start/Val_End may reference numeric variables defined at the top of the
    script (`NAME = 130`), including `-NAME`, so magnitudes are edited in one
    place.

## Data model

```
Node   { id, label, x, y, z }              // label defaults to N1, N2, …
Member { id, label, nodeAId, nodeBId }     // label defaults to M1, M2, …
LoadCase / BcadLoad / LoadCombo           // loads & combinations
```

Nodes auto-deduplicate at identical coordinates. Members auto-deduplicate for
the same endpoint pair (either order). The model is the single source of truth;
the 3D view and the DOM panels both subscribe to it.

## Project structure

```
src/
├── main.ts                 # bootstrap
├── App.ts                  # composition root — wires model/view/UI
├── types.ts                # Node/Member/Tool/View types + snapshot
├── model/Model.ts          # in-memory store + change events + queries
├── render/
│   ├── SceneView.ts        # Three.js scene, cameras, controls, picking, sync
│   ├── Grid.ts             # grid + colored axes
│   ├── Labels.ts           # CSS2DRenderer label overlay
│   └── LoadsView.ts        # 3D load visualization (arrows, moment arcs)
├── interact/
│   ├── ToolController.ts   # mouse → tool actions (click vs. drag detection)
│   └── Snapper.ts          # snap to nodes then grid
├── ui/
│   ├── Toolbar.ts          # top toolbar (file/view/display)
│   ├── LeftPanel.ts        # tools + snap spacing + copy/array
│   ├── RightPanel.ts       # properties + model tree
│   ├── NodeGrid.ts / MemberGrid.ts   # spreadsheet editors
│   ├── LoadsPanel.ts / CombosPanel.ts
│   ├── CopyArray.ts / Splitter.ts
│   ├── StatusBar.ts        # coords/tool/counts
│   └── helpers.ts          # el/button/Toggle/Segmented
└── io/
    ├── csv.ts              # CSV export + download helper
    ├── json.ts             # project save/parse
    ├── std.ts              # STAAD .std import + export (lossy)
    └── pythonCombos.ts     # .py load-combination import
```

## Roadmap

**Done (beyond v1):**
- STAAD `.std` import + export (geometry, supports, loads, combos, materials,
  sections, UBC, group definitions).
- Loads & combinations with 3D visualization; Python load-combination import.
- Structural properties (material, section, fixity/releases, beta) on members;
  node support markers (fixed / pinned / custom with release text).
- Copy & Array (linear + polar, single + multi-select), multi-select,
  resizable panels, drafting-plane selector.

**Next up:**
- **DXF exporter** — universal CAD interchange (STAAD/PLAXIS/Rhino/AutoCAD).
- **PLAXIS geometry export.**
- **Move / rotate-in-place / mirror / offset** transforms.
- **Marquee box-select**, **measure tool**, **layers**, **undo/redo**.
- Drafting-plane offset/UCS rotation, themes, unit system, code-split Three.js,
  GitHub Pages deploy.
