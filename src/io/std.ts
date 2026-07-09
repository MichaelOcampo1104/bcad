import type {
  BcadLoad,
  BcadMember,
  BcadNode,
  LoadCase,
  LoadCaseType,
  LoadCombo,
  MaterialType,
  MemberFixity,
  MemberTag,
  ModelSnapshot,
  NodeFixity,
  SectionShape,
} from "../types";
import {
  makeNodeFixity,
  memberEndReleaseFixed,
  memberEndReleaseFromDofs,
  memberEndReleasePinned,
  memberEndReleaseToDofs,
} from "../types";
import type { Model } from "../model/Model";
import { triggerDownload } from "./csv";

/**
 * STAAD.Pro `.std` import/export — **lossy**.
 *
 * bcad models only the structural skeleton: joints (nodes), incidences
 * (members), supports, loads, and load combinations. Everything else STAAD
 * knows about — materials, member sizing (`MEMBER PROPERTY`), `BETA` angles,
 * end releases, `MEMBER TENSION`, design `PARAMETER`/`CODE`/`CHECK CODE`,
 * `PRINT`, `PERFORM ANALYSIS`, `LOAD LIST`, job metadata — is intentionally
 * dropped on export. Sizing and properties are finalized in STAAD itself.
 *
 * The parser is a forgiving single-pass state machine built against the
 * command syntax seen in real project files: portal frames, trusses,
 * staircases, plane frames. It tolerates free whitespace, `;`-several-per-line
 * joint coordinates, `TO` ranges in id lists, both `SUPPORT`/`SUPPORTS`, and
 * `*` / `**` comments.
 */

// ---- public API ----

/**
 * Parse STAAD `.std` text into a ModelSnapshot suitable for `Model.load`.
 * Throws a friendly Error if no `STAAD` header is found.
 */
export function parseStd(text: string): ModelSnapshot {
  // Strip a leading UTF-8 BOM (﻿) that many Windows/STAAD tools prepend.
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const p = new StdParser(clean);
  const snap = p.run();
  console.log(
    `[bcad] Parsed .std: ${snap.nodes.length} nodes, ${snap.members.length} members, ` +
    `${snap.loadCases?.length ?? 0} load case(s), ${snap.loads?.length ?? 0} load(s), ` +
    `${snap.loadCombos?.length ?? 0} combo(s)`
  );
  return snap;
}

/** Serialize the model to a STAAD `.std` script (lossy — see file doc). */
export function writeStd(model: Model): string {
  return new StdWriter(model).write();
}

/** Trigger a browser download of the model as a `.std` file. */
export function exportStd(model: Model, filename = "bcad-model.std"): void {
  const text = writeStd(model);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  triggerDownload(filename, blob);
}

// ---- parsing ----

interface RawJoint {
  id: number;
  x: number;
  y: number;
  z: number;
}
interface RawMember {
  id: number;
  a: number;
  b: number;
}
interface RawSupport {
  nodes: number[];
  fixity: NodeFixity;
  /** True if this was a FIXED BUT ... (partial) so we keep it as custom. */
  custom: boolean;
}

/** Resolved load-direction token, e.g. `GY` → { axis:"y", global:true }. */
interface LoadDir {
  axis: "x" | "y" | "z";
  global: boolean;
  /** True for moment directions (MX/MY/MZ). */
  moment: boolean;
}

class StdParser {
  /** Raw lines with comments/blanks removed; `;` still inline. */
  private lines: string[] = [];
  /** Current line index. */
  private i = 0;

  private unit = "METER KN";

  private joints: RawJoint[] = [];
  private members: RawMember[] = [];
  private supports: RawSupport[] = [];

  private loadCases: LoadCase[] = [];
  private loads: BcadLoad[] = [];
  private loadCombos: LoadCombo[] = [];

  private nextLoadId = 1;

  /** Material definitions from DEFINE MATERIAL blocks (name → type). */
  private materialDefs = new Map<string, MaterialType>();
  /** Section assignments per member id from MEMBER PROPERTY. */
  private memberSectionMap = new Map<number, SectionShape>();
  /** Material assignments per member id from CONSTANTS. */
  private memberMaterialMap = new Map<number, MaterialType>();
  private memberTagMap = new Map<number, MemberTag>();
  /** Strength grade per material name from DEFINE MATERIAL (e.g. "STEEL" -> "S275"). */
  private materialGradeDefs = new Map<string, string>();
  /** Strength grade assigned to members via CONSTANTS. */
  private memberGradeMap = new Map<number, string>();
  private memberBetaMap = new Map<number, number>();
  private memberReleaseMap = new Map<number, MemberFixity>();

  constructor(text: string) {
    this.preprocess(text);
  }

  /** Strip comments + blank lines; split `;`-joined coordinate lines; join
   *  `-` continuation lines into one logical line. */
  private preprocess(text: string): void {
    const raw = text.split(/\r?\n/);
    // First pass: join lines that end with a STAAD continuation hyphen (`-`).
    // A trailing `-` (optionally followed by spaces) means the statement
    // continues on the next line, so concatenate them with a space.
    const joined: string[] = [];
    let buf = "";
    for (const line of raw) {
      // Trim trailing spaces to detect the `-` reliably.
      const r = line.replace(/\s+$/, "");
      if (r.endsWith("-") && !r.endsWith("--")) {
        // Drop the trailing hyphen, keep accumulating.
        buf += r.slice(0, -1) + " ";
      } else {
        buf += line;
        joined.push(buf);
        buf = "";
      }
    }
    if (buf.length > 0) joined.push(buf);

    for (const line of joined) {
      // A line whose first non-space char is `*` is a comment.
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("*")) continue;
      // `;` separates several entries on one line (common for JOINT COORDINATES).
      const parts = line.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
      for (const part of parts) {
        // Inline trailing comment after a `*` on a data line is rare; drop if present.
        const starIdx = this.findInlineComment(part);
        const clean = (starIdx >= 0 ? part.slice(0, starIdx) : part).trim();
        if (clean.length > 0) this.lines.push(clean);
      }
    }
  }

  /**
   * Find where an inline `*` comment starts. A `*` counts as a comment only if
   * it's preceded by whitespace or starts the token (so `2.5*3` math-like junk
   * isn't split — though real STAAD doesn't use `*` that way in data).
   */
  private findInlineComment(s: string): number {
    for (let k = 0; k < s.length; k++) {
      if (s[k] === "*" && (k === 0 || /\s/.test(s[k - 1]))) return k;
    }
    return -1;
  }

  run(): ModelSnapshot {
    this.expectStaadHeader();
    while (this.i < this.lines.length) {
      const line = this.lines[this.i];
      const head = this.firstToken(line).toUpperCase();

      // Block headers we understand — dispatch and consume.
      if (head === "UNIT" || head === "UNITS") {
        this.unit = line.trim().slice(head.length).trim() || this.unit;
        this.i++;
      } else if (head === "JOINT" && this.secondToken(line) === "COORDINATES") {
        this.i++;
        this.parseJoints();
      } else if (head === "MEMBER" && this.secondToken(line) === "INCIDENCES") {
        this.i++;
        this.parseMembers();
      } else if (head === "SUPPORT" || head === "SUPPORTS") {
        this.i++;
        this.parseSupports();
      } else if (head === "LOAD") {
        // `LOAD COMB ...` is handled below; a bare `LOAD n <label>` starts a case.
        if (this.secondToken(line).toUpperCase() === "COMB") {
          this.i++;
          this.parseLoadCombo();
        } else {
          this.i++;
          this.parseLoadCase();
        }
      } else if (head === "DEFINE") {
        // Only DEFINE MATERIAL is parsed; other DEFINE blocks (UBC, etc.)
        // are skipped so they don't consume subsequent LOAD commands.
        if (/DEFINE\s+MATERIAL/i.test(line)) {
          this.i++;
          this.parseDefineMaterial();
        } else {
          this.i++;
          while (this.i < this.lines.length) {
            const h = this.firstToken(this.lines[this.i]).toUpperCase();
            if (h === "LOAD" || h === "FINISH" || h === "PERFORM" || h === "END" ||
                h === "MEMBER" || h === "JOINT" || h === "SUPPORT" || h === "SUPPORTS") break;
            this.i++;
          }
        }
      } else if (head === "MEMBER" && this.secondToken(line) === "PROPERTY") {
        this.i++;
        this.parseMemberProperty();
      } else if (head === "MEMBER" && this.secondToken(line) === "RELEASE") {
        this.i++;
        this.parseMemberRelease();
      } else if (head === "MEMBER" && this.secondToken(line) === "TRUSS") {
        this.i++;
        this.parseMemberTruss();
      } else if (head === "CONSTANT" || head === "CONSTANTS") {
        this.i++;
        this.parseConstants();
      } else if (head === "START") {
        this.i++;
        this.parseStartBlock();
      } else {
        // Unknown / ignored command — skip silently (lossy by design).
        this.i++;
      }
    }

    return this.toSnapshot();
  }

  /** The first whitespace-delimited token of a line, uppercased by caller. */
  private firstToken(line: string): string {
    const m = /^\s*(\S+)/.exec(line);
    return m ? m[1] : "";
  }
  /** The second token, uppercased; "" if none. */
  private secondToken(line: string): string {
    const m = /^\s*\S+\s+(\S+)/.exec(line);
    return m ? m[1].toUpperCase() : "";
  }

  /** `STAAD SPACE|PLANE <title>` must be the first meaningful line. */
  private expectStaadHeader(): void {
    while (this.i < this.lines.length) {
      const line = this.lines[this.i];
      const head = this.firstToken(line).toUpperCase();
      if (head === "STAAD") {
        // Confirmed: this is a STAAD file. (Title after STAAD SPACE/PLANE is
        // parsed for validation but not retained — bcad has no project-name.)
        this.i++;
        return;
      }
      // Skip anything before the STAAD header (noise from PDF extraction, etc.).
      this.i++;
    }
    throw new Error("Not a STAAD file (no STAAD header found).");
  }

  // ---- joint coordinates ----

  private parseJoints(): void {
    while (this.i < this.lines.length && !this.isBlockHeader(this.lines[this.i])) {
      this.parseJointLine(this.lines[this.i]);
      this.i++;
    }
  }

  /** `id x y z` (z optional, defaults 0). */
  private parseJointLine(line: string): void {
    const t = line.trim().split(/\s+/);
    const id = parseInt(t[0], 10);
    if (!Number.isInteger(id)) return;
    const x = parseFloat(t[1] ?? "");
    const y = parseFloat(t[2] ?? "");
    const z = parseFloat(t[3] ?? "0");
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.joints.push({ id, x, y, z: Number.isFinite(z) ? z : 0 });
  }

  // ---- member incidences ----

  private parseMembers(): void {
    while (this.i < this.lines.length && !this.isBlockHeader(this.lines[this.i])) {
      this.parseMemberLine(this.lines[this.i]);
      this.i++;
    }
  }

  /** `memberId nodeA nodeB`. */
  private parseMemberLine(line: string): void {
    const t = line.trim().split(/\s+/);
    const id = parseInt(t[0], 10);
    const a = parseInt(t[1] ?? "", 10);
    const b = parseInt(t[2] ?? "", 10);
    if (!Number.isInteger(id) || !Number.isInteger(a) || !Number.isInteger(b)) return;
    if (a === b) return;
    this.members.push({ id, a, b });
  }

  // ---- supports ----

  private parseSupports(): void {
    while (this.i < this.lines.length && !this.isBlockHeader(this.lines[this.i])) {
      this.parseSupportLine(this.lines[this.i]);
      this.i++;
    }
  }

  /**
   * `<node-list> PINNED|FIXED|FIXED BUT <free-dofs> [springs...]`.
   * Several specs can appear on one line; we scan token by token.
   */
  private parseSupportLine(line: string): void {
    const tokens = line.trim().split(/\s+/);
    let k = 0;
    while (k < tokens.length) {
      // Read a run of node ids (ids / ranges) up to the next keyword.
      const nodes: number[] = [];
      while (k < tokens.length && !this.isSupportKeyword(tokens[k])) {
        const consumed = this.readIdListFrom(tokens, k);
        nodes.push(...consumed.ids);
        k = consumed.next;
        if (consumed.ids.length === 0) break; // safety: avoid infinite loop
      }
      if (nodes.length === 0) break;

      // Now expect a keyword.
      const kw = (tokens[k] ?? "").toUpperCase();
      if (kw === "PINNED" || kw === "PIN") {
        this.supports.push({ nodes, fixity: makeNodeFixity("pinned"), custom: false });
        k++;
      } else if (kw === "FIXED" || kw === "FIX") {
        // `FIXED BUT ...` → custom; plain `FIXED` → fully fixed.
        const next = (tokens[k + 1] ?? "").toUpperCase();
        if (next === "BUT") {
          const dofs = this.readFreeDofs(tokens, k + 2);
          this.supports.push({ nodes, fixity: dofs, custom: true });
          // Advance past BUT + the dof tokens (stop at a numeric = next node list).
          k = this.skipUntilIdStart(tokens, k + 2);
        } else {
          this.supports.push({ nodes, fixity: makeNodeFixity("fixed"), custom: false });
          k++;
        }
      } else {
        // Unknown keyword — treat as pinned fallback so nodes aren't lost.
        this.supports.push({ nodes, fixity: makeNodeFixity("pinned"), custom: false });
        k++;
      }
    }
  }

  private isSupportKeyword(tok: string): boolean {
    const u = tok.toUpperCase();
    return u === "PINNED" || u === "PIN" || u === "FIXED" || u === "FIX" || u === "BUT";
  }

  /**
   * Read DOF names after `FIXED BUT` until we hit a token that looks like a
   * node id (number or `TO`). Names list the DOFs that are FREE, e.g.
   * `FX MY MZ` → those are free, rest fixed. Spring tokens like `KFY 21600`
   * → consume the value after a `K*` token.
   */
  private readFreeDofs(tokens: string[], start: number): NodeFixity {
    const free = new Set<string>();
    let k = start;
    while (k < tokens.length) {
      const u = tokens[k].toUpperCase();
      if (u === "FX" || u === "FY" || u === "FZ" || u === "MX" || u === "MY" || u === "MZ") {
        free.add(u.toLowerCase());
        k++;
      } else if (/^K[FMR][XYZ]$/.test(u)) {
        // Spring: `KFY 21600` — skip the spring magnitude too.
        k += 2;
      } else if (u === "BUT") {
        k++;
      } else {
        break; // numeric or `TO` → start of next node list
      }
    }
    return {
      tx: free.has("fx") ? "free" : "fixed",
      ty: free.has("fy") ? "free" : "fixed",
      tz: free.has("fz") ? "free" : "fixed",
      rx: free.has("mx") ? "free" : "fixed",
      ry: free.has("my") ? "free" : "fixed",
      rz: free.has("mz") ? "free" : "fixed",
    };
  }

  /** Advance `k` past DOF/spring tokens to the next token that starts a node id. */
  private skipUntilIdStart(tokens: string[], start: number): number {
    let k = start;
    while (k < tokens.length) {
      const u = tokens[k].toUpperCase();
      if (/^\d+$/.test(tokens[k]) || u === "TO") return k;
      if (/^K[FMR][XYZ]$/.test(u)) {
        k += 2;
        continue;
      }
      k++;
    }
    return k;
  }

  // ---- load cases ----

  /**
   * `LOAD n <label...>` — start a new load case. Everything until the next
   * block header belongs to it: SELFWEIGHT, JOINT LOAD, MEMBER LOAD.
   */
  private parseLoadCase(): void {
    const line = this.lines[this.i - 1]; // header already consumed
    const t = line.trim().split(/\s+/);
    const id = parseInt(t[1] ?? "", 10);
    // Use the STAAD load id as bcad's case id so combos can reference it.
    const caseId = Number.isInteger(id) ? id : this.fallbackCaseId();
    const label = t.slice(2).join(" ").trim() || `LOAD ${caseId}`;
    const type = inferCaseType(label);
    this.loadCases.push({ id: caseId, label, type });

    while (this.i < this.lines.length && !this.isLoadCaseEnd(this.lines[this.i])) {
      const body = this.lines[this.i];
      const head = this.firstToken(body).toUpperCase();
      if (head === "SELFWEIGHT") {
        // No self-weight entity in bcad; carry intent as a case-label note.
        // (Kept as-is: the label already says e.g. "SELF WEIGHT".)
        this.i++;
      } else if (head === "JOINT" && this.secondToken(body) === "LOAD") {
        this.i++;
        this.parseJointLoad(caseId);
      } else if (head === "MEMBER" && this.secondToken(body) === "LOAD") {
        this.i++;
        this.parseMemberLoad(caseId);
      } else {
        this.i++;
      }
    }
  }

  private fallbackCaseId(): number {
    // Choose an id not already used.
    const used = new Set(this.loadCases.map((c) => c.id));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  /** `JOINT LOAD` body: `<node-list> <dir> <mag> [...]`. */
  private parseJointLoad(caseId: number): void {
    while (this.i < this.lines.length && !this.isLoadCaseEnd(this.lines[this.i]) && !this.isLoadSubHeader(this.lines[this.i])) {
      const tokens = this.lines[this.i].trim().split(/\s+/);
      let k = 0;
      while (k < tokens.length) {
        const nodes: number[] = [];
        const consumed = this.readIdListFrom(tokens, k);
        nodes.push(...consumed.ids);
        k = consumed.next;
        if (nodes.length === 0) break;

        // Then one or more `DIR MAG` pairs until the next node id appears.
        const comps: Partial<Record<"fx" | "fy" | "fz" | "mx" | "my" | "mz", number>> = {};
        while (k < tokens.length && this.isLoadDir(tokens[k])) {
          const dir = this.parseLoadDir(tokens[k]);
          const mag = parseFloat(tokens[k + 1] ?? "");
          if (Number.isFinite(mag)) {
            this.assignForce(comps, dir, mag);
          }
          k += 2;
        }
        // Skip this node group if no components were given (e.g. a dangling
        // node list with no force — shouldn't create zero loads).
        const hasAny =
          comps.fx !== undefined || comps.fy !== undefined || comps.fz !== undefined ||
          comps.mx !== undefined || comps.my !== undefined || comps.mz !== undefined;
        if (hasAny) {
          for (const n of nodes) {
            this.loads.push({
              id: this.nextLoadId++,
              caseId,
              kind: "nodal",
              nodeId: n,
              fx: comps.fx ?? 0,
              fy: comps.fy ?? 0,
              fz: comps.fz ?? 0,
              mx: comps.mx ?? 0,
              my: comps.my ?? 0,
              mz: comps.mz ?? 0,
              direction: "global",
            });
          }
        }
        if (k < tokens.length && !this.isLoadDir(tokens[k]) && !/^\d+$/.test(tokens[k])) {
          // Stuck on an unexpected token — advance to avoid looping.
          k++;
        }
      }
      this.i++;
    }
  }

  /** `MEMBER LOAD` body: `<member-list> UNI|CON <dir> <mag> [d1 d2|dist]`. */
  private parseMemberLoad(caseId: number): void {
    while (this.i < this.lines.length && !this.isLoadCaseEnd(this.lines[this.i]) && !this.isLoadSubHeader(this.lines[this.i])) {
      const tokens = this.lines[this.i].trim().split(/\s+/);
      let k = 0;
      while (k < tokens.length) {
        const members: number[] = [];
        const consumed = this.readIdListFrom(tokens, k);
        members.push(...consumed.ids);
        k = consumed.next;
        if (members.length === 0) break;

        const shape = (tokens[k] ?? "").toUpperCase();
        if (shape !== "UNI" && shape !== "CON" && shape !== "LIN" && shape !== "TRAP") {
          // Unknown load shape (TRAP, UMOMENT, …) — skip the rest of the line.
          break;
        }
        k++;
        const dir = this.parseLoadDir(tokens[k] ?? "");
        const mag = parseFloat(tokens[k + 1] ?? "");
        k += 2;

        if (shape === "UNI") {
          if (this.isLoadDir(tokens[k]) || /^\d+$/.test(tokens[k] ?? "")) {
            // Possibly distances or next spec; leave them to the next iteration.
          }
          for (const m of members) {
            this.loads.push({
              id: this.nextLoadId++,
              caseId,
              kind: "member_distributed",
              memberId: m,
              axis: dir.axis,
              da: 0,
              db: 1,
              wa: mag,
              wb: mag,
              direction: dir.global ? "global" : "local",
            });
          }
        } else if (shape === "LIN") {
          const w1 = mag;
          const w2 = parseFloat(tokens[k] ?? "");
          if (Number.isFinite(w2)) k++;
          for (const m of members) {
            this.loads.push({
              id: this.nextLoadId++,
              caseId,
              kind: "member_distributed",
              memberId: m,
              axis: dir.axis,
              da: 0, db: 1,
              wa: w1,
              wb: Number.isFinite(w2) ? w2 : w1,
              direction: dir.global ? "global" : "local",
            });
          }
        } else if (shape === "TRAP") {
          const w1 = mag;
          const w2 = parseFloat(tokens[k] ?? ""); k++;
          const d1 = parseFloat(tokens[k] ?? ""); if (Number.isFinite(d1)) k++;
          const d2 = parseFloat(tokens[k] ?? ""); if (Number.isFinite(d2)) k++;
          for (const m of members) {
            this.loads.push({
              id: this.nextLoadId++,
              caseId,
              kind: "member_distributed",
              memberId: m,
              axis: dir.axis,
              da: Number.isFinite(d1) ? d1 : 0,
              db: Number.isFinite(d2) ? d2 : 1,
              wa: Number.isFinite(w1) ? w1 : 0,
              wb: Number.isFinite(w2) ? w2 : Number.isFinite(w1) ? w1 : 0,
              direction: dir.global ? "global" : "local",
            });
          }
        } else {
          // CON: optional distance after the magnitude (fraction along member).
          const distTok = tokens[k];
          const dist = parseFloat(distTok ?? "");
          const d = Number.isFinite(dist) ? dist : 0.5; // STAAD default = midspan
          if (Number.isFinite(dist)) k++;
          for (const m of members) {
            this.loads.push({
              id: this.nextLoadId++,
              caseId,
              kind: "member_point",
              memberId: m,
              dist: d,
              fx: dir.axis === "x" ? mag : 0,
              fy: dir.axis === "y" ? mag : 0,
              fz: dir.axis === "z" ? mag : 0,
              direction: dir.global ? "global" : "local",
            });
          }
        }
      }
      this.i++;
    }
  }

  private isLoadDir(tok: string): boolean {
    const u = (tok ?? "").toUpperCase();
    return (
      u === "FX" || u === "FY" || u === "FZ" ||
      u === "MX" || u === "MY" || u === "MZ" ||
      u === "GX" || u === "GY" || u === "GZ" ||
      u === "X" || u === "Y" || u === "Z"
    );
  }

  /** `FX`→{x,global:false, moment:false}, `GY`→{y,global:true}, `MX`→{x?,...}. */
  private parseLoadDir(tok: string): LoadDir {
    const u = (tok ?? "").toUpperCase();
    if (u.length < 1) return { axis: "y", global: false, moment: false };
    const global = u.startsWith("G");
    // Strip a leading G to get the underlying axis letter.
    const rest = global ? u.slice(1) : u;
    // `FX`/`GX` → X force; `MX`/`GY` → handled by last letter; bare `X` → X.
    const letter = rest[rest.length - 1].toLowerCase();
    const moment = rest.startsWith("M");
    const axis = (letter === "x" || letter === "y" || letter === "z") ? letter : "y";
    return { axis: axis as "x" | "y" | "z", global, moment };
  }

  /** Map a force magnitude into the right component slot (F→force, M→moment). */
  private assignForce(
    comps: Partial<Record<"fx" | "fy" | "fz" | "mx" | "my" | "mz", number>>,
    dir: LoadDir,
    mag: number
  ): void {
    const key = (dir.moment ? "m" : "f") + dir.axis;
    comps[key as "fx" | "fy" | "fz" | "mx" | "my" | "mz"] = mag;
  }

  // ---- load combinations ----

  /** `LOAD COMB n <label>` then `caseId factor caseId factor ...` lines. */
  private parseLoadCombo(): void {
    const line = this.lines[this.i - 1]; // header already consumed
    const t = line.trim().split(/\s+/);
    // `LOAD COMB 104 1.0DL+1.0WL1`
    const id = parseInt(t[2] ?? "", 10);
    const comboId = Number.isInteger(id) ? id : this.fallbackComboId();
    const label = t.slice(3).join(" ").trim() || `COMBO ${comboId}`;

    const factors: { caseId: number; factor: number }[] = [];
    while (this.i < this.lines.length && !this.isBlockHeader(this.lines[this.i])) {
      const toks = this.lines[this.i].trim().split(/\s+/);
      // Pairs of (caseId, factor).
      for (let k = 0; k + 1 < toks.length; k += 2) {
        const cid = parseInt(toks[k], 10);
        const f = parseFloat(toks[k + 1] ?? "");
        if (Number.isInteger(cid) && Number.isFinite(f)) {
          factors.push({ caseId: cid, factor: f });
        }
      }
      this.i++;
    }
    this.loadCombos.push({ id: comboId, label, factors });
  }

  private fallbackComboId(): number {
    const used = new Set(this.loadCombos.map((c) => c.id));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  // ---- id-list reading ----

  /**
   * Read a run of ids / `a TO b` ranges starting at `tokens[k]`. Returns the
   * expanded ids and the index of the next unconsumed token.
   */
  private readIdListFrom(tokens: string[], k: number): { ids: number[]; next: number } {
    const ids: number[] = [];
    let j = k;
    let guard = 0;
    while (j < tokens.length && guard < 10000) {
      guard++;
      const tok = tokens[j];
      if (!/^\d+$/.test(tok)) break; // not an id → end of list
      const first = parseInt(tok, 10);
      // `a TO b` range?
      if ((tokens[j + 1] ?? "").toUpperCase() === "TO" && /^\d+$/.test(tokens[j + 2] ?? "")) {
        const last = parseInt(tokens[j + 2], 10);
        for (let n = first; n <= last; n++) ids.push(n);
        j += 3;
      } else {
        ids.push(first);
        j++;
      }
    }
    return { ids, next: j };
  }

  // ---- block detection ----

  /** True if a line looks like the start of a new top-level STAAD block. */
  private isBlockHeader(line: string): boolean {
    const head = this.firstToken(line).toUpperCase();
    switch (head) {
      case "JOINT":
      case "MEMBER":
      case "ELEMENT":
      case "SUPPORT":
      case "SUPPORTS":
      case "LOAD":
      case "LOADING":
      case "FINISH":
      case "PERFORM":
      case "PRINT":
      case "PARAMETER":
      case "PARAM":
      case "CODE":
      case "CHECK":
      case "DEFINE":
      case "CONSTANT":
      case "CONSTANTS":
      case "UNIT":
      case "UNITS":
      case "START":
      case "END":
      case "STAAD":
      case "CHANGE":
      case "GROUP":
      case "MASTER":
      case "INACTIVE":
      case "RELOAD":
      case "JOINTLOAD":
      case "MEMBERLOAD":
      case "ELEMENTLOAD":
        return true;
      default:
        return false;
    }
  }

  /**
   * Whether a line ends the current load case (a new `LOAD`/`LOAD COMB`, an
   * analysis/design command, or `FINISH`). Crucially, load *sub-commands*
   * (`SELFWEIGHT`, `JOINT LOAD`, `MEMBER LOAD`) do NOT end the case — they're
   * part of it. This is the load-aware counterpart to isBlockHeader.
   */
  private isLoadCaseEnd(line: string): boolean {
    const head = this.firstToken(line).toUpperCase();
    // A bare LOAD starts a new case; LOAD COMB starts a combination.
    if (head === "LOAD" || head === "LOADING") return true;
    // Analysis / design / metadata blocks end the load section.
    switch (head) {
      case "FINISH":
      case "PERFORM":
      case "PRINT":
      case "PARAMETER":
      case "PARAM":
      case "CODE":
      case "CHECK":
      case "CHANGE":
      case "GROUP":
      case "MASTER":
      case "INACTIVE":
      case "RELOAD":
      case "END":
      case "STAAD":
        return true;
      default:
        return false;
    }
  }

  /** True for a load-case sub-block header (`SELFWEIGHT`/`JOINT LOAD`/`MEMBER LOAD`). */
  private isLoadSubHeader(line: string): boolean {
    const head = this.firstToken(line).toUpperCase();
    if (head === "SELFWEIGHT") return true;
    if (head === "JOINT" && this.secondToken(line) === "LOAD") return true;
    if (head === "MEMBER" && this.secondToken(line) === "LOAD") return true;
    if (head === "ELEMENT" && this.secondToken(line) === "LOAD") return true;
    return false;
  }

  // ---- define material ----

  /**
   * Parse a DEFINE MATERIAL block. Already past the "DEFINE" header.
   * Reads until "END DEFINE MATERIAL" (or END). Stores material name → type.
   */
  private parseDefineMaterial(): void {
    // The current line should be "...MATERIAL START" or similar.
    // Walk until END DEFINE MATERIAL.
    let currentName = "";
    while (this.i < this.lines.length) {
      const line = this.lines[this.i];
      const head = this.firstToken(line).toUpperCase();
      // END DEFINE MATERIAL (or just END) terminates the block.
      if (head === "END") { this.i++; break; }
      // ISOTROPIC <Name> → start a new material definition.
      if (head === "ISOTROPIC") {
        currentName = line.trim().slice(9).trim(); // after "ISOTROPIC"
        this.i++;
        continue;
      }
      // TYPE <type> gives the concrete type name (CONCRETE, STEEL).
      if (head === "TYPE" && currentName) {
        const typeName = line.trim().slice(4).trim().toUpperCase();
        if (typeName === "CONCRETE") this.materialDefs.set(currentName, "concrete");
        else if (typeName === "STEEL") this.materialDefs.set(currentName, "steel");
        this.i++;
        continue;
      }
      // STRENGTH <type> <value> — extract grade (FCU for concrete, FY/FU for steel)
      if (head === "STRENGTH" && currentName) {
        const parts = line.trim().slice(8).trim().split(/\s+/);
        const gradeTok = (parts[0] ?? "").toUpperCase();
        const val = parseFloat(parts[1] ?? "");
        if (Number.isFinite(val)) {
          const mpa = Math.round(val / 1000);
          if (gradeTok === "FCU") {
            this.materialGradeDefs.set(currentName, "C" + mpa);
          } else if (gradeTok === "FY") {
            const g = mpa >= 355 ? "S355" : mpa >= 275 ? "S275" : mpa >= 235 ? "S235" : "S" + mpa;
            this.materialGradeDefs.set(currentName, g);
          }
        }
        this.i++;
        continue;
      }
      // If we have a name but no TYPE line yet, infer from name.
      if (currentName && line.trim() !== "" && /^[A-Z]/.test(head) && head !== "E" && head !== "POISSON" && head !== "DENSITY" && head !== "ALPHA" && head !== "DAMP" && head !== "BETA") {
        // Not a property line — might be something else; skip.
        this.i++;
        continue;
      }
      this.i++;
    }
    // Infer material type from name if TYPE wasn't explicitly given.
    for (const [name, type] of this.materialDefs) {
      if (type) continue; // already set
      const u = name.toUpperCase();
      if (u.includes("CONCRETE") || u.includes("CONC")) {
        this.materialDefs.set(name, "concrete");
      } else if (u.includes("STEEL") || u.includes("STL")) {
        this.materialDefs.set(name, "steel");
      }
    }
  }

  // ---- member property ----

  /**
   * Parse MEMBER PROPERTY block. Already past the "MEMBER PROPERTY" header.
   * Lines: `<member-list> <shape> <params>`
   * Shapes: TABLE ST <profile>, PRIS YD <n> ZD <n>, etc.
   */
  private parseMemberProperty(): void {
    while (this.i < this.lines.length && !this.isBlockHeader(this.lines[this.i])) {
      const line = this.lines[this.i];
      let tokens = line.trim().split(/\s+/);
      // Skip optional "MEMBER <tag>" prefix (e.g. "MEMBER COLUMN 1 2 3...").
      let k = 0;
      if ((tokens[k] ?? "").toUpperCase() === "MEMBER") {
        k++;
        const tagWord = (tokens[k] ?? "").toUpperCase();
        if (tagWord === "SEC" || tagWord === "SIDE") {
          k++;
          if ((tokens[k] ?? "").toUpperCase() === "BEAM") k++;
        } else if (tagWord === "STUBCOLUMN") {
          k++;
        } else {
          k++;
        }
        tokens = tokens.slice(k);
        k = 0;
      }
      const consumed = this.readIdListFrom(tokens, k);
      const ids = consumed.ids;
      k = consumed.next;
      if (ids.length === 0) { this.i++; continue; }

      const shapeTok = (tokens[k] ?? "").toUpperCase();
      if (shapeTok === "TABLE" && (tokens[k + 1] ?? "").toUpperCase() === "ST") {
        for (const id of ids) this.memberSectionMap.set(id, "i_beam");
      } else if (shapeTok === "PRIS") {
        for (const id of ids) this.memberSectionMap.set(id, "rectangular");
      } else if (shapeTok === "TAPERED") {
        for (const id of ids) this.memberSectionMap.set(id, "i_beam");
      } else if (shapeTok === "TUBE" || shapeTok === "PIPE") {
        for (const id of ids) this.memberSectionMap.set(id, "hss_round");
      } else if (shapeTok === "CHANNEL" || shapeTok === "C") {
        for (const id of ids) this.memberSectionMap.set(id, "channel");
      } else if (shapeTok === "ANGLE" || shapeTok === "L") {
        for (const id of ids) this.memberSectionMap.set(id, "angle");
      }
      this.i++;
    }
  }

  // ---- start block (group definition) ----

  private parseStartBlock(): void {
    while (this.i < this.lines.length) {
      const line = this.lines[this.i];
      const head = this.firstToken(line).toUpperCase();
      if (head === "END") { this.i++; break; }
      if (head !== "MEMBER") { this.i++; continue; }
      const rest = line.trim().slice(6).trim();
      const tagMatch = rest.match(/^(COLUMN|RAFTER|BEAM|BRACING|STUBCOLUMN|TRUSS|SIDE|SEC|CABLE)\b/i);
      if (!tagMatch) { this.i++; continue; }
      const tagWord = tagMatch[1].toUpperCase();
      let idText = rest.slice(tagMatch[0].length).trim();
      if (/^BEAM\b/i.test(idText)) idText = idText.slice(4).trim();
      const tag =
        tagWord === "COLUMN" || tagWord === "STUBCOLUMN" ? "column" as MemberTag :
        tagWord === "RAFTER" ? "rafter" as MemberTag :
        tagWord === "TRUSS" ? "truss" as MemberTag :
        tagWord === "BRACING" ? "brace" as MemberTag :
        tagWord === "CABLE" ? "cable" as MemberTag :
        "beam" as MemberTag;
      const consumed = this.readIdListFrom(idText.split(/\s+/), 0);
      for (const id of consumed.ids) this.memberTagMap.set(id, tag);
      this.i++;
    }
  }

  // ---- member release ----

  private parseMemberRelease(): void {
    while (this.i < this.lines.length && !this.isBlockHeader(this.lines[this.i])) {
      const tokens = this.lines[this.i].trim().split(/\s+/);
      let k = 0;
      const consumed = this.readIdListFrom(tokens, k);
      const ids = consumed.ids;
      k = consumed.next;
      if (ids.length === 0) { this.i++; continue; }

      // Scan for START <dofs> and/or END <dofs> specs on this line.
      let startRelease = memberEndReleaseFixed();
      let endRelease = memberEndReleaseFixed();
      let hasStart = false;
      let hasEnd = false;

      while (k < tokens.length) {
        const kw = (tokens[k] ?? "").toUpperCase();
        if (kw !== "START" && kw !== "END") { k++; continue; }
        k++; // move past START/END

        // Collect DOFs until next keyword or end of tokens.
        const dofs: string[] = [];
        while (k < tokens.length) {
          const tok = (tokens[k] ?? "").toUpperCase();
          if (tok === "START" || tok === "END") break;
          if (tok === "MX" || tok === "MY" || tok === "MZ") dofs.push(tokens[k]);
          k++;
        }

        if (kw === "START") {
          startRelease = dofs.length > 0 ? memberEndReleaseFromDofs(dofs) : memberEndReleasePinned();
          hasStart = true;
        } else {
          endRelease = dofs.length > 0 ? memberEndReleaseFromDofs(dofs) : memberEndReleasePinned();
          hasEnd = true;
        }
      }

      if (hasStart || hasEnd) {
        for (const id of ids) {
          const cur = this.memberReleaseMap.get(id) ?? { start: memberEndReleaseFixed(), end: memberEndReleaseFixed() };
          if (hasStart) cur.start = startRelease;
          if (hasEnd) cur.end = endRelease;
          this.memberReleaseMap.set(id, { start: cur.start, end: cur.end });
        }
      }
      this.i++;
    }
  }

  // ---- member truss ----

  private parseMemberTruss(): void {
    while (this.i < this.lines.length && !this.isBlockHeader(this.lines[this.i])) {
      const tokens = this.lines[this.i].trim().split(/\s+/);
      const consumed = this.readIdListFrom(tokens, 0);
      for (const id of consumed.ids) this.memberTagMap.set(id, "truss" as MemberTag);
      this.i++;
    }
  }

  private parseConstants(): void {
    while (this.i < this.lines.length && !this.isBlockHeader(this.lines[this.i])) {
      const line = this.lines[this.i];
      const tokens = line.trim().split(/\s+/);
      const head = (tokens[0] ?? "").toUpperCase();
      if (head === "MATERIAL") {
        const matName = (tokens[1] ?? "").toUpperCase();
        const type: MaterialType = matName === "CONCRETE" ? "concrete"
                    : matName === "STEEL" ? "steel"
                    : "other";
        const grade = this.materialGradeDefs.get(matName) ?? this.materialGradeDefs.get(tokens[1] ?? "");
        const rest = tokens.slice(2).join(" ");
        if (/^ALL$/i.test(rest)) {
          for (const m of this.members) {
          this.memberMaterialMap.set(m.id, type);
          if (grade) this.memberGradeMap.set(m.id, grade);
        }
        } else {
          const consumed = this.readIdListFrom(tokens, 2);
          for (const id of consumed.ids) {
            this.memberMaterialMap.set(id, type);
            if (grade) this.memberGradeMap.set(id, grade);
          }
        }
      } else if (head === "BETA") {
        const angle = parseFloat(tokens[1] ?? "");
        if (Number.isFinite(angle) && (tokens[2] ?? "").toUpperCase() === "MEMB") {
          const consumed = this.readIdListFrom(tokens, 3);
          for (const id of consumed.ids) this.memberBetaMap.set(id, angle);
        }
      }
      this.i++;
    }
  }

  // ---- snapshot assembly ----

  private toSnapshot(): ModelSnapshot {
    const nodes: BcadNode[] = this.joints.map((j) => {
      // Apply support fixity, if any, to this node.
      const sup = this.supports.find((s) => s.nodes.includes(j.id));
      return {
        id: j.id,
        label: `N${j.id}`,
        x: j.x,
        y: j.y,
        z: j.z,
        fixity: sup?.fixity,
      };
    });

    const members: BcadMember[] = this.members.map((m) => {
      const mat = this.memberMaterialMap.get(m.id);
      const sec = this.memberSectionMap.get(m.id);
      const tag = this.memberTagMap.get(m.id) ?? "none";
      const fixity = this.memberReleaseMap.get(m.id);
      const matGrade = this.memberGradeMap.get(m.id);
      const beta = this.memberBetaMap.get(m.id);
      return {
        id: m.id,
        label: `M${m.id}`,
        nodeAId: m.a,
        nodeBId: m.b,
        tag,
        material: mat,
        materialGrade: matGrade,
        section: sec,
        fixity,
        beta,
      };
    });

    const nextNodeId = nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
    const nextMemberId = members.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const nextLoadCaseId = this.loadCases.reduce((m, c) => Math.max(m, c.id), 0) + 1;
    const nextLoadComboId = this.loadCombos.reduce((m, c) => Math.max(m, c.id), 0) + 1;

    return {
      version: 1,
      nodes,
      members,
      nextNodeId,
      nextMemberId,
      loadCases: this.loadCases,
      loads: this.loads,
      loadCombos: this.loadCombos,
      nextLoadCaseId,
      nextLoadId: this.nextLoadId,
      nextLoadComboId,
      view: {
        projection: "3d",
        preset: "iso",
        draftPlane: "xy",
        planeOffset: 0,
        snapEnabled: true,
        snapSpacing: 1,
        showLabels: true,
        showGrid: true,
      },
    };
  }
}

/** Infer a bcad case type from the STAAD load-case label text. */
function inferCaseType(label: string): LoadCaseType {
  const u = label.toUpperCase();
  if (/\b(DEAD|DL|SDL|SELF|SW)\b/.test(u) || u.includes("DEAD")) return "dead";
  if (/\b(LIVE|LL|IL)\b/.test(u) || u.includes("LIVE")) return "live";
  if (/\b(WIND|WL)\b/.test(u) || u.includes("WIND")) return "wind";
  if (/\b(SNOW|SL)\b/.test(u) || u.includes("SNOW")) return "snow";
  if (/\b(QUAKE|SEISMIC|EL|QL)\b/.test(u) || u.includes("QUAKE")) return "quake";
  if (/\b(TEMP|THERMAL|TL)\b/.test(u) || u.includes("TEMP")) return "temperature";
  return "other";
}

// ---- writing ----

class StdWriter {
  constructor(private readonly model: Model) {}

  write(): string {
    const out: string[] = [];
    const title = "bcad model export";

    out.push(`STAAD SPACE ${title}`);
    out.push(`UNIT METER KN`);
    out.push(`*`);
    out.push(`* Generated by bcad — member sizing uses section/material`);
    out.push(`* from the model where available; analysis commands are NOT`);
    out.push(`* preserved. Finalize those in STAAD.`);
    out.push(`*`);

    this.writeJoints(out);
    this.writeMembers(out);
    this.writeMaterials(out);
    this.writeReleasesAndTrusses(out);
    this.writeSupports(out);
    this.writeLoads(out);
    this.writeCombos(out);

    out.push(`PERFORM ANALYSIS`);
    out.push(`FINISH`);
    return out.join("\n") + "\n";
  }

  /** Write MEMBER RELEASE + MEMBER TRUSS blocks. */
  private writeReleasesAndTrusses(out: string[]): void {
    const members = this.model.allMembers();
    if (members.length === 0) return;

    const trussIds: number[] = [];

    // Group members by release signature per end.
    // Key is the space-joined DOF list, e.g. "MX MY MZ" or "MZ".
    const startGroups = new Map<string, number[]>();
    const endGroups = new Map<string, number[]>();

    for (const m of members) {
      if (m.fixity) {
        const startDofs = memberEndReleaseToDofs(m.fixity.start);
        if (startDofs.length > 0) {
          const key = startDofs.join(" ");
          const arr = startGroups.get(key) ?? [];
          arr.push(m.id);
          startGroups.set(key, arr);
        }
        const endDofs = memberEndReleaseToDofs(m.fixity.end);
        if (endDofs.length > 0) {
          const key = endDofs.join(" ");
          const arr = endGroups.get(key) ?? [];
          arr.push(m.id);
          endGroups.set(key, arr);
        }
      }
      if (m.tag === "truss") trussIds.push(m.id);
    }

    const hasRelease = startGroups.size > 0 || endGroups.size > 0;
    if (hasRelease) {
      out.push("MEMBER RELEASE");
      // Emit END groups first, then START groups (conventional STAAD order).
      for (const [dofs, ids] of endGroups) {
        out.push(collapseRanges(ids).join(" ") + " END " + dofs);
      }
      for (const [dofs, ids] of startGroups) {
        out.push(collapseRanges(ids).join(" ") + " START " + dofs);
      }
    }

    if (trussIds.length > 0) {
      out.push("MEMBER TRUSS");
      out.push(collapseRanges(trussIds).join(" "));
    }
  }

private writeJoints(out: string[]): void {
    const nodes = this.model.allNodes();
    if (nodes.length === 0) return;
    out.push(`JOINT COORDINATES`);
    for (const n of nodes) {
      out.push(`${n.id} ${fmt(n.x)} ${fmt(n.y)} ${fmt(n.z)}`);
    }
  }

  private writeMembers(out: string[]): void {
    const members = this.model.allMembers();
    if (members.length === 0) return;
    out.push(`MEMBER INCIDENCES`);
    for (const m of members) {
      out.push(`${m.id} ${m.nodeAId} ${m.nodeBId}`);
    }
  }

  /** Write DEFINE MATERIAL + MEMBER PROPERTY + CONSTANTS from member data. */
  private writeMaterials(out: string[]): void {
    const members = this.model.allMembers();
    if (members.length === 0) return;

    const hasMaterial = members.some((m) => m.material);
    const hasSection = members.some((m) => m.section);
    if (!hasMaterial && !hasSection) return;

    // --- DEFINE MATERIAL ---
    const materialSet = new Set(members.map((m) => m.material).filter(Boolean));
    if (materialSet.size > 0) {
      for (const mat of materialSet) {
        const isConcrete = mat === "concrete";
        const name = isConcrete ? "CONCRETE" : mat === "steel" ? "STEEL" : "OTHER";
        const gradeKey = isConcrete ? "FCU" : "FY";
        // Collect unique grades for this material type
        const grades = new Set(members.filter((m) => m.material === mat && m.materialGrade).map((m) => m.materialGrade as string));
        if (grades.size > 0) {
          for (const g of grades) {
            out.push(`DEFINE MATERIAL START`);
            out.push(`ISOTROPIC ${name}_${g}`);
            out.push(`E 2.0e+08`);
            out.push(`POISSON 0.3`);
            out.push(`DENSITY 76.8`);
            out.push(`TYPE ${name}`);
            // Extract numeric value from grade for STRENGTH line
            const numMatch = g.match(/[A-Za-z]*([d.]+)/);
            if (numMatch) {
              const valKpa = Math.round(parseFloat(numMatch[1]) * 1000);
              out.push(`STRENGTH ${gradeKey} ${valKpa}`);
            }
            out.push(`END DEFINE MATERIAL`);
          }
        } else {
          out.push(`DEFINE MATERIAL START`);
          out.push(`ISOTROPIC ${name}`);
          out.push(`E 2.0e+08`);
          out.push(`POISSON 0.3`);
          out.push(`DENSITY 76.8`);
          out.push(`END DEFINE MATERIAL`);
        }
      }
    }

    // --- MEMBER PROPERTY ---
    if (hasSection) {
      const sectionBuckets = new Map<string, number[]>();
      const sectionToStaad: Record<string, string> = {
        rectangular: "PRIS YD 0.3 ZD 0.3",
        i_beam: "TABLE ST W200X27",
        hss_round: "PIPE OD 0.168 WT 0.007",
        hss_rect: "TUBE OD 0.15 WT 0.006",
        channel: "C CHANNEL",
        angle: "L ANGLE",
        circular: "PRIS YD 0.3 ZD 0.3",
        tee: "TEE",
        other: "PRIS YD 0.3 ZD 0.3",
      };
      for (const m of members) {
        if (!m.section) continue;
        const key = m.section;
        const arr = sectionBuckets.get(key) ?? [];
        arr.push(m.id);
        sectionBuckets.set(key, arr);
      }
      out.push(`MEMBER PROPERTY`);
      for (const [shape, ids] of sectionBuckets) {
        const list = collapseRanges(ids).join(" ");
        const staadProp = sectionToStaad[shape] ?? "PRIS YD 0.3 ZD 0.3";
        out.push(`${list} ${staadProp}`);
      }
    }

    // --- CONSTANTS ---
    if (hasMaterial) {
      const matBuckets = new Map<string, number[]>();
      const gradeBuckets = new Map<string, number[]>();
      for (const m of members) {
        if (!m.material) continue;
        const name = m.material.toUpperCase();
        const arr = matBuckets.get(name) ?? [];
        arr.push(m.id);
        matBuckets.set(name, arr);
        if (m.materialGrade) {
          const gkey = name + "_" + m.materialGrade;
          const garr = gradeBuckets.get(gkey) ?? [];
          garr.push(m.id);
          gradeBuckets.set(gkey, garr);
        }
      }
      const hasBetaMembers = members.some((m) => m.beta != null);
      if (matBuckets.size > 0 || hasBetaMembers) {
        out.push(`CONSTANTS`);
      }
      // Use grade-specific material names if grades exist
      if (gradeBuckets.size > 0) {
        for (const [gkey, ids] of gradeBuckets) {
          const parts = gkey.split("_");
          const matName = parts[0];
          const grade = parts.slice(1).join("_");
          const list = collapseRanges(ids).join(" ");
          out.push(`MATERIAL ${matName}_${grade} MEMB ${list}`);
        }
      } else {
        for (const [name, ids] of matBuckets) {
          const list = collapseRanges(ids).join(" ");
          out.push(`MATERIAL ${name} MEMB ${list}`);
        }
      }
      // Write BETA grouped by angle
      const betaBuckets = new Map<number, number[]>();
      for (const m of members) {
        if (m.beta == null) continue;
        const arr = betaBuckets.get(m.beta) ?? [];
        arr.push(m.id);
        betaBuckets.set(m.beta, arr);
      }
      for (const [angle, ids] of betaBuckets) {
        const list = collapseRanges(ids).join(" ");
        out.push(`BETA ${angle} MEMB ${list}`);
      }
    }
  }

  /** Group nodes by fixity, then emit one line per group. */
  private writeSupports(out: string[]): void {
    const nodes = this.model.allNodes().filter((n) => n.fixity);
    if (nodes.length === 0) return;
    out.push(`SUPPORTS`);

    // Bucket by a fixity signature string.
    const buckets = new Map<string, number[]>();
    for (const n of nodes) {
      const sig = fixitySig(n.fixity!);
      const arr = buckets.get(sig) ?? [];
      arr.push(n.id);
      buckets.set(sig, arr);
    }
    for (const [sig, ids] of buckets) {
      const list = collapseRanges(ids).join(" ");
      out.push(`${list} ${fixityToStaad(sig)}`);
    }
  }

  private writeLoads(out: string[]): void {
    const cases = this.model.allLoadCases();
    const loads = this.model.allLoads();
    if (cases.length === 0 && loads.length === 0) return;

    for (const lc of cases) {
      const caseLoads = loads.filter((l) => l.caseId === lc.id);
      out.push(`LOAD ${lc.id} ${lc.label}`);

      // Nodal loads.
      const nodal = caseLoads.filter((l) => l.kind === "nodal");
      if (nodal.length) {
        out.push(`JOINT LOAD`);
        for (const l of nodal as Extract<BcadLoad, { kind: "nodal" }>[]) {
          const parts: string[] = [];
          if (l.fx !== 0) parts.push(`FX ${fmt(l.fx)}`);
          if (l.fy !== 0) parts.push(`FY ${fmt(l.fy)}`);
          if (l.fz !== 0) parts.push(`FZ ${fmt(l.fz)}`);
          if (l.mx !== 0) parts.push(`MX ${fmt(l.mx)}`);
          if (l.my !== 0) parts.push(`MY ${fmt(l.my)}`);
          if (l.mz !== 0) parts.push(`MZ ${fmt(l.mz)}`);
          if (parts.length) out.push(`${l.nodeId} ${parts.join(" ")}`);
        }
      }

      // Distributed + point member loads.
      const distLoads = caseLoads.filter((l) => l.kind === "member_distributed");
      if (distLoads.length) {
        // Group by (axis, direction, wa, wb, da, db) so members with same params share one line.
        const groups = new Map<string, number[]>();
        for (const l of distLoads as Extract<BcadLoad, { kind: "member_distributed" }>[]) {
          const key = (l.direction === "global" ? "G" : "") + l.axis.toUpperCase() + "|" + fmt(l.wa) + "|" + fmt(l.wb) + "|" + fmt(l.da) + "|" + fmt(l.db);
          const arr = groups.get(key) ?? [];
          arr.push(l.memberId);
          groups.set(key, arr);
        }
        out.push(`MEMBER LOAD`);
        for (const [key, ids] of groups) {
          const parts = key.split("|");
          const dir = parts[0];
          const wa = parseFloat(parts[1]);
          const wb = parseFloat(parts[2]);
          const da = parseFloat(parts[3]);
          const db = parseFloat(parts[4]);
          const list = collapseRanges(ids).join(" ");
          if (wa === wb) {
            // Uniform: UNI syntax
            out.push(`${list} UNI ${dir} ${fmt(wa)}`);
          } else if (da === 0 && db === 1) {
            // Full-length varying: LIN syntax
            out.push(`${list} LIN ${dir} ${fmt(wa)} ${fmt(wb)}`);
          } else {
            // Partial trapezoidal: TRAP syntax
            out.push(`${list} TRAP ${dir} ${fmt(wa)} ${fmt(wb)} ${fmt(da)} ${fmt(db)}`);
          }
        }
      }
      const ptLoads = caseLoads.filter((l) => l.kind === "member_point");
      if (ptLoads.length) {
        if (!distLoads.length) out.push(`MEMBER LOAD`);
        for (const l of ptLoads as Extract<BcadLoad, { kind: "member_point" }>[]) {
          const dir = (l.direction === "global" ? "G" : "") + this.pointAxis(l);
          out.push(`${l.memberId} CON ${dir} ${fmt(this.pointMag(l))} ${fmt(l.dist)}`);
        }
      }
    }
  }

  private pointAxis(l: Extract<BcadLoad, { kind: "member_point" }>): string {
    if (l.fx !== 0) return "X";
    if (l.fz !== 0) return "Z";
    return "Y";
  }
  private pointMag(l: Extract<BcadLoad, { kind: "member_point" }>): number {
    return l.fx !== 0 ? l.fx : l.fz !== 0 ? l.fz : l.fy;
  }

  private writeCombos(out: string[]): void {
    const combos = this.model.allLoadCombos();
    for (const c of combos) {
      out.push(`LOAD COMB ${c.id} ${c.label}`);
      const terms = c.factors.map((f) => `${f.caseId} ${fmt(f.factor)}`).join(" ");
      out.push(terms || `* (empty combination)`);
    }
  }
}

/** Stable signature for a NodeFixity so equal fixities bucket together. */
function fixitySig(f: NodeFixity): string {
  return `${f.tx}|${f.ty}|${f.tz}|${f.rx}|${f.ry}|${f.rz}`;
}

/** Convert a fixity signature back to a STAAD support spec. */
function fixityToStaad(sig: string): string {
  const [tx, ty, tz, rx, ry, rz] = sig.split("|");
  const allFixed = [tx, ty, tz, rx, ry, rz].every((d) => d === "fixed");
  const allButRotFree =
    tx === "fixed" && ty === "fixed" && tz === "fixed" &&
    rx === "free" && ry === "free" && rz === "free";
  if (allFixed) return "FIXED";
  if (allButRotFree) return "PINNED";
  // Partial: emit FIXED BUT <free-dofs>.
  const free: string[] = [];
  if (tx === "free") free.push("FX");
  if (ty === "free") free.push("FY");
  if (tz === "free") free.push("FZ");
  if (rx === "free") free.push("MX");
  if (ry === "free") free.push("MY");
  if (rz === "free") free.push("MZ");
  return free.length ? `FIXED BUT ${free.join(" ")}` : "FIXED";
}

/** Collapse a sorted id list into `TO` ranges where 3+ ids are contiguous. */
function collapseRanges(ids: number[]): string[] {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    const span = j - i; // 0 = single, 1 = pair, 2+ = range
    if (span >= 2) {
      out.push(`${sorted[i]} TO ${sorted[j]}`);
    } else {
      // Singles or pairs: emit each id individually (simple + always valid).
      for (let k = i; k <= j; k++) out.push(`${sorted[k]}`);
    }
    i = j + 1;
  }
  return out;
}

/** Trim to 6 significant digits, dropping trailing zeros (matches CSV writer). */
function fmt(n: number): string {
  return parseFloat(n.toFixed(6)).toString();
}
