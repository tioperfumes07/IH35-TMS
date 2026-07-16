#!/usr/bin/env node
/**
 * verify-settlement-engine-inventory.mjs (B-C.P0 groundwork)
 *
 * During the settlement-engine collapse, RETIRE payroll.driver_settlements /
 * payroll.driver_settlement_line_items writers must not grow. This guard:
 *   1. Parses the machine allowlist in
 *      docs/specs/SETTLEMENT-ENGINE-READER-WRITER-INVENTORY-2026-07-16.md
 *   2. Scans apps/backend + apps/frontend for INSERT INTO / UPDATE against those tables
 *   3. Fails if any WRITE appears in a file NOT listed in the allowlist
 *
 * Tests (__tests__, *.test.ts, *.spec.ts) are ignored — production/dead-code writers only.
 * Self-test: --selftest
 *
 * Complementary to verify-no-payroll-settlement-writes.mjs (excludes .deprecated) and
 * verify-canonical-table-writes.mjs (broader RETIRE map). This guard ties NEW writers to the
 * inventory doc so the checklist cannot drift silently.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-engine-inventory";
const INVENTORY_REL = "docs/specs/SETTLEMENT-ENGINE-READER-WRITER-INVENTORY-2026-07-16.md";
const ALLOWLIST_FENCE = "settlement-engine-payroll-write-allowlist";
const WRITE_RE =
  /\b(INSERT\s+INTO|UPDATE)\s+payroll\.(driver_settlements|driver_settlement_line_items)\b/gi;

const SCAN_ROOTS = ["apps/backend", "apps/frontend"];

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

function isTestPath(rel) {
  return (
    /\/__tests__\//.test(rel) ||
    /\.(test|spec)\.(ts|tsx)$/.test(rel)
  );
}

/** Extract allowlisted relative paths from the inventory fence. */
export function parseAllowlist(md) {
  const re = new RegExp("```" + ALLOWLIST_FENCE + "\\s*([\\s\\S]*?)```", "m");
  const m = md.match(re);
  if (!m) return null;
  return new Set(
    m[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"))
  );
}

/**
 * Return Map<relPath, Array<{line, op, table}>> for non-test payroll settlement writers.
 * @param {{ roots?: string[], relFrom?: string }} [opts]
 */
export function scanWriters(opts = {}) {
  const roots = opts.roots ?? SCAN_ROOTS.map((r) => path.join(ROOT, r));
  const relFrom = opts.relFrom ?? ROOT;
  const files = [];
  for (const r of roots) walk(r, files);
  const byFile = new Map();
  for (const fp of files) {
    const rel = path.relative(relFrom, fp).replace(/\\/g, "/");
    if (isTestPath(rel)) continue;
    let src;
    try {
      src = fs.readFileSync(fp, "utf8");
    } catch {
      continue;
    }
    WRITE_RE.lastIndex = 0;
    let m;
    while ((m = WRITE_RE.exec(src)) !== null) {
      const op = /INSERT/i.test(m[1]) ? "INSERT" : "UPDATE";
      const table = `payroll.${m[2]}`;
      const line = src.slice(0, m.index).split("\n").length;
      if (!byFile.has(rel)) byFile.set(rel, []);
      byFile.get(rel).push({ line, op, table });
    }
  }
  return byFile;
}

export function run(opts = {}) {
  const inventoryPath = opts.inventoryPath ?? path.join(ROOT, INVENTORY_REL);
  const relFrom = opts.relFrom ?? ROOT;
  const roots = opts.roots;
  if (!fs.existsSync(inventoryPath)) {
    return [`inventory missing: ${path.relative(ROOT, inventoryPath)}`];
  }
  const allow = parseAllowlist(fs.readFileSync(inventoryPath, "utf8"));
  if (!allow) {
    return [
      `inventory missing fenced allowlist \`\`\`${ALLOWLIST_FENCE}\`\`\` in ${INVENTORY_REL}`,
    ];
  }
  const writers = scanWriters({ roots, relFrom });
  const failures = [];
  for (const [rel, hits] of writers) {
    if (allow.has(rel)) continue;
    for (const h of hits) {
      failures.push(
        `NEW payroll.* settlement WRITE not in inventory allowlist: ${rel}:${h.line} ${h.op} ${h.table}`
      );
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "settlement-inv-"));
  try {
    const inv = path.join(tmp, "inv.md");
    fs.writeFileSync(
      inv,
      [
        "# test",
        "```" + ALLOWLIST_FENCE,
        "apps/backend/src/known-deprecated.ts",
        "```",
        "",
      ].join("\n")
    );
    const srcRoot = path.join(tmp, "apps/backend/src");
    fs.mkdirSync(srcRoot, { recursive: true });
    fs.writeFileSync(
      path.join(srcRoot, "known-deprecated.ts"),
      "await q(`INSERT INTO payroll.driver_settlements (id) VALUES ($1)`);\n"
    );
    fs.writeFileSync(
      path.join(srcRoot, "sneaky-new-writer.ts"),
      "await q(`UPDATE payroll.driver_settlements SET status = 'x'`);\n"
    );
    fs.mkdirSync(path.join(srcRoot, "__tests__"), { recursive: true });
    fs.writeFileSync(
      path.join(srcRoot, "__tests__/mock.ts"),
      "if (sql.includes('INSERT INTO payroll.driver_settlements')) {}\n"
    );

    const allow = parseAllowlist(fs.readFileSync(inv, "utf8"));
    const scanOpts = { roots: [path.join(tmp, "apps")], relFrom: tmp };
    const writers = scanWriters(scanOpts);
    const failures = run({ inventoryPath: inv, ...scanOpts });

    const checks = [
      ["parses allowlist fence", allow && allow.has("apps/backend/src/known-deprecated.ts")],
      ["finds known writer file", writers.has("apps/backend/src/known-deprecated.ts")],
      ["finds NEW writer file", writers.has("apps/backend/src/sneaky-new-writer.ts")],
      ["ignores __tests__", !writers.has("apps/backend/src/__tests__/mock.ts")],
      ["allowlisted writer does not fail", !failures.some((f) => f.includes("known-deprecated"))],
      ["NEW writer fails", failures.some((f) => f.includes("sneaky-new-writer"))],
    ];
    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length) {
      console.error(`${LABEL} --selftest FAIL:`);
      for (const [n] of failed) console.error("  ✗ " + n);
      console.error("failures:", failures);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
    process.exit(0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL} FAIL — ${failures.length} unlisted payroll.* settlement writer(s):`);
    for (const f of failures) console.error("  ✗ " + f);
    console.error(
      `\nAdd the site to ${INVENTORY_REL} §10 allowlist ONLY with owner note, or write driver_finance.* instead.`
    );
    process.exit(1);
  }
  const allow = parseAllowlist(fs.readFileSync(path.join(ROOT, INVENTORY_REL), "utf8"));
  const writers = scanWriters();
  console.log(
    `${LABEL} PASS — ${writers.size} payroll settlement write file(s) all listed in inventory allowlist (${allow?.size ?? 0} allowed)`
  );
}
