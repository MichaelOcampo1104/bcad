# bcad — Agent / Development Log

> Living document for future development sessions. Captures architecture,
> current state, design decisions, and the roadmap. Update this as the app
> evolves so context is never lost between sessions.

## What bcad is

A browser-based 2D/3D drafting CAD — draw **nodes** and **members** (line
elements), tag them with editable labels, and export to CSV/JSON for downstream
use in STAAD, PLAXIS, and other engineering tools. The UI is modeled on SkyCiv:
top toolbar · left tools · center 3D viewport · right properties + model-tree ·
bottom status bar.

**Stack:** Vite + TypeScript + Three.js. No backend, no framework — plain DOM
panels wired imperatively. Single source of truth is the `Model`.

## Current state (as of last update)

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
- ✅ **Typed coordinate input**: left panel X/Y/Z boxes + "+ Add Node" (Enter to
  submit). Good for precise placement.
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
- ✅ Keyboard: 1–4 tools, Delete/Backspace removes selected, Esc cancels line.
- ✅ Hot-reload dev server, strict typecheck + production build both pass.
- ✅ Pushed to GitHub: https://github.com/MichaelOcampo1104/bcad (branch `main`).

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
`App` and is pushed into both the view (`view.setState`) and the panels.

### File map
| File | Responsibility |
|------|----------------|
| `src/types.ts` | `BcadNode`, `BcadMember`, `Tool`, `ViewPreset`, `ProjectionMode`, `Selection`, `ModelSnapshot` |
| `src/model/Model.ts` | In-memory store: add/update/remove nodes+members, auto-id/label, dedup, spatial queries (`findNodeNear`/`findNodeAt`/`membersAtNode`), **copy/array (linear + polar)**, `snapshot()`/`load()`. Batch adders use silent `putNode`/`putMember` + a single emit. |
| `src/render/SceneView.ts` | Three.js scene, persp + ortho cameras, OrbitControls, picking (`pick`), plane projection (`pointerToPlane`), rebuilds meshes/labels on Model changes |
| `src/render/Grid.ts` | `GridHelper` rotated to XY plane + colored axis lines |
| `src/render/Labels.ts` | `CSS2DRenderer` label layer; add/remove per-entity text labels |
| `src/interact/ToolController.ts` | Binds pointer events on canvas; implements each tool; tracks line-tool start point |
| `src/interact/Snapper.ts` | Snap priority: existing node (tol) → grid → raw |
| `src/ui/Toolbar.ts` | Top bar: New/Open/Save/Export, view presets, 2D/3D, Snap/Labels/Grid toggles |
| `src/ui/LeftPanel.ts` | Tools segmented control, snap spacing, **Copy & Array block** (via `CopyArray`), Node + Member grids |
| `src/ui/RightPanel.ts` | Properties (edit selected) + Model Tree (nodes/members lists) |
| `src/ui/StatusBar.ts` | Cursor coords, active tool, snap state, node/member counts |
| `src/ui/CopyArray.ts` | Copy & Array command block: Linear/Polar mode toggle, offset/center/angle/count inputs, Copy + Array buttons. Reads live selection via `setSelection`. |
| `src/ui/Splitter.ts` | Draggable vertical handle that resizes a neighbouring panel (pointer-capture drag, min/max clamp, dbl-click reset, arrow-key nudge). |
| `src/ui/helpers.ts` | `el()`, `button()`, `Toggle`, `Segmented` |
| `src/io/csv.ts` | CSV export + generic `triggerDownload` |
| `src/io/json.ts` | `saveJson`, `parseProject` |
| `src/App.ts` | Composition root; wires all callbacks; owns selection; keyboard; copy/array dispatch (linear + polar, deg→rad conversion) |
| `src/main.ts` | Boot |
| `src/styles.css` | Full dark theme (CSS vars in `:root`) |

### Data model
```
Node   { id: number, label: string, x, y, z: number }     // label defaults N1, N2…
Member { id: number, label: string, nodeAId, nodeBId, tag: MemberTag }  // label defaults M1, M2…
        // tag ∈ none | beam | column | truss | brace | cable | rafter | other (color-coded)
ModelSnapshot { version: 1, nodes[], members[], nextNodeId, nextMemberId, view{...} }
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
- **Single selection only.** No multi-select / box-select — so Copy/Array act on
  one entity (or one member + its endpoints) at a time.
- **Transform tools partial:** copy/array (linear + polar) are done; **move,
  rotate-in-place, mirror, offset** are still missing.
- **Copy/Array polar axis is fixed to Z** (rotates in the XY plane). No arbitrary
  axis / UCS rotation yet.
- **No measure / dimensioning.**
- **No layers.** Everything is one flat layer.
- **No sections/materials.** v1 is geometry + labels/tags only — members carry no
  structural properties yet.
- Drafting plane is fixed at **z=0** (XY plane). Free 3D point entry works via
  the X/Y/Z inputs, but mouse-click placement snaps to z=0.
- Three.js bundle is ~520 kB (gzip ~132 kB). Acceptable for now; code-splitting
  is a later optimization.
- Build emits a chunk-size warning — cosmetic only.

## Roadmap (prioritized)

### Tier 1 — Engineering readiness (next focus)
1. **Native STAAD `.std` exporter.** Emit `JOINT COORDINATES` +
   `MEMBER INCIDENCES` blocks from the Model. The Model already has everything
   needed; this is a formatter in `src/io/` + a toolbar button. **High value,
   low effort.**
2. **DXF exporter.** Universal CAD interchange → importable into STAAD, PLAXIS,
   Rhino, AutoCAD. Use the AutoCAD DXF ASCII R12 format (minimal entities).
3. **Structural properties on members:** section name, material, member type
   (beam/truss/cable), end releases. Requires extending `BcadMember`, the
   Properties panel, and all exporters. Enables STAAD-ready output.
4. **PLAXIS geometry export** (likely via DXF as the entry path; native PLAXIS
   import is limited).

### Tier 2 — Drafting productivity
5. **Undo/redo** (command stack in `Model` or `App`).
6. **Remaining transform tools:** move, rotate-in-place, mirror, offset.
   (Copy + linear/polar array are **done**.) Extend the Copy & Array block or
   add a dedicated Transform section; multi-select (#7) will amplify these.
7. **Multi-select + box-select**, then transform/bulk-delete/copy as a group.
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
