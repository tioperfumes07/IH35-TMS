#!/usr/bin/env node
/**
 * verify-settlement-engine-inventory.mjs (B-C.P0 + B-C.P4)
 *
 * Settlement-engine collapse CI lock:
 *   1. Parses machine allowlists in
 *      docs/specs/SETTLEMENT-ENGINE-READER-WRITER-INVENTORY-2026-07-16.md
 *   2. Fails if a NEW non-allowlisted file INSERT/UPDATE
 *      payroll.driver_settlements / payroll.driver_settlement_line_items, OR
 *      settlements.settlement_disputes / team_split_configs / team_split_load_overrides
 *   3. Fails if a RETIRE create/post registrar is mounted in apps/backend/src/index.ts
 *      outside the route-mount allowlist (legacy mounts may stay until P3; NEW mounts = red)
 *
 * Tests (__tests__, *.test.ts, *.spec.ts) are ignored for write scans.
 * Self-test: --selftest
 *
 * Complementary to verify-no-payroll-settlement-writes.mjs (excludes .deprecated) and
 * verify-canonical-table-writes.mjs (broader RETIRE map + count ratchet).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-engine-inventory";
const INVENTORY_REL = "docs/specs/SETTLEMENT-ENGINE-READER-WRITER-INVENTORY-2026-07-16.md";
const INDEX_REL = "apps/backend/src/index.ts";

const PAYROLL_ALLOW_FENCE = "settlement-engine-payroll-write-allowlist";
const SETTLEMENTS_ALLOW_FENCE = "settlement-engine-settlements-write-allowlist";
const ROUTE_ALLOW_FENCE = "settlement-engine-retire-route-mount-allowlist";

const PAYROLL_WRITE_RE =
  /\b(INSERT\s+INTO|UPDATE)\s+payroll\.(driver_settlements|driver_settlement_line_items)\b/gi;
const SETTLEMENTS_WRITE_RE =
  /\b(INSERT\s+INTO|UPDATE)\s+settlements\.(settlement_disputes|team_split_configs|team_split_load_overrides)\b/gi;

/** RETIRE create/post (or write-path) registrars — mounting outside allowlist fails CI. */
const RETIRE_ROUTE_REGISTRARS = [
  "registerPayrollDriverSettlementRoutes", // create/post (308 stubs today; still mounted)
  "registerSettlementsDisputesRoutes", // plural RETIRE disputes create/update
  "registerTeamSplitRoutes", // plural RETIRE team-split config create (unmounted today)
];

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
  return /\/__tests__\//.test(rel) || /\.(test|spec)\.(ts|tsx)$/.test(rel);
}

/** Extract allowlisted relative paths (or registrar names) from a fenced block. */
export function parseAllowlistFence(md, fence) {
  const re = new RegExp("```" + fence + "\\s*([\\s\\S]*?)```", "m");
  const m = md.match(re);
  if (!m) return null;
  return new Set(
    m[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"))
  );
}

/** @deprecated use parseAllowlistFence(md, PAYROLL_ALLOW_FENCE) — kept for P0 import compat */
export function parseAllowlist(md) {
  return parseAllowlistFence(md, PAYROLL_ALLOW_FENCE);
}

/**
 * Scan for RETIRE table writers matching writeRe.
 * @returns {Map<string, Array<{line:number, op:string, table:string}>>}
 */
export function scanWritersWith(writeRe, tablePrefix, opts = {}) {
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
    writeRe.lastIndex = 0;
    let m;
    while ((m = writeRe.exec(src)) !== null) {
      const op = /INSERT/i.test(m[1]) ? "INSERT" : "UPDATE";
      const table = `${tablePrefix}.${m[2]}`;
      const line = src.slice(0, m.index).split("\n").length;
      if (!byFile.has(rel)) byFile.set(rel, []);
      byFile.get(rel).push({ line, op, table });
    }
  }
  return byFile;
}

export function scanWriters(opts = {}) {
  return scanWritersWith(PAYROLL_WRITE_RE, "payroll", opts);
}

export function scanSettlementsWriters(opts = {}) {
  return scanWritersWith(SETTLEMENTS_WRITE_RE, "settlements", opts);
}

/** Return registrar names that have a live call site in index source. */
export function scanMountedRetireRoutes(indexSrc, registrars = RETIRE_ROUTE_REGISTRARS) {
  const mounted = [];
  for (const name of registrars) {
    // Match await registerX(app) / registerX(app) — not comments / string mentions alone.
    const callRe = new RegExp(
      String.raw`(?:^|[^\w.])(?:await\s+)?${name}\s*\(`,
      "m"
    );
    if (callRe.test(indexSrc)) mounted.push(name);
  }
  return mounted;
}

export function run(opts = {}) {
  const inventoryPath = opts.inventoryPath ?? path.join(ROOT, INVENTORY_REL);
  const relFrom = opts.relFrom ?? ROOT;
  const roots = opts.roots;
  const indexPath = opts.indexPath ?? path.join(ROOT, INDEX_REL);
  const failures = [];

  if (!fs.existsSync(inventoryPath)) {
    return [`inventory missing: ${path.relative(ROOT, inventoryPath)}`];
  }
  const md = fs.readFileSync(inventoryPath, "utf8");
  const payrollAllow = parseAllowlistFence(md, PAYROLL_ALLOW_FENCE);
  const settlementsAllow = parseAllowlistFence(md, SETTLEMENTS_ALLOW_FENCE);
  const routeAllow = parseAllowlistFence(md, ROUTE_ALLOW_FENCE);

  if (!payrollAllow) {
    failures.push(
      `inventory missing fenced allowlist \`\`\`${PAYROLL_ALLOW_FENCE}\`\`\` in ${INVENTORY_REL}`
    );
  }
  if (!settlementsAllow) {
    failures.push(
      `inventory missing fenced allowlist \`\`\`${SETTLEMENTS_ALLOW_FENCE}\`\`\` in ${INVENTORY_REL}`
    );
  }
  if (!routeAllow) {
    failures.push(
      `inventory missing fenced allowlist \`\`\`${ROUTE_ALLOW_FENCE}\`\`\` in ${INVENTORY_REL}`
    );
  }
  if (failures.length) return failures;

  const payrollWriters = scanWriters({ roots, relFrom });
  for (const [rel, hits] of payrollWriters) {
    if (payrollAllow.has(rel)) continue;
    for (const h of hits) {
      failures.push(
        `NEW payroll.* settlement WRITE not in inventory allowlist: ${rel}:${h.line} ${h.op} ${h.table}`
      );
    }
  }

  const settlementsWriters = scanSettlementsWriters({ roots, relFrom });
  for (const [rel, hits] of settlementsWriters) {
    if (settlementsAllow.has(rel)) continue;
    for (const h of hits) {
      failures.push(
        `NEW settlements.* RETIRE WRITE not in inventory allowlist: ${rel}:${h.line} ${h.op} ${h.table}`
      );
    }
  }

  if (!fs.existsSync(indexPath)) {
    failures.push(`index missing: ${INDEX_REL}`);
  } else {
    const indexSrc = fs.readFileSync(indexPath, "utf8");
    const mounted = scanMountedRetireRoutes(indexSrc);
    for (const name of mounted) {
      if (routeAllow.has(name)) continue;
      failures.push(
        `RETIRE settlement route newly mounted (not in allowlist): ${name} in ${INDEX_REL}`
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
        "```" + PAYROLL_ALLOW_FENCE,
        "apps/backend/src/known-deprecated.ts",
        "```",
        "```" + SETTLEMENTS_ALLOW_FENCE,
        "apps/backend/src/settlements/disputes/disputes.routes.ts",
        "```",
        "```" + ROUTE_ALLOW_FENCE,
        "registerPayrollDriverSettlementRoutes",
        "registerSettlementsDisputesRoutes",
        "```",
        "",
      ].join("\n")
    );
    const srcRoot = path.join(tmp, "apps/backend/src");
    fs.mkdirSync(path.join(srcRoot, "settlements/disputes"), { recursive: true });
    fs.writeFileSync(
      path.join(srcRoot, "known-deprecated.ts"),
      "await q(`INSERT INTO payroll.driver_settlements (id) VALUES ($1)`);\n"
    );
    fs.writeFileSync(
      path.join(srcRoot, "sneaky-new-writer.ts"),
      "await q(`UPDATE payroll.driver_settlements SET status = 'x'`);\n"
    );
    fs.writeFileSync(
      path.join(srcRoot, "settlements/disputes/disputes.routes.ts"),
      "await q(`INSERT INTO settlements.settlement_disputes (id) VALUES ($1)`);\n"
    );
    fs.writeFileSync(
      path.join(srcRoot, "sneaky-settlements-writer.ts"),
      "await q(`INSERT INTO settlements.team_split_configs (id) VALUES ($1)`);\n"
    );
    fs.mkdirSync(path.join(srcRoot, "__tests__"), { recursive: true });
    fs.writeFileSync(
      path.join(srcRoot, "__tests__/mock.ts"),
      "if (sql.includes('INSERT INTO payroll.driver_settlements')) {}\n"
    );

    const goodIndex = path.join(tmp, "index-good.ts");
    fs.writeFileSync(
      goodIndex,
      [
        "await registerDriverFinanceSettlementRoutes(app);",
        "await registerPayrollDriverSettlementRoutes(app);",
        "await registerSettlementsDisputesRoutes(app);",
        "",
      ].join("\n")
    );
    const badIndex = path.join(tmp, "index-bad.ts");
    fs.writeFileSync(
      badIndex,
      [
        "await registerDriverFinanceSettlementRoutes(app);",
        "await registerPayrollDriverSettlementRoutes(app);",
        "await registerSettlementsDisputesRoutes(app);",
        "await registerTeamSplitRoutes(app); // NEW retire mount",
        "",
      ].join("\n")
    );

    const allow = parseAllowlistFence(fs.readFileSync(inv, "utf8"), PAYROLL_ALLOW_FENCE);
    const scanOpts = { roots: [path.join(tmp, "apps")], relFrom: tmp };
    const writers = scanWriters(scanOpts);
    const sWriters = scanSettlementsWriters(scanOpts);
    const failuresGood = run({ inventoryPath: inv, indexPath: goodIndex, ...scanOpts });
    const failuresBad = run({ inventoryPath: inv, indexPath: badIndex, ...scanOpts });
    const mountedBad = scanMountedRetireRoutes(fs.readFileSync(badIndex, "utf8"));

    const checks = [
      ["parses payroll allowlist fence", allow && allow.has("apps/backend/src/known-deprecated.ts")],
      ["finds known payroll writer", writers.has("apps/backend/src/known-deprecated.ts")],
      ["finds NEW payroll writer", writers.has("apps/backend/src/sneaky-new-writer.ts")],
      ["ignores __tests__", !writers.has("apps/backend/src/__tests__/mock.ts")],
      ["allowlisted payroll writer does not fail", !failuresGood.some((f) => f.includes("known-deprecated"))],
      ["NEW payroll writer fails", failuresGood.some((f) => f.includes("sneaky-new-writer"))],
      ["finds allowlisted settlements writer", sWriters.has("apps/backend/src/settlements/disputes/disputes.routes.ts")],
      ["NEW settlements.* writer fails", failuresGood.some((f) => f.includes("sneaky-settlements-writer"))],
      ["allowlisted settlements writer does not fail", !failuresGood.some((f) => f.includes("disputes.routes"))],
      ["good index has no route-mount failure", !failuresGood.some((f) => f.includes("newly mounted"))],
      ["detects registerTeamSplitRoutes mount", mountedBad.includes("registerTeamSplitRoutes")],
      ["NEW retire route mount fails", failuresBad.some((f) => f.includes("registerTeamSplitRoutes"))],
    ];
    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length) {
      console.error(`${LABEL} --selftest FAIL:`);
      for (const [n] of failed) console.error("  ✗ " + n);
      console.error("failuresGood:", failuresGood);
      console.error("failuresBad:", failuresBad);
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
    console.error(`${LABEL} FAIL — ${failures.length} settlement RETIRE write/route violation(s):`);
    for (const f of failures) console.error("  ✗ " + f);
    console.error(
      `\nUpdate ${INVENTORY_REL} allowlists ONLY with owner note (shrink preferred), or write driver_finance.* / mount only canonical routes.`
    );
    process.exit(1);
  }
  const md = fs.readFileSync(path.join(ROOT, INVENTORY_REL), "utf8");
  const payrollAllow = parseAllowlistFence(md, PAYROLL_ALLOW_FENCE);
  const settlementsAllow = parseAllowlistFence(md, SETTLEMENTS_ALLOW_FENCE);
  const routeAllow = parseAllowlistFence(md, ROUTE_ALLOW_FENCE);
  const payrollWriters = scanWriters();
  const settlementsWriters = scanSettlementsWriters();
  const mounted = scanMountedRetireRoutes(fs.readFileSync(path.join(ROOT, INDEX_REL), "utf8"));
  console.log(
    `${LABEL} PASS — payroll write files=${payrollWriters.size}/${payrollAllow?.size ?? 0} allowed; ` +
      `settlements.* write files=${settlementsWriters.size}/${settlementsAllow?.size ?? 0} allowed; ` +
      `retire routes mounted=${mounted.length}/${routeAllow?.size ?? 0} allowlisted`
  );
}
