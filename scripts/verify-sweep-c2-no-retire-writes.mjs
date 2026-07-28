#!/usr/bin/env node
/**
 * SWEEP-C2 (CLASS-SWEEP 2026-07-26) — forbid live WRITES to RETIRE schemas.
 *
 * Complements verify-no-retire-table-writes.mjs (1194): that guard closes the ENFORCED
 * RETIRE class for ALL references (SELECT/JOIN/probes). C2 is the class-sweep WRITE
 * inventory ratchet — it FAILS on INSERT/UPDATE/DELETE into live-writer RETIRE schemas
 * (bank.*, maint.*, catalogs.load_cancellation_reasons, plus any ENFORCED-tier write
 * outside *.deprecated.ts archives).
 *
 * CANONICAL (never flagged): driver_finance.*, banking.*, maintenance.*,
 * mdata.vendors, mdata.loads, catalogs.cancellation_reasons,
 * accounting.qbo_vendors (Desktop ACCT-ECON-05), accounting.qbo_remote_counts /
 * accounting.qbo_remote_count_collection_state.
 * Sync still writes mdata.qbo_vendors until a dedicated repoint wave — not C2-scoped yet.
 *
 * GUARD-FIRST: shrink-only baseline so CI passes while inventory is tracked; --strict
 * prints the full red worklist. selftest plants a RETIRE write and fails.
 *
 * Rule 17: wired ONLY via scripts/verify-steps/1521-*.mjs
 *
 * Usage:
 *   node scripts/verify-sweep-c2-no-retire-writes.mjs --selftest
 *   node scripts/verify-sweep-c2-no-retire-writes.mjs
 *   node scripts/verify-sweep-c2-no-retire-writes.mjs --strict
 *   UPDATE_C2_RETIRE_WRITE_BASELINE=1 node scripts/verify-sweep-c2-no-retire-writes.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blankComments, ENFORCED, KNOWN_LEGACY } from "./verify-no-retire-table-writes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-sweep-c2-no-retire-writes";
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");
const BASELINE = path.join(ROOT, "scripts", "verify-sweep-c2-no-retire-writes.baseline.json");

const EXEMPT_INLINE = /C2-RETIRE-WRITE-EXEMPT:/;

/** C2 scope = ENFORCED + KNOWN_LEGACY live-writer tiers from linkage law / 1194. */
const C2_RETIRE = [...ENFORCED, ...KNOWN_LEGACY];

const buildWriteRe = (list) =>
  new RegExp(
    `\\b(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:ONLY\\s+)?(${list.map((r) => r.pat).join("|")})\\b`,
    "gi"
);

const WRITE_RE = buildWriteRe(C2_RETIRE);

/** Confirmed live-writer seeds — must appear in first baseline (guard-first teeth). */
const REQUIRED_SEED_SUBSTR = [
  "position-history.routes.ts",
  "maint/parts.routes.ts",
  "maint/pm.routes.ts",
  "bank-recon/match.service.ts",
  "bank-recon/recon-worklist.service.ts",
  "load-cancellation-reasons.routes.ts",
];

function canonicalFor(table) {
  for (const r of C2_RETIRE) {
    if (new RegExp(`^${r.pat}$`, "i").test(table)) return r.canonical;
  }
  return "the canonical table";
}

function isExemptPath(relPath) {
  return (
    /\/__tests__\//.test(relPath) ||
    /\.(test|spec)\.(ts|tsx)$/.test(relPath) ||
    /\.deprecated\.ts$/.test(relPath)
  );
}

function walkTsFiles(dir, root, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walkTsFiles(full, root, out);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/**
 * @param {Record<string, string>} files relPath → source
 * @returns {{ writers: string[], evaluated: string[] }}
 */
export function findC2RetireWriters(files) {
  const writers = [];
  const evaluated = [];

  for (const [relPath, raw] of Object.entries(files)) {
    if (isExemptPath(relPath)) continue;
    const src = blankComments(raw);
    if (EXEMPT_INLINE.test(raw)) continue;

    WRITE_RE.lastIndex = 0;
    let m;
    while ((m = WRITE_RE.exec(src)) !== null) {
      const verb = m[1].replace(/\s+/g, " ");
      const table = m[2];
      const line = src.slice(0, m.index).split("\n").length;
      evaluated.push(relPath);
      writers.push(
        `${relPath}:${line}::${verb} ${table} — live RETIRE write (repoint to ${canonicalFor(table)})`
      );
    }
  }

  return { writers: [...new Set(writers)].sort(), evaluated: [...new Set(evaluated)].sort() };
}

function writerKey(line) {
  const m = /^([^:]+:[0-9]+)::/.exec(line);
  return m ? m[1] : line.split(" — ")[0];
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
    return new Set(data.keys ?? []);
  } catch {
    return null;
  }
}

export function runAgainstFiles(files, { strict = false, baseline = null } = {}) {
  const { writers, evaluated } = findC2RetireWriters(files);
  if (strict || !baseline) {
    return { failures: writers, writers, evaluated, known: [] };
  }
  const known = [];
  const failures = [];
  for (const w of writers) {
    const k = writerKey(w);
    if (baseline.has(k)) known.push(w);
    else failures.push(w);
  }
  return { failures, writers, evaluated, known };
}

function loadRealFiles() {
  const relFiles = walkTsFiles(BACKEND_SRC, BACKEND_SRC, []);
  /** @type {Record<string, string>} */
  const files = {};
  for (const rel of relFiles) {
    files[rel] = fs.readFileSync(path.join(BACKEND_SRC, rel), "utf8");
  }
  return files;
}

function writeBaseline(writers, { isBootstrap } = {}) {
  const keys = [...new Set(writers.map(writerKey))].sort();
  // REQUIRED_SEED_SUBSTR is a bootstrap-only check ("must appear in first baseline" — see the
  // constant's own doc comment): it exists to catch a baseline being created empty/short, hiding
  // the confirmed writers the guard was built to inventory. Once those writers are genuinely
  // repointed (the guard's entire shrink-only purpose), they correctly stop appearing — re-running
  // this check forever would make the baseline permanently un-shrinkable to zero, which contradicts
  // the guard's own design intent. So it only applies when no baseline existed before this write.
  const missingSeeds = isBootstrap ? REQUIRED_SEED_SUBSTR.filter((s) => !keys.some((k) => k.includes(s))) : [];
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          "SWEEP-C2 shrink-only baseline — live INSERT/UPDATE/DELETE into RETIRE schemas. " +
          "Regenerate: UPDATE_C2_RETIRE_WRITE_BASELINE=1. NEW file:line keys fail CI; list may " +
          "only shrink as writers are repointed. Exempt with C2-RETIRE-WRITE-EXEMPT: <reason>. " +
          "Complements verify-no-retire-table-writes (1194).",
        generated_at: new Date().toISOString(),
        count: keys.length,
        required_seeds_present: !isBootstrap || missingSeeds.length === 0,
        missing_seeds: missingSeeds,
        keys,
      },
      null,
      2
    ) + "\n"
  );
  return { keys, missingSeeds };
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c2-retire-writes-"));
  try {
    const srcDir = path.join(tmp, "apps", "backend", "src");
    fs.mkdirSync(path.join(srcDir, "__tests__"), { recursive: true });

    const files = {
      "clean/canonical.ts": `
        await q(\`INSERT INTO driver_finance.driver_settlements (id) VALUES ($1)\`);
        await q(\`INSERT INTO accounting.qbo_vendors (id) VALUES ($1)\`);
        await q(\`INSERT INTO banking.bank_transactions (id) VALUES ($1)\`);
        await q(\`INSERT INTO maintenance.work_orders (id) VALUES ($1)\`);
        await q(\`INSERT INTO accounting.qbo_remote_counts (id) VALUES ($1)\`);
      `,
      "bad/maint-write.ts": `
        await q(\`INSERT INTO maint.position_history (id) VALUES ($1)\`);
      `,
      "bad/bank-write.ts": `
        await q(\`INSERT INTO bank.reconciliation_matches (id) VALUES ($1)\`);
      `,
      "bad/payroll-write.ts": `
        await q(\`UPDATE payroll.driver_settlements SET status = $2 WHERE id = $1\`);
      `,
      "archive/old.deprecated.ts": `
        await q(\`INSERT INTO payroll.driver_settlements (id) VALUES ($1)\`);
      `,
      "__tests__/mock.test.ts": `
        await q(\`INSERT INTO maint.part (id) VALUES ($1)\`);
      `,
      "exempt/shim.ts": `
        // C2-RETIRE-WRITE-EXEMPT: archival read-only shim pending repoint block
        await q(\`INSERT INTO maint.pm_schedule (id) VALUES ($1)\`);
      `,
    };

    for (const [rel, content] of Object.entries(files)) {
      const fp = path.join(srcDir, rel);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, content);
    }

    const loaded = {};
    for (const rel of Object.keys(files)) {
      loaded[rel] = fs.readFileSync(path.join(srcDir, rel), "utf8");
    }

    const { writers } = findC2RetireWriters(loaded);
    const hasFile = (file) => writers.some((w) => w.startsWith(`${file}:`));
    const hasFileTable = (file, table) =>
      writers.some((w) => w.startsWith(`${file}:`) && w.includes(table));

    const checks = [
      ["canonical driver_finance write passes", !hasFile("clean/canonical.ts")],
      ["canonical accounting.qbo_vendors write passes", !hasFile("clean/canonical.ts")],
      ["canonical banking.* write passes", !hasFile("clean/canonical.ts")],
      ["canonical maintenance.* write passes", !hasFile("clean/canonical.ts")],
      ["maint.* RETIRE write caught", hasFileTable("bad/maint-write.ts", "maint.position_history")],
      ["bank.* RETIRE write caught", hasFileTable("bad/bank-write.ts", "bank.reconciliation_matches")],
      ["payroll.* ENFORCED write caught", hasFile("bad/payroll-write.ts")],
      ["*.deprecated.ts archive exempt", !hasFile("archive/old.deprecated.ts")],
      ["__tests__ exempt", !hasFile("__tests__/mock.test.ts")],
      ["C2-RETIRE-WRITE-EXEMPT inline passes", !hasFile("exempt/shim.ts")],
    ];

    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length) {
      console.error(`[${LABEL}] SELFTEST FAIL:`);
      for (const [n] of failed) console.error("  ✗ " + n);
      console.error("writers:", writers);
      process.exit(1);
    }
    console.log(`[${LABEL}] selftest PASS (${checks.length} checks)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    selftest();
    return;
  }

  if (!fs.existsSync(BACKEND_SRC)) {
    console.error(`[${LABEL}] FAIL — ${BACKEND_SRC} not found`);
    process.exit(1);
  }

  const files = loadRealFiles();
  const { writers } = findC2RetireWriters(files);

  if (process.env.UPDATE_C2_RETIRE_WRITE_BASELINE === "1") {
    const isBootstrap = !fs.existsSync(BASELINE);
    const { keys, missingSeeds } = writeBaseline(writers, { isBootstrap });
    console.log(`[${LABEL}] baseline written: ${keys.length} live RETIRE writer site(s).`);
    if (missingSeeds.length) {
      console.error(`[${LABEL}] WARN — required seeds missing: ${missingSeeds.join(", ")}`);
      process.exit(1);
    }
    process.exit(0);
  }

  const strict = args.includes("--strict");
  const baseline = loadBaseline();
  if (!strict && !baseline) {
    console.error(
      `[${LABEL}] FAIL — baseline missing (${path.relative(ROOT, BASELINE)}). ` +
        `Run: UPDATE_C2_RETIRE_WRITE_BASELINE=1 node scripts/verify-sweep-c2-no-retire-writes.mjs`
    );
    process.exit(1);
  }

  const result = runAgainstFiles(files, { strict, baseline });

  if (!strict && result.known.length) {
    console.log(`[${LABEL}] baselined RETIRE writer(s) still open (shrink-only): ${result.known.length}`);
    for (const w of result.known) console.log(`  · ${w}`);
  }

  if (result.failures.length) {
    console.error(`[${LABEL}] FAIL — ${result.failures.length} ${strict ? "" : "NEW "}live RETIRE write(s):`);
    for (const f of result.failures) console.error(`  ✗ ${f}`);
    console.error(
      `\nSWEEP-C2: repoint each live writer onto canonical (maintenance.* / banking.* / ` +
        `catalogs.cancellation_reasons / driver_finance.*). Never weaken — shrink baseline only. ` +
        `See verify-no-retire-table-writes.mjs (1194) for the full RETIRE class.`
    );
    process.exit(1);
  }

  console.log(
    `[${LABEL}] OK — ${Object.keys(files).length} backend files scanned; ` +
      `${result.writers.length} live RETIRE writer site(s); ` +
      (strict
        ? "zero writers (strict)."
        : `${result.known.length} baselined writer site(s) remaining (shrink-only ratchet).`)
  );
}

main();
