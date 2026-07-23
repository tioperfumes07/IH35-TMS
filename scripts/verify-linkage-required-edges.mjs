#!/usr/bin/env node
/**
 * verify-linkage-required-edges — LAW OF THE LAND (§10a/§10d) enforcement, layer 2.
 *
 * THE RULE (owner, 2026-07-21):
 *   "One economic fact wired through every module/tab/account it should touch."
 *   An insurance claim that becomes a lawsuit must carry the same connected truth everywhere it
 *   belongs: claim record + legal matter + the expense/bill it generated + driver + unit +
 *   GL/JE + payment account/method — forward AND reverse, no dead ends, no orphan money.
 *
 * WHY A SECOND GUARD: verify-no-dead-schema catches "a column nobody reads". It does NOT catch
 * "accounting.expenses is read constantly but cannot reach the claim that caused it", nor
 * "fuel_transactions.vendor_id is a bare uuid that points at nothing enforceable". Those are the
 * defect classes that lose money, and they had no mechanical check.
 *
 * IT ENFORCES TWO THINGS:
 *   1. REQUIRED EDGES — for each money-/claim-touching table, the relations that record MUST reach.
 *      Edges are alternatives (["a","b"] = either satisfies), because some links are legitimately
 *      satisfied through a line table, a junction, or the reverse direction.
 *   2. UNENFORCED POINTERS — money-critical `*_id`/`*_uuid` columns declared with NO foreign key.
 *      This is the defect that let "it's built" survive inspection: the link WAS written, as a bare
 *      uuid that accepts any value and dangles when its target is removed. It LOOKS wired in a
 *      column list and guarantees nothing. accounting.bill_lines.bill_id, bill_payments
 *      .from_bank_account_id, banking.transfers.from_account_id, settlement_lines
 *      .posting_account_id, fuel_transactions.vendor_id, accident_reports.driver_id are all in
 *      this class. (An earlier revision of this file defined this detector and never called it,
 *      while REMOVING three real findings that pointed at it — the check now runs.)
 *
 * STATIC: parses REFERENCES targets out of db/migrations/*.sql. No database needed, so it runs in
 * every CI job, not just DB jobs.
 *
 * SCOPE, stated honestly: this proves SCHEMA REACHABILITY only. §0 says PROD WINS and prod has
 * diverged from migrations repeatedly, so a pass here is not a statement about prod's FK graph.
 * It also cannot see rows: it will happily pass a table with 16k headers and 0 line rows, or a
 * poster that never runs. Population + reverse UI drill-through are live-data audits. Never cite
 * this guard as proof the books are wired.
 *
 * Run: node scripts/verify-linkage-required-edges.mjs [--selftest] [--report]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "db/migrations");
const SOURCE_ROOTS = [join(ROOT, "apps/backend/src")];
const BASELINE_FILE = join(ROOT, "scripts/verify-linkage-required-edges.baseline.json");

/**
 * REQUIRED_EDGES — the owner's linkage law, declared.
 * key   = schema.table of the economic fact
 * value = { edgeName: [acceptable FK targets] }  (at least one target must be referenced)
 */
export const REQUIRED_EDGES = {
  // ── the expense ──
  // CORRECTED 2026-07-21 against prod: expense_account lives on accounting.expense_lines
  // (FK -> catalogs.accounts) and IS wired; driver_uuid/unit_id/load_id already carry FKs.
  // NOT required: driver / unit. A driverless, unit-less vendor expense (shop, office, insurance)
  // is LAWFUL — createExpense makes driver optional. Requiring them would fail valid AP.
  "accounting.expenses": {
    gl: ["accounting.journal_entries"],
    claim_or_matter: ["insurance.claim", "legal.matters"],
  },
  // ── AP ──
  // NOT required: load. Shop / insurance / office vendor bills are legitimately not load-linked.
  // §9.7 "everything links to the load" governs LOAD-attributable spend, not all AP.
  "accounting.bills": {
    vendor: ["mdata.vendors"],
    gl: ["accounting.journal_entries"],
  },
  "accounting.bill_payments": {
    bill: ["accounting.bills"],
    payment_account: ["banking.bank_accounts", "banking.bank_transactions", "catalogs.accounts"],
    gl: ["accounting.journal_entries"],
  },
  // ── AR ──
  "accounting.invoices": {
    customer: ["mdata.customers"],
    gl: ["accounting.journal_entries"],
  },
  // ── the GL itself must be traceable back to what caused it ──
  "accounting.journal_entries": {
    source: ["accounting.transaction_source_links", "accounting.posting_batches", "mdata.loads", "accounting.bills", "accounting.invoices"],
  },
  // ── claim → lawsuit → money (the owner's worked example) ──
  "insurance.claim": {
    policy: ["insurance.policy"],
    driver: ["mdata.drivers"],
    unit: ["mdata.units", "mdata.assets"],
    incident: ["safety.accident_reports", "safety.incidents"],
    money: ["accounting.expenses", "accounting.bills", "accounting.journal_entries"],
  },
  "insurance.lawsuit": {
    claim: ["insurance.claim"],
    matter: ["legal.matters"],
    driver: ["mdata.drivers"],
    unit: ["mdata.units", "mdata.assets"],
    money: ["accounting.expenses", "accounting.bills", "accounting.journal_entries"],
  },
  // NOT required: claim. Not every matter originates in an insurance claim (contract disputes,
  // employment, regulatory). Claim linkage is required only for insurance-origin matters, which
  // is a product rule this static guard cannot see.
  "legal.matters": {
    money: ["accounting.expenses", "accounting.bills", "accounting.journal_entries"],
  },
  // ── driver pay ──
  "driver_finance.driver_settlements": {
    driver: ["mdata.drivers"],
    load: ["mdata.loads"],
    money: ["accounting.bills", "accounting.journal_entries", "driver_finance.driver_settlement_gl_runs"],
  },
  "driver_finance.settlement_lines": {
    settlement: ["driver_finance.driver_settlements"],
    driver: ["mdata.drivers"],
    // posting_account_id exists with NO FK — enforced as an unenforced-pointer finding below.
  },
  // ── fuel: operationally linked today, financially orphaned ──
  "fuel.fuel_transactions": {
    driver: ["mdata.drivers"],
    unit: ["mdata.units"],
    load: ["mdata.loads"],
    // vendor_id exists with NO FK — enforced as an unenforced-pointer finding below.
    money: ["accounting.bills", "accounting.expenses", "accounting.journal_entries", "banking.bank_transactions"],
  },
  // ── revenue events ──
  // NOTE: owner-locked design is MANUAL billing (#3129 HOLD). This edge asserts a billable
  // cancellation CAN become a receivable; it must never be read as license to auto-invoice.
  "dispatch.load_cancellations": {
    load: ["mdata.loads"],
    ar: ["accounting.invoices", "accounting.invoice_lines"],
  },
  "maintenance.work_orders": {
    unit: ["mdata.units", "mdata.assets"],
    vendor: ["mdata.vendors"],
    money: ["accounting.bills", "accounting.expenses", "accounting.journal_entries"],
  },
  "safety.accident_reports": {
    // driver_id exists with NO FK — enforced as an unenforced-pointer finding below.
    unit: ["mdata.units"],
    claim: ["insurance.claim"],
    money: ["accounting.expenses", "accounting.bills", "accounting.journal_entries"],
  },
};

/** Money-critical pointer columns must be FK-ENFORCED. */
const MONEY_POINTER_RE = /(vendor|customer|account|driver|unit|claim|matter|payment|bill|invoice|settlement|policy)/i;
const POINTER_SCHEMAS = new Set(["accounting", "banking", "driver_finance", "insurance", "legal", "safety", "fuel", "maintenance", "dispatch"]);
/** Scoping/ownership FKs — present on nearly every table, so they never make a table a junction. */
const SCOPING_TARGETS = new Set(["org.companies", "identity.users", "mdata.operating_companies"]);

const QUALIFIED = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i;

/**
 * Split a migration into independently-parseable chunks: the outer SQL with dollar-quoted bodies
 * lifted out, plus each body as its own chunk. Discarding the bodies (the prior revision) hid real
 * DDL — this repo creates maintenance.work_orders and safety.accident_reports inside `DO $$ ... $$`,
 * so they read as "table does not exist". Keeping them inline instead makes the ALTER regex drift
 * on the semicolons inside the body. Extracting them gives both correctness and coverage.
 */
export function sqlChunks(sql) {
  const noComments = sql.replace(/--[^\n]*/g, "");
  const bodies = [];
  const outer = noComments.replace(/\$([A-Za-z_]\w*)?\$([\s\S]*?)\$\1?\$/g, (_m, _tag, body) => {
    bodies.push(body);
    return " ";
  });
  return [outer, ...bodies];
}

/** Depth-aware split of a CREATE TABLE body so several columns on one line are all seen. */
export function splitDefinitions(body) {
  const parts = [];
  let depth = 0, cur = "", quote = null;
  for (const ch of body) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if ((ch === "," || ch === "\n") && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** uuid columns declared per table, which carry an FK, and which tables exist at all. */
export function buildPointerMaps(sqlFiles) {
  const uuidCols = new Map();
  const fkCols = new Map();
  const dropped = new Set();
  const put = (map, t, c) => { if (!map.has(t)) map.set(t, new Set()); map.get(t).add(c); };

  for (const raw of sqlFiles) {
    for (const sql of sqlChunks(raw)) {
    for (const m of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][\w.]*)\s*\(([\s\S]*?)\n\s*\)/gi)) {
      const t = m[1];
      if (!QUALIFIED.test(t)) continue;
      for (const line of splitDefinitions(m[2])) {
        const cm = line.match(/^\s*"?([a-z_][a-z0-9_]*)"?\s+uuid\b/i);
        if (cm) { put(uuidCols, t, cm[1]); if (/REFERENCES/i.test(line)) put(fkCols, t, cm[1]); }
      }
      // table-level FOREIGN KEY (...) clauses inside CREATE TABLE
      for (const c of m[2].matchAll(/FOREIGN KEY\s*\(\s*([a-z_][a-z0-9_,\s"]*)\)/gi)) {
        c[1].split(",").map((x) => x.trim().replace(/"/g, "")).forEach((col) => put(fkCols, t, col));
      }
    }
    for (const m of sql.matchAll(/ALTER TABLE(?:\s+ONLY)?\s+([A-Za-z_][\w.]*)([\s\S]*?);/gi)) {
      const t = m[1];
      if (!QUALIFIED.test(t)) continue;
      for (const c of m[2].matchAll(/ADD COLUMN(?:\s+IF NOT EXISTS)?\s+"?([a-z_][a-z0-9_]*)"?\s+uuid\b([^,;]*)/gi)) {
        put(uuidCols, t, c[1]);
        if (/REFERENCES/i.test(c[2])) put(fkCols, t, c[1]);
      }
      for (const c of m[2].matchAll(/FOREIGN KEY\s*\(\s*([a-z_][a-z0-9_,\s"]*)\)/gi)) {
        c[1].split(",").map((x) => x.trim().replace(/"/g, "")).forEach((col) => put(fkCols, t, col));
      }
      for (const c of m[2].matchAll(/DROP COLUMN(?:\s+IF EXISTS)?\s+"?([a-z_][a-z0-9_]*)"?/gi)) dropped.add(`${t}.${c[1]}`);
    }
    }
  }
  for (const key of dropped) {
    const i = key.lastIndexOf(".");
    uuidCols.get(key.slice(0, i))?.delete(key.slice(i + 1));
  }
  return { uuidCols, fkCols };
}

export function findUnenforcedPointers({ uuidCols, fkCols }) {
  const out = [];
  for (const [tbl, cols] of uuidCols) {
    if (!POINTER_SCHEMAS.has(tbl.split(".")[0])) continue;
    const enforced = fkCols.get(tbl) ?? new Set();
    for (const col of cols) {
      if (!/_(id|uuid)$/i.test(col)) continue;
      if (["id", "operating_company_id", "tenant_id"].includes(col)) continue;
      if (!MONEY_POINTER_RE.test(col)) continue;
      if (enforced.has(col)) continue;
      out.push({ table: tbl, column: col });
    }
  }
  return out.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

/** Parse every FK target declared for each table, plus the set of tables any migration creates. */
export function buildEdgeGraph(sqlFiles) {
  const graph = new Map();
  const created = new Set();
  const add = (src, tgt) => {
    if (!src || !tgt) return;
    if (!graph.has(src)) graph.set(src, new Set());
    graph.get(src).add(tgt);
  };

  for (const raw of sqlFiles) {
    for (const clean of sqlChunks(raw)) {
      for (const m of clean.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][\w.]*)([\s\S]*?)(?=CREATE TABLE|ALTER TABLE|$)/gi)) {
        const src = m[1];
        if (!QUALIFIED.test(src)) continue;
        created.add(src);
        if (!graph.has(src)) graph.set(src, new Set());
        for (const r of m[2].matchAll(/REFERENCES\s+([A-Za-z_][\w.]*)/gi)) if (QUALIFIED.test(r[1])) add(src, r[1]);
      }
      for (const m of clean.matchAll(/ALTER TABLE(?:\s+ONLY)?\s+([A-Za-z_][\w.]*)([\s\S]*?);/gi)) {
        const src = m[1];
        if (!QUALIFIED.test(src)) continue;
        for (const r of m[2].matchAll(/REFERENCES\s+([A-Za-z_][\w.]*)/gi)) if (QUALIFIED.test(r[1])) add(src, r[1]);
      }
    }
  }
  return { graph, created };
}

/**
 * POLYMORPHIC SATISFACTION — DERIVED FROM CODE, not hardcoded.
 * GL source linkage here is deliberately polymorphic:
 *   accounting.transaction_source_links(journal_entry_posting_id, linked_object_type, linked_object_id)
 *   accounting.journal_entry_postings(source_transaction_type, source_transaction_id)
 * A table satisfies its gl/source edge ONLY if its name actually appears as one of those literals
 * in backend source. The previous revision granted this by a hardcoded table list, which exempted
 * tables from the very edge the guard exists to enforce, whether or not the code ever posts them.
 *
 * NOTE (tracked, not enforceable here): polymorphic links carry NO referential integrity — a
 * linked_object_id can dangle. That orphan risk is a live-row audit, not a static check.
 */
const POLYMORPHIC_GL_EDGES = new Set(["gl", "source"]);

export function discoverPolymorphicSourceTypes(sourceText) {
  const types = new Set();
  for (const field of ["linked_object_type", "source_transaction_type"]) {
    for (const m of sourceText.matchAll(new RegExp(`${field}[^,;)\\n]{0,120}`, "g"))) {
      for (const lit of m[0].matchAll(/'([a-z][a-z0-9_]*)'/g)) types.add(lit[1]);
    }
  }
  return types;
}

const singularize = (s) => s.replace(/ies$/, "y").replace(/s$/, "");
function satisfiesPolymorphic(table, polyTypes) {
  const short = table.split(".").pop();
  return polyTypes.has(short) || polyTypes.has(singularize(short));
}

/**
 * A junction genuinely wires two records together only if linking is what it DOES. Any wide table
 * that happens to reference both sides is not a junction — the previous revision accepted that and
 * would silence real breaks. Scoping FKs (company/user) are excluded before measuring width.
 */
function isJunction(edges, tbl, targets) {
  if (!edges.has(tbl)) return false;
  const meaningful = [...edges].filter((e) => !SCOPING_TARGETS.has(e));
  return meaningful.length <= 4 && targets.some((t) => edges.has(t));
}

export function findMissingEdges({ graph, created }, required = REQUIRED_EDGES, polyTypes = new Set()) {
  const missing = [];
  for (const [tbl, edges] of Object.entries(required)) {
    if (created.size > 0 && !created.has(tbl)) {
      // The manifest names an economic fact with no table at all. That is a finding, not a skip.
      missing.push({ table: tbl, edge: "__table__", expected: ["a CREATE TABLE in db/migrations"] });
      continue;
    }
    // NOTE: a table with ZERO outbound FKs is the WORST break, not an exemption. The previous
    // revision did `if (have.size === 0) continue`, which exempted the most orphaned tables in
    // the repo by construction.
    const have = graph.get(tbl) ?? new Set();
    for (const [edgeName, targets] of Object.entries(edges)) {
      if (targets.some((t) => have.has(t))) continue;
      if (POLYMORPHIC_GL_EDGES.has(edgeName) && satisfiesPolymorphic(tbl, polyTypes)) continue;
      // JUNCTION: a real link table joining this record to the target (e.g.
      // driver_finance.driver_settlement_gl_runs joins driver_settlements <-> journal_entries).
      const viaJunction = [...graph.entries()].some(
        ([other, otherEdges]) => other !== tbl && otherEdges.has(tbl) && isJunction(otherEdges, tbl, targets)
      );
      if (viaJunction) continue;
      // REVERSE: the target points AT this record (e.g. legal.matters -> insurance.lawsuit).
      // The law asks for forward AND reverse reachability, not for the FK to sit on one side.
      const viaReverse = targets.some((t) => (graph.get(t) ?? new Set()).has(tbl));
      if (viaReverse) continue;
      missing.push({ table: tbl, edge: edgeName, expected: targets });
    }
  }
  return missing;
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (name === "node_modules") continue; walk(p, out); }
    else if (/\.ts$/.test(p)) out.push(p);
  }
  return out;
}

function loadBaseline() {
  try {
    const b = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
    return {
      edges: new Set((b.entries ?? []).map((e) => `${e.table}::${e.edge}`)),
      pointers: new Set((b.unenforced_pointers ?? []).map((e) => `${e.table}.${e.column}`)),
    };
  } catch {
    return { edges: new Set(), pointers: new Set() };
  }
}

function collect() {
  const sqlFiles = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql")).sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"));
  const sourceText = SOURCE_ROOTS.flatMap((r) => walk(r))
    .map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
  const polyTypes = discoverPolymorphicSourceTypes(sourceText);
  const parsed = buildEdgeGraph(sqlFiles);
  return {
    missing: findMissingEdges(parsed, REQUIRED_EDGES, polyTypes),
    pointers: findUnenforcedPointers(buildPointerMaps(sqlFiles)),
    polyTypes,
  };
}

function main() {
  const { missing, pointers, polyTypes } = collect();

  if (process.argv.includes("--report")) {
    console.log(JSON.stringify({ missing_edges: missing, unenforced_pointers: pointers, polymorphic_source_types: [...polyTypes].sort() }, null, 2));
    return;
  }

  const baseline = loadBaseline();
  const freshEdges = missing.filter((m) => !baseline.edges.has(`${m.table}::${m.edge}`));
  const freshPointers = pointers.filter((p) => !baseline.pointers.has(`${p.table}.${p.column}`));
  const drained = [
    ...[...baseline.edges].filter((k) => !missing.some((m) => `${m.table}::${m.edge}` === k)),
    ...[...baseline.pointers].filter((k) => !pointers.some((p) => `${p.table}.${p.column}` === k)),
  ];

  if (freshEdges.length > 0 || freshPointers.length > 0) {
    console.error("verify-linkage-required-edges FAILED — §10a linkage law:\n");
    for (const m of freshEdges) {
      console.error(`  ${m.table}`);
      console.error(`     missing edge "${m.edge}" — expected an FK to one of: ${m.expected.join(" | ")}\n`);
    }
    for (const p of freshPointers) {
      console.error(`  ${p.table}.${p.column}`);
      console.error(`     UNENFORCED POINTER — a money-critical uuid with no FOREIGN KEY. It accepts any`);
      console.error(`     value and dangles when its target is removed: wired in a column list, not in the DB.\n`);
    }
    console.error("One economic fact must be wired through every module and account it touches.");
    console.error("Add the FK (and the poster/route that populates it) in THIS PR, or add a baseline");
    console.error("entry with a tracked reason if the gap is pre-existing and scheduled.");
    process.exit(1);
  }

  if (drained.length > 0) {
    console.log("verify-linkage-required-edges: NOTE — these baseline gaps are now wired; remove them:");
    for (const k of drained) console.log(`  • ${k}`);
  }
  console.log(
    `verify-linkage-required-edges: OK — ${Object.keys(REQUIRED_EDGES).length} economic facts checked, ` +
      `${missing.length} linkage gaps + ${pointers.length} unenforced pointers baselined, 0 new.`
  );
}

function selftest() {
  const failures = [];
  const parsed = buildEdgeGraph([
    `CREATE TABLE IF NOT EXISTS accounting.expenses (
       id uuid, driver_id uuid REFERENCES mdata.drivers(id), je_id uuid REFERENCES accounting.journal_entries(id)
     );`,
    `ALTER TABLE accounting.expenses ADD COLUMN unit_id uuid REFERENCES mdata.units(id);`,
  ]);
  const have = parsed.graph.get("accounting.expenses") ?? new Set();
  if (!have.has("mdata.drivers")) failures.push("missed inline REFERENCES in CREATE TABLE");
  if (!have.has("mdata.units")) failures.push("missed REFERENCES in ALTER TABLE");
  if (!have.has("accounting.journal_entries")) failures.push("missed second inline REFERENCES");

  const miss = findMissingEdges(parsed, { "accounting.expenses": REQUIRED_EDGES["accounting.expenses"] });
  if (miss.some((m) => m.edge === "gl")) failures.push("false-flagged a satisfied edge (gl)");
  if (!miss.some((m) => m.edge === "claim_or_matter")) failures.push("did not flag the missing claim_or_matter edge");

  // OVERREACH REGRESSION LOCK: a driverless / load-less / non-claim record is LAWFUL.
  if ("driver" in REQUIRED_EDGES["accounting.expenses"]) failures.push("overreach: expenses must not require driver (driverless vendor expense is lawful)");
  if ("load" in (REQUIRED_EDGES["accounting.bills"] ?? {})) failures.push("overreach: bills must not require load (shop/insurance/office bills are lawful)");
  if ("claim" in (REQUIRED_EDGES["legal.matters"] ?? {})) failures.push("overreach: legal.matters must not require claim (non-insurance matters are lawful)");

  // ALTERNATIVE-TARGET satisfaction.
  const alt = findMissingEdges(
    { graph: new Map([["insurance.claim", new Set(["insurance.policy", "mdata.drivers", "mdata.assets", "safety.incidents", "accounting.bills"])]]), created: new Set(["insurance.claim"]) },
    { "insurance.claim": REQUIRED_EDGES["insurance.claim"] }
  );
  if (alt.length > 0) failures.push("alternative-target satisfaction not honored: " + alt.map((a) => a.edge).join(","));

  // ZERO-FK REGRESSION LOCK: a table with no outbound FK at all is the WORST break. A prior
  // revision skipped it (`if (have.size === 0) continue`), exempting the most orphaned tables.
  const zero = findMissingEdges({ graph: new Map(), created: new Set(["legal.matters"]) }, { "legal.matters": REQUIRED_EDGES["legal.matters"] });
  if (zero.length === 0) failures.push("zero-FK table was exempted instead of reported (the worst break must not be a skip)");

  // DEAD-DETECTOR REGRESSION LOCK: the unenforced-pointer detector must actually RUN. A prior
  // revision defined it, never called it, and removed three real findings that deferred to it.
  const ptrs = findUnenforcedPointers(buildPointerMaps([
    `CREATE TABLE IF NOT EXISTS accounting.probe (
       id uuid, vendor_id uuid, bill_id uuid REFERENCES accounting.bills(id), driver_note text
     );`,
  ]));
  if (!ptrs.some((p) => p.column === "vendor_id")) failures.push("unenforced pointer (vendor_id, no FK) not detected");
  if (ptrs.some((p) => p.column === "bill_id")) failures.push("false positive: an FK-enforced pointer was flagged");
  // Read THIS FILE off disk (real repo source, not a fixture) and confirm findUnenforcedPointers is
  // actually wired into collect()'s run path, not just defined/exported and left uncalled.
  const selfSrc = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const collectBody = selfSrc.slice(selfSrc.indexOf("function collect()"), selfSrc.indexOf("function main()"));
  const wired = collectBody.includes("findUnenforcedPointers");
  if (!wired) failures.push("findUnenforcedPointers is not called by main() — the detector would ship dead");

  // JUNCTION TIGHTENING: a wide table referencing both sides is not a junction.
  const wide = new Map([
    ["a.record", new Set()],
    ["z.kitchen_sink", new Set(["a.record", "b.target", "c.x", "d.y", "e.z", "f.w"])],
  ]);
  const stillMissing = findMissingEdges({ graph: wide, created: new Set(["a.record"]) }, { "a.record": { link: ["b.target"] } });
  if (stillMissing.length === 0) failures.push("a wide non-junction table silenced a real break");

  // POLYMORPHIC satisfaction must be derived from code literals, not granted by table name.
  const poly = discoverPolymorphicSourceTypes(`postingType({ source_transaction_type: 'bill' })`);
  if (!poly.has("bill")) failures.push("polymorphic source-type discovery failed on a real literal");
  if (poly.has("fuel_transaction")) failures.push("polymorphic discovery invented a type that is not in code");

  if (failures.length) {
    console.error("verify-linkage-required-edges SELFTEST FAILED:");
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log("verify-linkage-required-edges --selftest OK");
}

// Import-safe: importing a helper must not run the guard (or inherit its process.exit).
const INVOKED_DIRECTLY =
  process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("verify-linkage-required-edges.mjs");
if (INVOKED_DIRECTLY) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
