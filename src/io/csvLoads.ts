import type { Model } from "../model/Model";
import type { LoadCase, LoadCaseType, LoadCombo } from "../types";
import { buildLoadsFromRaw, type RawBasicLoad } from "./pythonCombos";

/**
 * Spreadsheet (CSV) import for the load domain — an alternative to the Python
 * `Load_combinations.py` importer. Three separate files, one per structure,
 * opened one at a time from the toolbar (each appends its part onto the model):
 *
 *   ele_map.csv        → name,ids   (group → entity ids, e.g. `Roof,170-177`)
 *   basic_loads.csv    → case_id,description,val_start,val_end,load_type,
 *                        element_key,distribution,axis  (mirrors .py rows)
 *   load_combos.csv    → id,description,factors  (factors = `case:factor ...`)
 *
 * Columns are matched by header name (case-insensitive), so column order in
 * the spreadsheet doesn't matter. Detection: filename first, then header.
 */

export type CsvImportKind = "ele_map" | "loads" | "combos";

export interface CsvImportResult {
  kind: CsvImportKind;
  /** ele_map: number of groups. */
  groups?: number;
  /** loads: number of load cases added. */
  cases?: number;
  /** loads: number of load entities created. */
  loads?: number;
  /** combos: number of combinations added. */
  combos?: number;
}

/**
 * Parse + import a CSV file into the model. Auto-detects which structure the
 * file represents (by filename, then by header row).
 */
export function importCsvLoads(model: Model, text: string, filename = ""): CsvImportResult {
  const rows = parseCsv(text).filter((row) => !isCommentRow(row));
  if (rows.length === 0) throw new Error("CSV file is empty.");

  const kind = detectKind(rows, filename);

  if (kind === "ele_map") {
    const map = parseEleMap(rows);
    model.setEleMap(map);
    return { kind, groups: map.size };
  }

  if (kind === "combos") {
    const combos = importCombos(model, rows);
    return { kind, combos };
  }

  // loads
  const { cases, loads } = importLoads(model, rows);
  return { kind, cases, loads };
}

// ---- detection ----

function detectKind(rows: string[][], filename: string): CsvImportKind {
  const name = filename.toLowerCase();
  if (/combo/i.test(name)) return "combos";
  if (/ele[_-]?map/i.test(name)) return "ele_map";
  if (/basic[_-]?load|load/i.test(name)) return "loads";

  // Fall back to header detection.
  const header = (rows[0] ?? []).map((h) => h.toLowerCase().trim());
  const joined = header.join(" ");
  if (joined.includes("factor")) return "combos";
  if (joined.includes("name") && joined.includes("ids")) return "ele_map";
  return "loads";
}

// ---- ele_map ----

/** `name,ids` rows → group map. ids may be ranges (`170-177`), lists (`162,164`) or both. */
function parseEleMap(rows: string[][]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row[0] || !row[1]) continue;
    const name = row[0].trim();
    const ids = parseIds(row[1]);
    if (name && ids.length) map.set(name, ids);
  }
  return map;
}

/** Expand `a-b` ranges + bare ids: `170-177` → 170..177, `162,164` → [162,164]. */
function parseIds(s: string): number[] {
  const out: number[] = [];
  for (const tok of s.split(",")) {
    const t = tok.trim();
    if (!t) continue;
    const range = /^(-?\d+)\s*-\s*(-?\d+)$/.exec(t);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      for (let n = a; n <= b; n++) out.push(n);
    } else {
      const n = parseInt(t, 10);
      if (Number.isInteger(n)) out.push(n);
    }
  }
  return out;
}

// ---- loads ----

const LOADS_HEADERS = ["case_id", "description", "val_start", "val_end", "load_type", "element_key", "distribution", "axis"];

function importLoads(model: Model, rows: string[][]): { cases: number; loads: number } {
  const header = (rows[0] ?? []).map((h) => h.toLowerCase().trim());
  // Match columns by header name (fall back to .py positional order).
  const idx = LOADS_HEADERS.map((h) => header.indexOf(h));
  const ci = idx[0];
  if (ci < 0) throw new Error("basic_loads.csv needs a case_id column.");

  const raw: RawBasicLoad[] = [];
  const seenCases = new Map<number, string>(); // caseId → description

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (i: number): string | undefined => (i >= 0 ? row[i]?.trim() : undefined);

    const caseId = parseInt(get(ci) ?? "", 10);
    if (!Number.isInteger(caseId)) continue;

    const desc = get(idx[1]) ?? `Case ${caseId}`;
    if (!seenCases.has(caseId)) seenCases.set(caseId, desc);

    const valStart = parseFloat(get(idx[2]) ?? "");
    const valEnd = parseFloat(get(idx[3]) ?? "");
    const loadType = get(idx[4]) ?? "-beamUniform";
    const elementKey = get(idx[5]) ?? "";
    const distribution = /^linear$/i.test(get(idx[6]) ?? "") ? "linear" : "uniform";
    const axisRaw = (get(idx[7]) ?? "y").toLowerCase();
    const axis: "x" | "y" | "z" = axisRaw === "x" || axisRaw === "z" ? axisRaw : "y";

    if (!elementKey) continue;
    if (!Number.isFinite(valStart) && !Number.isFinite(valEnd)) continue;
    raw.push({
      caseId,
      valStart: Number.isFinite(valStart) ? valStart : 0,
      valEnd: Number.isFinite(valEnd) ? valEnd : 0,
      elementKey,
      loadType,
      distribution,
      axis,
    });
  }

  // Add load cases, preserving the CSV ids so combos that reference them resolve.
  let cases = 0;
  for (const [cid, desc] of seenCases) {
    if (model.getLoadCase(cid)) continue;
    model.addLoadCase({ id: cid, label: desc, type: inferCaseType(desc) });
    cases++;
  }

  // Build a temporary cases list (original ids) so buildLoadsFromRaw filters.
  const tempCases: LoadCase[] = [...seenCases].map(([id, label]) => ({
    id,
    label,
    type: inferCaseType(label),
  }));
  const built = buildLoadsFromRaw(raw, tempCases, model.getEleMap());

  let loads = 0;
  for (const ld of built) {
    if (model.addLoad({ ...ld, caseId: ld.caseId } as Parameters<Model["addLoad"]>[0])) loads++;
  }
  return { cases, loads };
}

// ---- combos ----

/** `id,description,factors` — factors as `caseId:factor` pairs, space separated. */
function importCombos(model: Model, rows: string[][]): number {
  const header = (rows[0] ?? []).map((h) => h.toLowerCase().trim());
  const idIdx = header.indexOf("id");
  const descIdx = header.indexOf("description") >= 0 ? header.indexOf("description") : header.indexOf("desc");
  const factIdx = header.indexOf("factors") >= 0 ? header.indexOf("factors") : header.indexOf("factor");

  let combos = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (i: number): string | undefined => (i >= 0 ? row[i]?.trim() : undefined);
    const id = parseInt(get(idIdx) ?? "", 10);
    if (!Number.isInteger(id)) continue;
    if (model.getLoadCombo(id)) continue; // skip duplicates
    const factors = parseFactors(get(factIdx) ?? "").filter((f) => model.getLoadCase(f.caseId));
    model.addLoadCombo({ id, label: get(descIdx) ?? `Combo ${id}`, factors });
    combos++;
  }
  return combos;
}

/** `1:1.35 2:1.0` or `1:1.35,2:1.0` → factor entries. */
function parseFactors(s: string): LoadCombo["factors"] {
  const out: LoadCombo["factors"] = [];
  for (const tok of s.split(/[\s,]+/)) {
    if (!tok) continue;
    const m = /^(-?\d+)\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/.exec(tok);
    if (m) {
      const caseId = parseInt(m[1], 10);
      const factor = parseFloat(m[2]);
      if (Number.isInteger(caseId) && Number.isFinite(factor)) out.push({ caseId, factor });
    }
  }
  return out;
}

// ---- CSV parsing ----

/** Rows whose first field is a comment marker (`;` or `#`) are skipped. */
function isCommentRow(row: string[]): boolean {
  const first = (row[0] ?? "").trim();
  return first.startsWith(";") || first.startsWith("#");
}

/** Parse CSV text into rows of fields, handling quoted fields and `""` escapes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop trailing blank rows.
  while (rows.length && rows[rows.length - 1].every((f) => f.trim() === "")) rows.pop();
  return rows;
}

/** Infer a bcad case type from a description string (mirrors the .py importer). */
function inferCaseType(desc: string): LoadCaseType {
  const u = desc.toUpperCase();
  if (/\b(DEAD|DL|SDL|SELF|SW|SOIL|EXCAV)\b/.test(u)) return "dead";
  if (/\b(LIVE|LL|PEDESTRIAN)\b/.test(u)) return "live";
  if (/\b(WIND|WL)\b/.test(u)) return "wind";
  if (/\b(SNOW|SL)\b/.test(u)) return "snow";
  if (/\b(QUAKE|SEISMIC|EQ|EARTHQUAKE)\b/.test(u)) return "quake";
  if (/\b(TEMP|THERMAL|TL)\b/.test(u)) return "temperature";
  return "other";
}
