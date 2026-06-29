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
```

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
  panel.

### Keyboard
- `1`–`4` — switch tools
- `Delete` / `Backspace` — remove the selected entity
- `Esc` — cancel the in-progress line and clear selection

### Files (toolbar)
- **New** — clear the model (confirms if unsaved work exists).
- **Open…** — load a `.json` project previously saved by bcad.
- **Save** — download the current model + view settings as `bcad-project.json`.
- **Export CSV** — downloads two files:
  - `bcad_nodes.csv` — `id,label,x,y,z`
  - `bcad_members.csv` — `id,label,nodeA,nodeB,length`

  These are plain, self-describing tables you can open in Excel or reformat
  into any solver's input.

## Data model

```
Node   { id, label, x, y, z }              // label defaults to N1, N2, …
Member { id, label, nodeAId, nodeBId }     // label defaults to M1, M2, …
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
│   └── Labels.ts           # CSS2DRenderer label overlay
├── interact/
│   ├── ToolController.ts   # mouse → tool actions (click vs. drag detection)
│   └── Snapper.ts          # snap to nodes then grid
├── ui/
│   ├── Toolbar.ts          # top toolbar (file/view/display)
│   ├── LeftPanel.ts        # tools + snap spacing
│   ├── RightPanel.ts       # properties + model tree
│   ├── StatusBar.ts        # coords/tool/counts
│   └── helpers.ts          # el/button/Toggle/Segmented
└── io/
    ├── csv.ts              # CSV export + download helper
    └── json.ts             # project save/parse
```

## Roadmap (not in v1)

- **Native solver exports**: STAAD `.std` command files, DXF, PLAXIS geometry.
  v1 ships CSV/JSON as the bridge — the data is there, the formatters are the
  next step.
- **Structural properties**: section name, material, member type (beam/truss/
  cable), releases. v1 captures geometry + labels only.
- **Copy/move/rotate/mirror**, **measure**, **layers**, **undo/redo**,
  **multi-select**.
