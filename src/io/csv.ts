import type { Model } from "../model/Model";

/**
 * CSV export. Four files:
 *   - bcad_nodes.csv:        id,label,x,y,z
 *   - bcad_members.csv:      id,label,nodeA,nodeB,length,tag
 *   - bcad_loads.csv:        case,label,kind,target,direction,components
 *   - bcad_loadcombos.csv:   name,then case:factor pairs
 *
 * Length is computed from node coordinates so the table is self-contained.
 * Triggers one download per file.
 */
export function exportCsv(model: Model): void {
  download("bcad_nodes.csv", nodesCsv(model));
  download("bcad_members.csv", membersCsv(model));
  download("bcad_loads.csv", loadsCsv(model));
  download("bcad_loadcombos.csv", loadCombosCsv(model));
}

function nodesCsv(model: Model): string {
  const rows = ["id,label,x,y,z"];
  for (const n of model.allNodes()) {
    rows.push(`${n.id},${csv(n.label)},${fmt(n.x)},${fmt(n.y)},${fmt(n.z)}`);
  }
  return rows.join("\n");
}

function membersCsv(model: Model): string {
  const rows = ["id,label,nodeA,nodeB,length,tag"];
  for (const m of model.allMembers()) {
    const a = model.getNode(m.nodeAId);
    const b = model.getNode(m.nodeBId);
    let length = "";
    if (a && b) {
      const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      length = fmt(d);
    }
    rows.push(`${m.id},${csv(m.label)},${m.nodeAId},${m.nodeBId},${length},${csv(m.tag)}`);
  }
  return rows.join("\n");
}

/**
 * Loads CSV. Each load is one row: case label, kind, target entity, direction,
 * and the components relevant to that kind (component columns vary, so unused
 * ones are blank). Loads with a dangling case/entity are still listed.
 */
function loadsCsv(model: Model): string {
  const rows = [
    "id,case,kind,target,direction,fx,fy,fz,mx,my,mz,dist,axis,da,db,wa,wb",
  ];
  for (const ld of model.allLoads()) {
    if (ld.kind === "floor") continue; // floor loads not represented in CSV
    const lc = model.getLoadCase(ld.caseId);
    const caseLabel = lc?.label ?? `C${ld.caseId}`;
    const target = ld.kind === "nodal" ? `N${ld.nodeId}` : `M${ld.memberId}`;
    const blank = "";
    if (ld.kind === "nodal") {
      rows.push(
        [
          ld.id, csv(caseLabel), "nodal", target, ld.direction,
          fmt(ld.fx), fmt(ld.fy), fmt(ld.fz), fmt(ld.mx), fmt(ld.my), fmt(ld.mz),
          blank, blank, blank, blank, blank, blank,
        ].join(",")
      );
    } else if (ld.kind === "member_point") {
      rows.push(
        [
          ld.id, csv(caseLabel), "member_point", target, ld.direction,
          fmt(ld.fx), fmt(ld.fy), fmt(ld.fz),
          blank, blank, blank,
          fmt(ld.dist),
          blank, blank, blank, blank, blank,
        ].join(",")
      );
    } else {
      rows.push(
        [
          ld.id, csv(caseLabel), "member_distributed", target, ld.direction,
          blank, blank, blank, blank, blank, blank,
          blank, ld.axis,
          fmt(ld.da), fmt(ld.db), fmt(ld.wa), fmt(ld.wb),
        ].join(",")
      );
    }
  }
  return rows.join("\n");
}

/** Load combinations CSV: one row per combo, factor terms as case:factor pairs. */
function loadCombosCsv(model: Model): string {
  const rows = ["name,factors"];
  for (const cb of model.allLoadCombos()) {
    const terms = cb.factors
      .map((f) => {
        const lc = model.getLoadCase(f.caseId);
        const label = lc?.label ?? `C${f.caseId}`;
        return `${label}:${fmt(f.factor)}`;
      })
      .join(" ");
    rows.push(`${csv(cb.label)},${csv(terms)}`);
  }
  return rows.join("\n");
}

/** Strip to 6 significant digits, trimming trailing zeros. */
/** Strip to 6 significant digits, trimming trailing zeros. */
function fmt(n: number): string {
  return parseFloat(n.toFixed(6)).toString();
}

/** Quote a CSV field only if it contains a comma or quote. */
function csv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  triggerDownload(filename, blob);
}

export function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
