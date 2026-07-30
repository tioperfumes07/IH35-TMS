#!/usr/bin/env node
/**
 * git-merge-catalog-picker-registry.mjs — keep-all union for catalogPickerRegistry.ts
 *
 * WHY
 * ---
 * Every LST-PICKER-01 slice adds ONE entry to CATALOG_PICKER_CONFIGS in the same shared file.
 * Whichever PR merges first conflicts EVERY other open picker PR on catalogPickerRegistry.ts —
 * the same treadmill .gitattributes already kills for CLAIMED-NUMBERS / package.json / held-mig.
 *
 * Correct merge: keep EVERY catalog key from both sides. On same-key collision, prefer THEIRS
 * (incoming) so a feature rebase onto main overlays its entry while preserving siblings from main.
 *
 * GIT CONTRACT
 * ------------
 * merge.catalog-picker-union.driver = node scripts/git-merge-catalog-picker-registry.mjs %O %A %B %P
 * Exit 0 = clean; non-zero = leave a real conflict.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const [, , ancestorFile, oursFile, theirsFile, pathname = "(unknown)"] = process.argv;

const START = "export const CATALOG_PICKER_CONFIGS = {";

/**
 * Split the configs object body into { key, block } where block includes leading comments
 * and the full top-level entry (2-space indent key). Supports both `key: {` and `key: catalogEntry({`.
 * @param {string} body
 * @returns {{ key: string, block: string }[]}
 */
function parseEntries(body) {
  const lines = body.replace(/^\n/, "").split("\n");
  /** @type {{ key: string, block: string }[]} */
  const entries = [];
  let i = 0;
  while (i < lines.length) {
    const preceding = [];
    while (i < lines.length) {
      const line = lines[i];
      if (/^  [a-zA-Z_][a-zA-Z0-9_]*: /.test(line)) break;
      if (line === "" || /^\s*\/\//.test(line) || /^\s*\/\*/.test(line) || /^\s*\*/.test(line)) {
        preceding.push(line);
        i++;
        continue;
      }
      preceding.push(line);
      i++;
    }
    if (i >= lines.length) break;
    const keyMatch = lines[i].match(/^  ([a-zA-Z_][a-zA-Z0-9_]*): /);
    if (!keyMatch) break;
    const key = keyMatch[1];
    const chunk = [...preceding, lines[i]];
    let depth = 0;
    for (const ch of lines[i]) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    i++;
    while (i < lines.length && depth > 0) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      chunk.push(line);
      i++;
    }
    entries.push({ key, block: chunk.join("\n") });
  }
  return entries;
}

/**
 * @param {string} src
 */
function splitFile(src) {
  const startIdx = src.indexOf(START);
  if (startIdx < 0) throw new Error("CATALOG_PICKER_CONFIGS start not found");
  const afterStart = startIdx + START.length;
  // Close is `} as const satisfies …` (not a bare `};`) — locate the top-level closing brace.
  const closeRe = /\n\} as const satisfies Record<string, CatalogPickerConfig>;/;
  const closeMatch = src.slice(afterStart).match(closeRe);
  if (!closeMatch || closeMatch.index == null) {
    // Fallback for older snapshots / selftest fixtures that still end with `};`
    const legacy = src.slice(afterStart).match(/\n\};(\n)/);
    if (!legacy || legacy.index == null) throw new Error("CATALOG_PICKER_CONFIGS close not found");
    const prefix = src.slice(0, afterStart);
    const body = src.slice(afterStart, afterStart + legacy.index);
    const suffix = src.slice(afterStart + legacy.index);
    return { prefix, body, suffix };
  }
  const prefix = src.slice(0, afterStart);
  const body = src.slice(afterStart, afterStart + closeMatch.index);
  const suffix = src.slice(afterStart + closeMatch.index);
  return { prefix, body, suffix };
}

/**
 * @param {string} oursSrc
 * @param {string} theirsSrc
 */
export function mergeCatalogPickerRegistry(oursSrc, theirsSrc) {
  const ours = splitFile(oursSrc);
  const theirs = splitFile(theirsSrc);
  const byKey = new Map();
  for (const e of parseEntries(ours.body.replace(/^\n/, ""))) {
    byKey.set(e.key, e.block);
  }
  for (const e of parseEntries(theirs.body.replace(/^\n/, ""))) {
    byKey.set(e.key, e.block); // theirs wins on collision
  }
  // Stable-ish order: ours keys first (main), then any new theirs-only keys in theirs order
  const oursOrder = parseEntries(ours.body.replace(/^\n/, "")).map((e) => e.key);
  const theirsOrder = parseEntries(theirs.body.replace(/^\n/, "")).map((e) => e.key);
  const ordered = [];
  const seen = new Set();
  for (const k of oursOrder) {
    if (byKey.has(k) && !seen.has(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  for (const k of theirsOrder) {
    if (byKey.has(k) && !seen.has(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  const body = "\n" + ordered.map((k) => byKey.get(k)).join("\n\n") + "\n";
  return ours.prefix + body + ours.suffix;
}

function selftest() {
  const ours = `export const CATALOG_PICKER_CONFIGS = {
  vendor: {
    key: "vendor",
  },
  civil_fine_type: catalogEntry({
    key: "civil_fine_type",
  }),
};

export type CatalogPickerKey = keyof typeof CATALOG_PICKER_CONFIGS;
`;
  const theirs = `export const CATALOG_PICKER_CONFIGS = {
  vendor: {
    key: "vendor",
  },
  cargo_claim_reason: {
    key: "cargo_claim_reason",
    create: async () => ({ id: "1", label: "x", code: "x" }),
  },
};

export type CatalogPickerKey = keyof typeof CATALOG_PICKER_CONFIGS;
`;
  const out = mergeCatalogPickerRegistry(ours, theirs);
  if (!out.includes("civil_fine_type:")) throw new Error("lost ours-only key");
  if (!out.includes("cargo_claim_reason:")) throw new Error("lost theirs-only key");
  if (!out.includes('key: "vendor"')) throw new Error("lost shared key");
  if ((out.match(/export const CATALOG_PICKER_CONFIGS/g) || []).length !== 1) {
    throw new Error("duplicated export");
  }
  console.log("git-merge-catalog-picker-registry SELFTEST OK");
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain && process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (isMain) {
  try {
    const oursSrc = fs.readFileSync(oursFile, "utf8");
    const theirsSrc = fs.readFileSync(theirsFile, "utf8");
    if (oursSrc.includes("<<<<<<<") || theirsSrc.includes("<<<<<<<")) {
      throw new Error("input already has conflict markers");
    }
    const merged = mergeCatalogPickerRegistry(oursSrc, theirsSrc);
    if (merged.includes("<<<<<<<")) throw new Error("merge produced markers");
    fs.writeFileSync(oursFile, merged);
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `git-merge-catalog-picker-registry: could not auto-union ${pathname} (${err.message}); leaving conflict.\n`
    );
    process.exit(1);
  }
}
