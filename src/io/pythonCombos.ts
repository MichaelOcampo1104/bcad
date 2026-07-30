import type { BcadLoad, LoadCase, LoadCaseType, LoadCombo } from "../types";
import type { Model } from "../model/Model";

/**
 * Import load cases + combinations from a Python script like the project's
 * `Load_combinations.py`. That file defines two structures we care about:
 *
 *   basic_loads_data = [ ["1", "Description", ...], ... ]   # → load cases
 *   load_combinations = { "101": { "Description": "...",
 *                                  "Factors": {"1": 1.35, ...} }, ... }
 *
 * bcad parses only those — geometry/loads-on-elements are not in the .py, so
 * nothing else is touched. The parser is a tolerant text scan (brace/bracket
 * matching), not a real Python interpreter; it follows the same forgiving
 * philosophy as the STAAD parser.
 */

/** What `parsePythonCombos` extracts from the script. */
export interface ParsedCombos {
  loadCases: LoadCase[];
  loadCombos: LoadCombo[];
  loads: BcadLoad[];
}

/**
 * Extract load cases + combinations from a Python script's text. Throws a
 * friendly error if neither structure is found.
 */
export function parsePythonCombos(text: string): ParsedCombos {
  const cases = parseBasicLoads(text);
  const combos = parseCombinationDict(text);
  const eleMap = parseEleMap(text);
  const loads = parsePythonLoads(text, cases, eleMap);
  if (cases.length === 0 && combos.length === 0 && loads.length === 0) {
    throw new Error("No load_combinations or basic_loads_data found in .py file.");
  }
  return { loadCases: cases, loadCombos: combos, loads };
}

/**
 * Import parsed cases + combos INTO an existing model, appending rather than
 * replacing (the .py is metadata you layer onto an existing geometry model).
 * Case/combo ids that already exist are skipped to avoid collisions.
 */
export function importCombos(model: Model, text: string): { cases: number; combos: number; loads: number } {
  const { loadCases, loadCombos, loads } = parsePythonCombos(text);
  let casesAdded = 0;
  let combosAdded = 0;
  let loadsAdded = 0;

  for (const lc of loadCases) {
    if (model.getLoadCase(lc.id)) continue; // skip duplicates
    // Add via the model so it allocates its own id; then patch label/type.
    const created = model.addLoadCase({ label: lc.label, type: lc.type });
    // We want the STAAD/Python case id preserved so combo factors resolve.
    // addLoadCase allocates a new id, so rewrite it directly is not exposed;
    // instead build a factor-remap from old id → created id for combos below.
    idRemap.set(lc.id, created.id);
    casesAdded++;
  }

  for (const cb of loadCombos) {
    // Translate factor case ids through the remap (for newly added cases) or
    // keep as-is if the case already existed in the model.
    const factors = cb.factors
      .map((f) => ({ caseId: idRemap.get(f.caseId) ?? f.caseId, factor: f.factor }))
      .filter((f) => model.getLoadCase(f.caseId)); // drop factors to unknown cases
    model.addLoadCombo({ label: cb.label, factors });
    combosAdded++;
  }
  // Import loads from basic_loads_data
  for (const ld of loads) {
    // Map case id through the remap
    const mappedCaseId = idRemap.get(ld.caseId) ?? ld.caseId;
    if (model.getLoadCase(mappedCaseId)) {
      const created = model.addLoad({ ...ld, caseId: mappedCaseId } as any);
      if (created) loadsAdded++;
    }
  }
  return { cases: casesAdded, combos: combosAdded, loads: loadsAdded };
}

/** old case id → new model case id, for the current import. */
const idRemap = new Map<number, number>();

// ---- basic_loads_data list ----

/**
 * Parse `basic_loads_data = [ [.., ..], ... ]`. Each inner list's first item
 * is the case id (string number) and second is the description. We extract a
 * LoadCase per row.
 */
function parseBasicLoads(text: string): LoadCase[] {
  const start = findAssignment(text, "basic_loads_data");
  if (start < 0) return [];
  const listStart = text.indexOf("[", start);
  if (listStart < 0) return [];
  const body = balancedSlice(text, listStart, "[", "]");
  if (!body) return [];

  const out: LoadCase[] = [];
  // Each inner row is `[ ... ]`; walk through them.
  let i = 1; // skip the opening [
  while (i < body.length - 1) {
    const rowStart = body.indexOf("[", i);
    if (rowStart < 0) break;
    const rowBody = balancedSlice(body, rowStart, "[", "]");
    if (!rowBody) break;
    const fields = splitTopLevel(rowBody.slice(1, -1));
    if (fields.length >= 2) {
      const id = parseInt(stripQuotes(fields[0]).trim(), 10);
      const desc = stripQuotes(fields[1]).trim();
      if (Number.isInteger(id)) {
        out.push({ id, label: desc || `Case ${id}`, type: inferCaseType(desc) });
      }
    }
    i = rowStart + 1;
  }
  return out;
}

// ---- load_combinations dict ----

/** Parse `load_combinations = { "101": { "Description": ..., "Factors": {...} }, ... }`. */
function parseCombinationDict(text: string): LoadCombo[] {
  const start = findAssignment(text, "load_combinations");
  if (start < 0) return [];
  const dictStart = text.indexOf("{", start);
  if (dictStart < 0) return [];
  const body = balancedSlice(text, dictStart, "{", "}");
  if (!body) return [];

  const out: LoadCombo[] = [];
  // Walk top-level entries: `"key": { ... }`.
  let i = 1; // skip opening {
  while (i < body.length - 1) {
    // Skip whitespace/commas/comments.
    i = skipWsCommasComments(body, i);
    if (i >= body.length - 1) break;
    // Read the key (quoted string).
    const keyEnd = findQuoteEnd(body, i);
    if (keyEnd < 0) break;
    const key = stripQuotes(body.slice(i, keyEnd + 1)).trim();
    i = keyEnd + 1;
    // Skip to the value's opening brace.
    const valStart = body.indexOf("{", i);
    if (valStart < 0) break;
    const valBody = balancedSlice(body, valStart, "{", "}");
    if (!valBody) break;
    const { description, factors } = parseComboEntry(valBody);
    const id = parseInt(key, 10);
    out.push({
      id: Number.isInteger(id) ? id : 0,
      label: description || `Combo ${key}`,
      factors,
    });
    i = valStart + valBody.length;
  }
  return out;
}

/** Parse one combo value dict → { description, factors[] }. */
function parseComboEntry(dictBody: string): { description: string; factors: LoadCombo["factors"] } {
  let description = "";
  const factors: LoadCombo["factors"] = [];
  let i = 1;
  while (i < dictBody.length - 1) {
    i = skipWsCommasComments(dictBody, i);
    if (i >= dictBody.length - 1) break;
    const keyEnd = findQuoteEnd(dictBody, i);
    if (keyEnd < 0) break;
    const key = stripQuotes(dictBody.slice(i, keyEnd + 1)).trim();
    i = keyEnd + 1;
    // Skip the colon.
    const colon = dictBody.indexOf(":", i);
    if (colon < 0) break;
    i = colon + 1;
    // Read the value: a string (Description) or a nested dict (Factors).
    i = skipWsAndComments(dictBody, i);
    if (dictBody[i] === "{") {
      const factBody = balancedSlice(dictBody, i, "{", "}");
      if (factBody) {
        factors.push(...parseFactorDict(factBody));
        i += factBody.length;
      }
    } else if (dictBody[i] === '"' || dictBody[i] === "'") {
      const strEnd = findQuoteEnd(dictBody, i);
      if (strEnd >= 0) {
        if (key.toLowerCase() === "description") {
          description = stripQuotes(dictBody.slice(i, strEnd + 1)).trim();
        }
        i = strEnd + 1;
      }
    } else {
      // Skip a bare value (number, etc.) to the next comma.
      const comma = dictBody.indexOf(",", i);
      i = comma < 0 ? dictBody.length : comma;
    }
  }
  return { description, factors };
}

/** Parse a Factors dict `{"1": 1.35, "2": 1.0, ...}` → factor entries. */
function parseFactorDict(dictBody: string): LoadCombo["factors"] {
  const out: LoadCombo["factors"] = [];
  let i = 1;
  while (i < dictBody.length - 1) {
    i = skipWsCommasComments(dictBody, i);
    if (i >= dictBody.length - 1) break;
    const keyEnd = findQuoteEnd(dictBody, i);
    if (keyEnd < 0) break;
    const caseId = parseInt(stripQuotes(dictBody.slice(i, keyEnd + 1)).trim(), 10);
    i = keyEnd + 1;
    const colon = dictBody.indexOf(":", i);
    if (colon < 0) break;
    i = colon + 1;
    // Read the numeric factor up to the next comma/brace.
    const rest = dictBody.slice(i);
    const m = /^\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/.exec(rest);
    if (m && Number.isInteger(caseId)) {
      out.push({ caseId, factor: parseFloat(m[1]) });
      i += m[0].length;
    } else {
      const comma = dictBody.indexOf(",", i);
      i = comma < 0 ? dictBody.length : comma;
    }
  }
  return out;
}

// ---- ele_map parser ----

/**
 * Parse `ele_map = { "Key": [ids...], ... }` from the Python text.
 */
function parseEleMap(text: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const start = findAssignment(text, "ele_map");
  if (start < 0) return out;
  const dictStart = text.indexOf("{", start);
  if (dictStart < 0) return out;
  const body = balancedSlice(text, dictStart, "{", "}");
  if (!body) return out;
  let i = 1;
  while (i < body.length - 1) {
    i = skipWsCommasComments(body, i);
    if (i >= body.length - 1) break;
    const keyEnd = findQuoteEnd(body, i);
    if (keyEnd < 0) break;
    const key = stripQuotes(body.slice(i, keyEnd + 1));
    i = keyEnd + 1;
    const colon = body.indexOf(":", i);
    if (colon < 0) break;
    i = colon + 1;
    i = skipWsAndComments(body, i);
    if (body[i] !== "[") break;
    // Parse the list of numbers (may include range() calls)
    const listBody = balancedSlice(body, i, "[", "]");
    if (!listBody) break;
    const ids: number[] = [];
    const inner = listBody.slice(1, -1);
    // Parse comma-separated values: numbers or list(range(a,b))
    const parts = inner.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    for (const part of parts) {
      // Check for list(range(a, b)) or range(a, b)
      const rangeMatch = part.match(/range\s*\(\s*(\d+)\s*,?\s*(\d+)?\s*\)/i);
      if (rangeMatch) {
        const from = parseInt(rangeMatch[1], 10);
        const to = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : from + 1;
        for (let n = from; n < to; n++) ids.push(n);
      } else {
        const n = parseInt(part, 10);
        if (Number.isInteger(n)) ids.push(n);
      }
    }
    out.set(key, ids);
    i = listBody ? i + listBody.length : i + 1;
  }
  return out;
}

// ---- load data from basic_loads_data ----

interface RawBasicLoad {
  caseId: number;
  valStart: number;
  valEnd: number;
  elementKey: string;
}

/**
 * Parse basic_loads_data to extract load magnitudes and their target elements.
 */
function parseBasicLoadData(text: string): RawBasicLoad[] {
  const out: RawBasicLoad[] = [];
  const start = findAssignment(text, "basic_loads_data");
  if (start < 0) return out;
  const listStart = text.indexOf("[", start);
  if (listStart < 0) return out;
  const body = balancedSlice(text, listStart, "[", "]");
  if (!body) return out;
  let i = 1;
  while (i < body.length - 1) {
    const rowStart = body.indexOf("[", i);
    if (rowStart < 0) break;
    const rowBody = balancedSlice(body, rowStart, "[", "]");
    if (!rowBody) break;
    const fields = splitTopLevel(rowBody.slice(1, -1));
    if (fields.length >= 8) {
      const caseId = parseInt(stripQuotes(fields[0]).trim(), 10);
      const valStart = parseFloat(stripValue(fields[4]));
      const valEnd = parseFloat(stripValue(fields[5]));
      const elementKey = stripQuotes(fields[7]).trim();
      if (Number.isInteger(caseId) && (Number.isFinite(valStart) || Number.isFinite(valEnd))) {
        out.push({ caseId, valStart: Number.isFinite(valStart) ? valStart : 0, valEnd: Number.isFinite(valEnd) ? valEnd : 0, elementKey });
      }
    }
    i = rowStart + 1;
  }
  return out;
}

/** Strip quotes and handle np.nan / None values. */
function stripValue(s: string): string {
  const t = s.trim();
  if (/^np\.nan$/i.test(t) || /^None$/i.test(t) || t === "") return "NaN";
  return stripQuotes(t);
}

/**
 * Create BcadLoad objects from basic load data and element map.
 */
function parsePythonLoads(text: string, cases: LoadCase[], eleMap: Map<string, number[]>): BcadLoad[] {
  const raw = parseBasicLoadData(text);
  const loads: BcadLoad[] = [];
  let nextId = 1;
  for (const r of raw) {
    // Only process loads whose case is in the cases list
    if (!cases.some((c) => c.id === r.caseId)) continue;
    const members = eleMap.get(r.elementKey) ?? [];
    for (const memberId of members) {
      if (r.valStart === 0 && r.valEnd === 0) continue;
      loads.push({
        id: nextId++,
        caseId: r.caseId,
        kind: "member_distributed",
        memberId,
        axis: "y",
        da: 0,
        db: 1,
        wa: r.valStart,
        wb: r.valEnd,
        direction: "global",
      });
    }
  }
  return loads;
}

// ---- small text helpers ----

/** Find `name =` (or `name=`) at a word boundary; returns the index of the name. */
function findAssignment(text: string, name: string): number {
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`);
  const m = re.exec(text);
  return m ? m.index : -1;
}

/**
 * Return the substring from the opener at `openIdx` through its matching
 * closer (inclusive), respecting nesting. Returns null if unbalanced.
 */
function balancedSlice(text: string, openIdx: number, open: string, close: string): string | null {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

/** Index of the closing quote for the quote char at `start`, or -1. */
function findQuoteEnd(text: string, start: number): number {
  const q = text[start];
  if (q !== '"' && q !== "'") return -1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === q) return i;
  }
  return -1;
}

/** Advance `i` past whitespace and `#`-comment-to-end-of-line. */
function skipWsAndComments(s: string, i: number): number {
  let k = i;
  while (k < s.length) {
    const c = s[k];
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      k++;
    } else if (c === "#") {
      // Skip to end of line.
      const nl = s.indexOf("\n", k);
      k = nl < 0 ? s.length : nl + 1;
    } else {
      break;
    }
  }
  return k;
}

/** Advance `i` past whitespace, commas, and `#`-comment-to-end-of-line. */
function skipWsCommasComments(s: string, i: number): number {
  let k = i;
  while (k < s.length) {
    const c = s[k];
    if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === ",") {
      k++;
    } else if (c === "#") {
      const nl = s.indexOf("\n", k);
      k = nl < 0 ? s.length : nl + 1;
    } else {
      break;
    }
  }
  return k;
}

/** Strip surrounding quotes from a string token. */
function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Split a comma-separated list at the top level (not inside nested [] or {}).
 * Used for the fields of a basic_loads_data row.
 */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const c of s) {
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) {
      out.push(buf);
      buf = "";
    } else {
      buf += c;
    }
  }
  if (buf.trim().length > 0) out.push(buf);
  return out;
}

/** Infer a bcad case type from a description string (mirrors the STAAD parser). */
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
