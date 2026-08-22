/**
 * AUTO Box 3 Built — no manual wire-sprint feed required for new guards.
 *
 * Sources (union, deduped):
 *  1. docs/specs/scoreboard/wire-sprint-built.json (legacy manual feed)
 *  2. @matrix-built tags in scripts/verify-*.mjs headers (preferred for new merges):
 *     - JSON:  @matrix-built { "modules":[…], "cols":[…], "leaves":["exact.leaf"], "task":"…" }
 *       (`leafRe` remains supported for anchored legacy family claims.)
 *     - shorthand: @matrix-built modules=a,b cols=x,y leafRe=^foo$ task=NAME
 *     - csv-only: @matrix-built maintenance,fleet  (cols default connectivity,reverse_link)
 *
 * Built greens when the guard file exists on the deployed SHA (request-time read).
 * Live (Box 4) is Cascade PROD-VERIFIED ledger only — merges never auto-green Live.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type WireSprintBuiltEntry = {
  task: string;
  pr?: string;
  guard: string;
  modules: string[];
  cols: string[];
  leafRe: string;
  source?: string;
};

const MATRIX_BUILT_JSON_RE = /@matrix-built\s+(\{[\s\S]*?\})/g;
/** Codex/Cursor shorthand: @matrix-built modules=a,b cols=x,y leafRe=^foo$ task=NAME */
const MATRIX_BUILT_SHORTHAND_RE =
  /@matrix-built\s+modules=([^\s]+)(?:\s+cols=([^\s]+))?(?:\s+leafRe=([^\s]+))?(?:\s+task=([^\s]+))?(?:\s+pr=([^\s]+))?/g;
/** Bare module list: @matrix-built maintenance,fleet (no modules= / no JSON). */
const MATRIX_BUILT_CSV_RE =
  /@matrix-built\s+(?!modules=|\{)([a-z][a-z0-9_-]*(?:,[a-z][a-z0-9_-]*)+)(?=\s|\*|\/|$)/gi;

function exactLeavesToRegex(leaves: unknown): string | null {
  if (!Array.isArray(leaves) || !leaves.length || leaves.some((leaf) => typeof leaf !== "string" || !leaf.trim())) return null;
  const escaped = leaves.map((leaf) => leaf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escaped.length === 1 ? `^${escaped[0]}$` : `^(?:${escaped.join("|")})$`;
}

function readJson<T>(abs: string): T | null {
  try {
    return JSON.parse(readFileSync(abs, "utf8")) as T;
  } catch {
    return null;
  }
}

function resolveGuardScript(root: string, guardRel: string): string | null {
  const direct = path.join(root, guardRel);
  if (guardRel.endsWith(".mjs") && existsSync(direct) && !guardRel.includes("verify-steps/")) {
    return guardRel.replace(/\\/g, "/");
  }
  if (guardRel.includes("verify-steps/")) {
    const stepAbs = path.join(root, guardRel);
    if (!existsSync(stepAbs)) return null;
    const stepSrc = readFileSync(stepAbs, "utf8");
    const runMatch = stepSrc.match(
      /ctx\.run\(\s*["']node["']\s*,\s*\[\s*["'](scripts\/verify-[^"']+\.mjs)["']/,
    );
    if (runMatch && existsSync(path.join(root, runMatch[1]!))) return runMatch[1]!;
    const m = stepSrc.match(/["'](scripts\/verify-[^"']+\.mjs)["']/);
    if (m && existsSync(path.join(root, m[1]!))) return m[1]!;
    return null;
  }
  if (existsSync(direct)) return guardRel.replace(/\\/g, "/");
  return null;
}

function entryKey(e: WireSprintBuiltEntry): string {
  return `${e.guard}|${e.modules.join(",")}|${e.cols.join(",")}|${e.leafRe}`;
}

/** Exported for verify-matrix-built-tag-present selftest (parse parity). */
export function parseMatrixBuiltTags(guardRel: string, content: string): WireSprintBuiltEntry[] {
  const out: WireSprintBuiltEntry[] = [];
  for (const m of content.matchAll(MATRIX_BUILT_JSON_RE)) {
    try {
      const j = JSON.parse(m[1]!) as Partial<WireSprintBuiltEntry> & { leaves?: unknown };
      const leafRe = j.leafRe || exactLeavesToRegex(j.leaves);
      if (!j.modules?.length || !j.cols?.length || !leafRe) continue;
      out.push({
        task: String(j.task ?? path.basename(guardRel, ".mjs")),
        pr: j.pr,
        guard: guardRel,
        modules: j.modules,
        cols: j.cols,
        leafRe,
        source: "@matrix-built",
      });
    } catch {
      /* skip malformed tag */
    }
  }
  // SCOREBOARD-MATRIX-BUILT-SHORTHAND — Codex ships `modules=a,b cols=x,y` (no JSON). Ignoring
  // those tags left Built cells stuck unaudited after merge+deploy (measured: 8+ verify-*.mjs).
  for (const m of content.matchAll(MATRIX_BUILT_SHORTHAND_RE)) {
    const modules = String(m[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cols = String(m[2] ?? "connectivity,reverse_link")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!modules.length || !cols.length) continue;
    out.push({
      task: String(m[4] ?? path.basename(guardRel, ".mjs")),
      pr: m[5],
      guard: guardRel,
      modules,
      cols,
      leafRe: String(m[3] ?? ".*"),
      source: "@matrix-built",
    });
  }
  for (const m of content.matchAll(MATRIX_BUILT_CSV_RE)) {
    const modules = String(m[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (modules.length < 2) continue;
    out.push({
      task: path.basename(guardRel, ".mjs"),
      guard: guardRel,
      modules,
      cols: ["connectivity", "reverse_link"],
      leafRe: ".*",
      source: "@matrix-built",
    });
  }
  return out;
}

function guardFileOk(root: string, guardRel: string): boolean {
  const guardAbs = path.join(root, guardRel);
  if (existsSync(guardAbs)) return true;
  const resolved = resolveGuardScript(root, guardRel);
  return resolved != null && existsSync(path.join(root, resolved));
}

function loadManualFeed(root: string): WireSprintBuiltEntry[] {
  const j = readJson<{ entries?: WireSprintBuiltEntry[] }>(
    path.join(root, "docs/specs/scoreboard/wire-sprint-built.json"),
  );
  const entries: WireSprintBuiltEntry[] = [];
  for (const raw of j?.entries ?? []) {
    const guardField = String(raw.guard ?? "").trim();
    let guard = resolveGuardScript(root, guardField);
    if (!guard && existsSync(path.join(root, guardField))) {
      guard = guardField.replace(/\\/g, "/");
    }
    if (!guard || !guardFileOk(root, guard)) continue;
    entries.push({
      task: String(raw.task ?? "?"),
      pr: raw.pr,
      guard,
      modules: raw.modules ?? [],
      cols: raw.cols ?? [],
      leafRe: String(raw.leafRe ?? "^$"),
      source: "wire-sprint-built.json",
    });
  }
  return entries;
}

function scanGuardTags(root: string): WireSprintBuiltEntry[] {
  const scriptsDir = path.join(root, "scripts");
  const out: WireSprintBuiltEntry[] = [];
  for (const name of readdirSync(scriptsDir)) {
    if (!name.startsWith("verify-") || !name.endsWith(".mjs")) continue;
    const guardRel = `scripts/${name}`;
    const abs = path.join(scriptsDir, name);
    out.push(...parseMatrixBuiltTags(guardRel, readFileSync(abs, "utf8")));
  }
  return out;
}

/**
 * LINK-THEATER-01 root cause: a Built entry whose leafRe trivially matches every leaf id
 * (".*", "^.*$", ".+", "^.+$", or "" — which `new RegExp("")` also matches everywhere) let one
 * PR credit Box 3 Built for an entire column across every leaf in every listed module without
 * proving a single leaf. Measured live 2026-08-13: 8 wire-sprint-built.json entries + 18
 * `@matrix-built` script tags (ap_bill/load/trailer/unit/vendor/customer/driver/connectivity)
 * did exactly this — same shape verify-reverse-link-built-tags-strict already forbade for
 * reverse_link alone. Fixed at the single shared choke point both the live API (discoverMatrixBuiltEntries)
 * and scripts/verify-matrix-built-leaf-specific.mjs read, so the fix lands on every column and every
 * future @matrix-built tag, not just the ones caught this pass.
 * MUST stay in sync with the copy in scripts/verify-matrix-built-leaf-specific.mjs (plain guard
 * scripts run standalone via `node`, not through the TS build, so the check is duplicated there —
 * same pattern as classifyCell()/classCellFor() elsewhere in this file's neighbours).
 */
/** HONEST-BUILT-LAUNCH-LAW 2026-08-14 — lockstep with scripts/verify-matrix-built-leaf-specific.mjs */
export function isLeafSpecific(leafRe: string): boolean {
  const trimmed = (leafRe ?? "").trim();
  if (!trimmed) return false;
  if (/^\^?\.[*+]\$?$/.test(trimmed)) return false;
  if (/\|\.\*/.test(trimmed) || /\.\*\|/.test(trimmed)) return false;
  if (/\.\*\([^)]*(?:create|modal|drawer|wizard|picker)[^)]*\)/i.test(trimmed)) return false;
  if (/^\.\*.*\.\*$/.test(trimmed) && !/^\^\(/.test(trimmed)) return false;
  return true;
}

let cached: { root: string; atMs: number; entries: WireSprintBuiltEntry[] } | null = null;
const CACHE_MS = 3_000;

/** All Built entries for the deployed tree — refreshes on cache TTL (API poll). */
export function discoverMatrixBuiltEntries(root: string): WireSprintBuiltEntry[] {
  const now = Date.now();
  if (cached && cached.root === root && now - cached.atMs < CACHE_MS) {
    return cached.entries;
  }
  const byKey = new Map<string, WireSprintBuiltEntry>();
  for (const e of [...loadManualFeed(root), ...scanGuardTags(root)]) {
    if (!guardFileOk(root, e.guard)) continue;
    if (!isLeafSpecific(e.leafRe)) continue;
    byKey.set(entryKey(e), e);
  }
  cached = { root, atMs: now, entries: [...byKey.values()] };
  return cached.entries;
}

export function wireSprintBuiltReasonFromEntries(
  entries: WireSprintBuiltEntry[],
  leafId: string,
  colId: string,
  moduleId: string,
  root: string,
): string | undefined {
  for (const entry of entries) {
    if (!entry.modules.includes(moduleId)) continue;
    if (!entry.cols.includes(colId)) continue;
    if (!new RegExp(entry.leafRe).test(leafId)) continue;
    if (!guardFileOk(root, entry.guard)) continue;
    const src = entry.source === "@matrix-built" ? "auto" : "feed";
    return `${entry.task}${entry.pr ? ` ${entry.pr}` : ""} · ${path.basename(entry.guard)} (${src})`;
  }
  return undefined;
}
