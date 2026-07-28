#!/usr/bin/env node
/**
 * verify-no-writes-to-legacy-fixed-assets-schema.mjs (Rule 07 / PR claim 1656)
 *
 * Legacy FH-1 schema fixed_assets.* (202606151600_fh1_fixed_assets_data_model.sql) is ARCHIVED.
 * Canonical asset register: accounting.fixed_assets.
 *
 * Fails CI if apps/** contains live SQL references to fixed_assets.<table> (reads or writes).
 * accounting.fixed_assets and JS object fields (e.g. data.fixed_assets) are allowed.
 *
 * Wired ONLY via scripts/verify-steps/1656-verify-no-writes-to-legacy-fixed-assets-schema.mjs (Rule 17).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-writes-to-legacy-fixed-assets-schema";
const SCAN_ROOTS = ["apps/backend/src", "apps/frontend/src"];
const LEGACY_TABLES = "asset_classes|assets|depreciation_schedules|disposals";

// SQL DML/DDL touching legacy schema (not accounting.fixed_assets).
const SQL_RE = new RegExp(
  String.raw`\b(FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?(?<!(?:accounting|data)\.)fixed_assets\.(?:${LEGACY_TABLES})\b`,
  "gi"
);
const PROBE_RE = new RegExp(
  String.raw`(to_regclass|has_table_privilege)\s*\([^)]{0,200}?(?<!(?:accounting|data)\.)fixed_assets\.(?:${LEGACY_TABLES})`,
  "gi"
);

function blankComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(fp, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(fp);
    }
  }
}

function isExempt(rel) {
  return (
    /\/__tests__\//.test(rel) ||
    /\.(test|spec)\.(ts|tsx)$/.test(rel) ||
    /\.deprecated\.ts$/.test(rel)
  );
}

export function checkLegacyFixedAssetsRefs(opts = {}) {
  const roots = opts.roots ?? SCAN_ROOTS.map((r) => path.join(ROOT, r));
  const relFrom = opts.relFrom ?? ROOT;
  const files = [];
  for (const r of roots) walk(r, files);
  const violations = [];
  for (const fp of files) {
    const rel = path.relative(relFrom, fp).replace(/\\/g, "/");
    if (isExempt(rel)) continue;
    let raw;
    try {
      raw = fs.readFileSync(fp, "utf8");
    } catch {
      continue;
    }
    const src = blankComments(raw);
    for (const re of [SQL_RE, PROBE_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split("\n").length;
        violations.push(
          `${rel}:${line} — legacy fixed_assets.* reference (use accounting.fixed_assets): ${m[0].replace(/\s+/g, " ").slice(0, 100)}`
        );
      }
    }
  }
  return violations;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-fa-"));
  try {
    const src = path.join(tmp, "apps/backend/src");
    fs.mkdirSync(path.join(src, "__tests__"), { recursive: true });
    fs.writeFileSync(
      path.join(src, "ok.ts"),
      [
        "await q(`SELECT id FROM accounting.fixed_assets WHERE id = $1`);",
        "const n = data.fixed_assets.length;",
        "// doc: legacy fixed_assets.assets was retired",
      ].join("\n") + "\n"
    );
    fs.writeFileSync(path.join(src, "bad-from.ts"), "await q(`SELECT 1 FROM fixed_assets.assets WHERE id = $1`);\n");
    fs.writeFileSync(path.join(src, "bad-insert.ts"), "await q(`INSERT INTO fixed_assets.assets (name) VALUES ($1)`);\n");
    fs.writeFileSync(path.join(src, "bad-update.ts"), "await q(`UPDATE fixed_assets.asset_classes SET name = $1`);\n");
    fs.writeFileSync(
      path.join(src, "__tests__/t.test.ts"),
      "await q(`DELETE FROM fixed_assets.disposals WHERE id = $1`);\n"
    );

    const v = checkLegacyFixedAssetsRefs({ roots: [src], relFrom: tmp });
    const has = (f) => v.some((x) => x.includes(f));
    const checks = [
      ["canonical accounting.fixed_assets ok", !has("ok.ts")],
      ["FROM fixed_assets.assets caught", has("bad-from.ts")],
      ["INSERT INTO fixed_assets caught", has("bad-insert.ts")],
      ["UPDATE fixed_assets caught", has("bad-update.ts")],
      ["tests exempt", !has("t.test.ts")],
    ];
    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length) {
      console.error(`[${LABEL}] SELFTEST FAIL`, failed, v);
      process.exit(1);
    }
    console.log(`[${LABEL}] selftest PASS (${checks.length} checks)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const violations = checkLegacyFixedAssetsRefs();
    if (violations.length) {
      console.error(`[${LABEL}] FAILED — ${violations.length} live reference(s) to legacy fixed_assets.*:`);
      for (const f of violations) console.error("  ✗ " + f);
      process.exit(1);
    }
    console.log(`[${LABEL}] OK — zero live references to legacy fixed_assets.* in apps/**.`);
  }
}
