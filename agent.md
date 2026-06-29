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
                  └── helpers (el, button, Toggle, Segmented)
```

**Key invariant:** `Model` is the only state holder. The 3D view and every DOM
panel subscribe to `Model.on(change)` and re-render from it. Selection lives in
`App` and is pushed into both the view (`view.setState`) and the panels.

### File map
| File | Responsibility |
|------|----------------|
| `src/types.ts` | `BcadNode`, `BcadMember`, `Tool`, `ViewPreset`, `ProjectionMode`, `Selection`, `ModelSnapshot` |
| `src/model/Model.ts` | In-memory store: add/update/remove nodes+members, auto-id/label, dedup, spatial queries (`findNodeNear`/`findNodeAt`/`membersAtNode`), `snapshot()`/`load()` |
| `src/render/SceneView.ts` | Three.js scene, persp + ortho cameras, OrbitControls, picking (`pick`), plane projection (`pointerToPlane`), rebuilds meshes/labels on Model changes |
| `src/render/Grid.ts` | `GridHelper` rotated to XY plane + colored axis lines |
| `src/render/Labels.ts` | `CSS2DRenderer` label layer; add/remove per-entity text labels |
| `src/interact/ToolController.ts` | Binds pointer events on canvas; implements each tool; tracks line-tool start point |
| `src/interact/Snapper.ts` | Snap priority: existing node (tol) → grid → raw |
| `src/ui/Toolbar.ts` | Top bar: New/Open/Save/Export, view presets, 2D/3D, Snap/Labels/Grid toggles |
| `src/ui/LeftPanel.ts` | Tools segmented control, snap spacing, **X/Y/Z add-node inputs** |
| `src/ui/RightPanel.ts` | Properties (edit selected) + Model Tree (nodes/members lists) |
| `src/ui/StatusBar.ts` | Cursor coords, active tool, snap state, node/member counts |
| `src/ui/helpers.ts` | `el()`, `button()`, `Toggle`, `Segmented` |
| `src/io/csv.ts` | CSV export + generic `triggerDownload` |
| `src/io/json.ts` | `saveJson`, `parseProject` |
| `src/App.ts` | Composition root; wires all callbacks; owns selection; keyboard |
| `src/main.ts` | Boot |
| `src/styles.css` | Full dark theme (CSS vars in `:root`) |

### Data model
```
Node   { id: number, label: string, x, y, z: number }     // label defaults N1, N2…
Member { id: number, label: string, nodeAId, nodeBId }    // label defaults M1, M2…
ModelSnapshot { version: 1, nodes[], members[], nextNodeId, nextMemberId, view{...} }
```
- Nodes dedupe at identical coords (epsilon 1e-6).
- Members dedupe on endpoint pair (either order); refuse zero-length.
- Deleting a node cascades to its members.

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
- **Single selection only.** No multi-select / box-select.
- **No transform tools** (move/rotate/mirror/copy/offset/array).
- **No measure / dimensioning.**
- **No layers.** Everything is one flat layer.
- **No sections/materials.** v1 is geometry + labels only — members carry no
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
6. **Transform tools:** move, copy, rotate, mirror, offset, linear array.
7. **Multi-select + box-select**, then transform/bulk-delete.
8. **Measure tool** (distance, angle).
9. **Layers** with visibility/lock.
10. **Free drafting plane / 3D click placement** (define active UCS).

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
