import type { Model } from "../model/Model";

/**
 * CSV export. Two files:
 *   - bcad_nodes.csv:    id,label,x,y,z
 *   - bcad_members.csv:  id,label,nodeA,nodeB,length
 *
 * Length is computed from node coordinates so the table is self-contained.
 * Triggers two browser downloads.
 */
export function exportCsv(model: Model): void {
  download("bcad_nodes.csv", nodesCsv(model));
  download("bcad_members.csv", membersCsv(model));
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
