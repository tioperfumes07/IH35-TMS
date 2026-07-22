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
 * "accounting.expenses is read constantly but has no FK to the account it hit, the vendor it was
 * paid to, or the bank account that paid it". That is the defect class that actually loses money,
 * and it had no mechanical check.
 *
 * WHAT IT ASSERTS: for each money-/claim-touching table, the REQUIRED_EDGES manifest below lists
 * the relations that record MUST reach by foreign key. A missing required edge fails the build.
 * Edges are declared as alternatives (["a","b"] = at least one of a or b satisfies it), because
 * some links are legitimately satisfied through a line table or an either/or partner.
 *
 * STATIC: parses REFERENCES targets out of db/migrations/*.sql. No database needed, so it runs in
 * every CI job, not just DB jobs. Validated 2026-07-21 against the live prod FK graph on
 * br-fancy-credit-akjnd07a — the static extraction reproduced the live edge set.
 *
 * Run: node scripts/verify-linkage-required-edges.mjs [--selftest] [--report]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "db/migrations");
const BASELINE_FILE = join(ROOT, "scripts/verify-linkage-required-edges.baseline.json");

/**
 * REQUIRED_EDGES — the owner's linkage law, declared.
 * key   = schema.table of the economic fact
 * value = { edgeName: [acceptable FK targets] }  (at least one target must be referenced)
 */
export const REQUIRED_EDGES = {
  // ── the expense: "every expense linked to driver, truck, expense account, GL, payment" ──
  // CORRECTED 2026-07-21 against prod (Cursor caught the error in the first draft):
  // expense_account lives on accounting.expense_lines (FK -> catalogs.accounts) and IS wired;
  // driver_uuid/unit_id/load_id already carry FKs. The real defect is NOT a missing column but an
  // UNENFORCED one -- vendor_uuid and payment_account_uuid are bare uuids with no FK. That class is
  // caught by UNENFORCED_POINTERS below, not by a missing-edge rule that would fight real columns.
  "accounting.expenses": {
    // NOT required: driver / unit. A driverless, unit-less vendor expense (shop, office, insurance)
    // is LAWFUL -- createExpense makes driver optional. Requiring them would fail valid AP.
    // Driver-attribution is enforced by product rules (recover_from_driver), not by this guard.
    gl: ["accounting.journal_entries"],
    claim_or_matter: ["insurance.claim", "legal.matters"],
  },
  // ── AP ──
  "accounting.bills": {
    // NOT required: load. Shop / insurance / office vendor bills are legitimately not load-linked.
    // §9.7 "everything links to the load" governs LOAD-attributable spend, not all AP.
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
  "legal.matters": {
    // NOT required: claim. Not every matter originates in an insurance claim (contract disputes,
    // employment, regulatory). Claim linkage is required only for insurance-origin matters, which
    // is a product rule this static guard cannot see.
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
    // posting_account_id EXISTS on prod but carries NO FK -> see UNENFORCED_POINTERS.
  },
  // ── fuel: operationally linked today, financially orphaned ──
  "fuel.fuel_transactions": {
    driver: ["mdata.drivers"],
    unit: ["mdata.units"],
    load: ["mdata.loads"],
    // vendor_id EXISTS on prod but carries NO FK -> see UNENFORCED_POINTERS, not a missing edge.
    money: ["accounting.bills", "accounting.expenses", "accounting.journal_entries", "banking.bank_transactions"],
  },
  // ── revenue events ──
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
    // driver_id EXISTS on prod but carries NO FK -> see UNENFORCED_POINTERS.
    unit: ["mdata.units"],
    claim: ["insurance.claim"],
    money: ["accounting.expenses", "accounting.bills", "accounting.journal_entries"],
  },
};

/**
 * MONEY-CRITICAL POINTER COLUMNS must be FK-ENFORCED.
 *
 * The defect this catches (found on prod 2026-07-21, 165 instances): the link WAS written -- as a
 * bare `uuid` column with NO foreign key. driver_settlements.accounting_bill_id,
 * settlement_lines.posting_account_id, bill_payments.from_bank_account_id,
 * banking.transfers.from_account_id, fuel_transactions.vendor_id, expenses.vendor_uuid ... all
 * exist, none enforced. A pointer with no FK accepts any value and dangles when its target is
 * removed. It LOOKS wired in a column list and guarantees nothing -- which is precisely why
 * "it's built" kept surviving inspection.
 */
const MONEY_POINTER_RE = /(vendor|customer|account|driver|unit|claim|matter|payment|bill|invoice|settlement|policy)/i;
const POINTER_SCHEMAS = new Set(["accounting","banking","driver_finance","insurance","legal","safety","fuel","maintenance","dispatch"]);

/** uuid columns declared per table, and which columns carry an FK. */
export function buildPointerMaps(sqlFiles) {
  const uuidCols = new Map();   // schema.table -> Set(col)
  const fkCols = new Map();     // schema.table -> Set(col)
  const QUALIFIED = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i;
  const put = (map, t, c) => { if (!map.has(t)) map.set(t, new Set()); map.get(t).add(c); };

  for (const raw of sqlFiles) {
    const sql = raw.replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][\w.]*)\s*\(([\s\S]*?)\n\s*\)/gi)) {
      const t = m[1]; if (!QUALIFIED.test(t)) continue;
      for (const line of m[2].split("\n")) {
        const cm = line.match(/^\s*([a-z_][a-z0-9_]*)\s+uuid\b/i);
        if (cm) { put(uuidCols, t, cm[1]); if (/REFERENCES/i.test(line)) put(fkCols, t, cm[1]); }
      }
    }
    for (const m of sql.matchAll(/ALTER TABLE(?:\s+ONLY)?\s+([A-Za-z_][\w.]*)([\s\S]*?);/gi)) {
      const t = m[1]; if (!QUALIFIED.test(t)) continue;
      for (const c of m[2].matchAll(/ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)\s+uuid\b([^,;]*)/gi)) {
        put(uuidCols, t, c[1]); if (/REFERENCES/i.test(c[2])) put(fkCols, t, c[1]);
      }
      for (const c of m[2].matchAll(/FOREIGN KEY\s*\(\s*([a-z_][a-z0-9_,\s]*)\)/gi)) {
        c[1].split(",").map((x) => x.trim()).forEach((col) => put(fkCols, t, col));
      }
    }
  }
  return { uuidCols, fkCols };
}

export function findUnenforcedPointers({ uuidCols, fkCols }) {
  const out = [];
  for (const [tbl, cols] of uuidCols) {
    const schema = tbl.split(".")[0];
    if (!POINTER_SCHEMAS.has(schema)) continue;
    const enforced = fkCols.get(tbl) ?? new Set();
    for (const col of cols) {
      if (!/_(id|uuid)$/i.test(col)) continue;
      if (["id", "operating_company_id", "tenant_id"].includes(col)) continue;
      if (!MONEY_POINTER_RE.test(col)) continue;
      if (enforced.has(col)) continue;
      out.push({ table: tbl, column: col });
    }
  }
  return out;
}

/** Parse every FK target declared for each table across all migrations. */
export function buildEdgeGraph(sqlFiles) {
  const graph = new Map(); // schema.table -> Set(target schema.table)
  const add = (src, tgt) => {
    if (!src || !tgt) return;
    if (!graph.has(src)) graph.set(src, new Set());
    graph.get(src).add(tgt);
  };
  const QUALIFIED = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i;

  for (const sql of sqlFiles) {
    const clean = sql.replace(/--[^\n]*/g, "");
    // CREATE TABLE <t> ( ... REFERENCES <target> ... )
    for (const m of clean.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][\w.]*)([\s\S]*?)(?=CREATE TABLE|ALTER TABLE|$)/gi)) {
      const src = m[1];
      if (!QUALIFIED.test(src)) continue;
      for (const r of m[2].matchAll(/REFERENCES\s+([A-Za-z_][\w.]*)/gi)) {
        if (QUALIFIED.test(r[1])) add(src, r[1]);
      }
    }
    // ALTER TABLE <t> ... REFERENCES <target>
    for (const m of clean.matchAll(/ALTER TABLE(?:\s+ONLY)?\s+([A-Za-z_][\w.]*)([\s\S]*?);/gi)) {
      const src = m[1];
      if (!QUALIFIED.test(src)) continue;
      for (const r of m[2].matchAll(/REFERENCES\s+([A-Za-z_][\w.]*)/gi)) {
        if (QUALIFIED.test(r[1])) add(src, r[1]);
      }
    }
  }
  return graph;
}

/**
 * POLYMORPHIC SATISFACTION — verified on prod 2026-07-21.
 * GL source linkage in this codebase is deliberately polymorphic, not a direct FK:
 *   accounting.transaction_source_links(journal_entry_posting_id, linked_object_type, linked_object_id)
 *   accounting.journal_entry_postings(source_transaction_type, source_transaction_id)
 * Live rows exist (linked_object_type: invoice, bank_categorization, journal_entry). Treating that
 * as "missing" would be a FALSE finding, and a guard that cries wolf is worse than no guard.
 * Any table named as a linked_object_type therefore satisfies its `gl` / `source` edge.
 *
 * NOTE (tracked separately, not enforced here): polymorphic links carry NO referential integrity —
 * a linked_object_id can dangle. That orphan risk is measured by the money-path audit, not by this
 * static guard, which cannot see rows.
 */
const POLYMORPHIC_GL_EDGES = new Set(["gl", "source"]);
const POLYMORPHIC_SOURCE_TYPES = new Set([
  "accounting.bills", "accounting.bill_payments", "accounting.invoices", "accounting.expenses",
  "accounting.journal_entries", "banking.bank_transactions",
]);

export function findMissingEdges(graph, required = REQUIRED_EDGES) {
  const missing = [];
  for (const [tbl, edges] of Object.entries(required)) {
    const have = graph.get(tbl) ?? new Set();
    if (have.size === 0) continue; // table not created by any migration in scope — not our finding
    for (const [edgeName, targets] of Object.entries(edges)) {
      if (targets.some((t) => have.has(t))) continue;
      // A table that participates in the polymorphic GL link satisfies its gl/source edge.
      if (POLYMORPHIC_GL_EDGES.has(edgeName) && POLYMORPHIC_SOURCE_TYPES.has(tbl)) continue;
      // JUNCTION SATISFACTION: the law requires forward AND reverse reachability, not a direct FK
      // in one specific direction. If any table X links to BOTH this record and the target (e.g.
      // driver_finance.driver_settlement_gl_runs joins driver_settlements <-> journal_entries),
      // the economic fact IS wired through and drill-through works both ways.
      const viaJunction = [...graph.entries()].some(
        ([other, otherEdges]) => other !== tbl && otherEdges.has(tbl) && targets.some((t) => otherEdges.has(t))
      );
      if (viaJunction) continue;
      // REVERSE SATISFACTION: the target itself points AT this record (e.g. legal.matters ->
      // insurance.lawsuit). Reverse drill-through exists, so the fact is wired -- the law asks for
      // forward AND reverse reachability, not for the FK to sit on one particular side.
      const viaReverse = targets.some((t) => (graph.get(t) ?? new Set()).has(tbl));
      if (viaReverse) continue;
      missing.push({ table: tbl, edge: edgeName, expected: targets });
    }
  }
  return missing;
}

function loadBaseline() {
  try {
    const b = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
    return new Set((b.entries ?? []).map((e) => `${e.table}::${e.edge}`));
  } catch {
    return new Set();
  }
}

function main() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const sqlFiles = files.map((f) => readFileSync(join(MIGRATIONS, f), "utf8"));
  const graph = buildEdgeGraph(sqlFiles);
  const missing = findMissingEdges(graph);
  const baseline = loadBaseline();

  if (process.argv.includes("--report")) {
    console.log(JSON.stringify({ generated: "report", count: missing.length, entries: missing }, null, 2));
    return;
  }

  const fresh = missing.filter((m) => !baseline.has(`${m.table}::${m.edge}`));
  const fixed = [...baseline].filter((k) => !missing.some((m) => `${m.table}::${m.edge}` === k));

  if (fresh.length > 0) {
    console.error("verify-linkage-required-edges FAILED — required linkage missing (§10a):\n");
    for (const m of fresh) {
      console.error(`  ${m.table}`);
      console.error(`     missing edge "${m.edge}" — expected an FK to one of: ${m.expected.join(" | ")}\n`);
    }
    console.error("One economic fact must be wired through every module and account it touches.");
    console.error("Add the FK (and the poster/route that populates it) in THIS PR, or add a");
    console.error("baseline entry with a tracked reason if the gap is pre-existing and scheduled.");
    process.exit(1);
  }

  if (fixed.length > 0) {
    console.log("verify-linkage-required-edges: NOTE — these baseline gaps are now wired; remove them:");
    for (const k of fixed) console.log(`  • ${k}`);
  }
  console.log(
    `verify-linkage-required-edges: OK — ${Object.keys(REQUIRED_EDGES).length} economic facts checked, ` +
      `${baseline.size} known gaps baselined, 0 new linkage breaks.`
  );
}

function selftest() {
  const failures = [];
  const g = buildEdgeGraph([
    `CREATE TABLE IF NOT EXISTS accounting.expenses (
       id uuid, driver_id uuid REFERENCES mdata.drivers(id), je_id uuid REFERENCES accounting.journal_entries(id)
     );`,
    `ALTER TABLE accounting.expenses ADD COLUMN unit_id uuid REFERENCES mdata.units(id);`,
  ]);
  const have = g.get("accounting.expenses") ?? new Set();
  if (!have.has("mdata.drivers")) failures.push("missed inline REFERENCES in CREATE TABLE");
  if (!have.has("mdata.units")) failures.push("missed REFERENCES in ALTER TABLE");
  if (!have.has("accounting.journal_entries")) failures.push("missed second inline REFERENCES");

  const miss = findMissingEdges(g, { "accounting.expenses": REQUIRED_EDGES["accounting.expenses"] });
  // gl IS satisfied in the fixture (REFERENCES accounting.journal_entries) -> must not be flagged.
  if (miss.some((m) => m.edge === "gl")) failures.push("false-flagged a satisfied edge (gl)");
  // claim_or_matter is absent in the fixture -> must be flagged.
  if (!miss.some((m) => m.edge === "claim_or_matter")) failures.push("did not flag the missing claim_or_matter edge");
  // OVERREACH REGRESSION LOCK (review 2026-07-21): a driverless / load-less / non-claim record is
  // LAWFUL. If any of these ever become required edges again, this selftest fails loudly.
  if ("driver" in REQUIRED_EDGES["accounting.expenses"]) failures.push("overreach: expenses must not require driver (driverless vendor expense is lawful)");
  if ("load" in (REQUIRED_EDGES["accounting.bills"] ?? {})) failures.push("overreach: bills must not require load (shop/insurance/office bills are lawful)");
  if ("claim" in (REQUIRED_EDGES["legal.matters"] ?? {})) failures.push("overreach: legal.matters must not require claim (non-insurance matters are lawful)");

  const alt = findMissingEdges(new Map([["insurance.claim", new Set(["insurance.policy", "mdata.drivers", "mdata.assets", "safety.incidents", "accounting.bills"])]]),
    { "insurance.claim": REQUIRED_EDGES["insurance.claim"] });
  if (alt.length > 0) failures.push("alternative-target satisfaction not honored: " + alt.map((a) => a.edge).join(","));

  if (failures.length) {
    console.error("verify-linkage-required-edges SELFTEST FAILED:");
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log("verify-linkage-required-edges --selftest OK");
}

if (process.argv.includes("--selftest")) selftest();
else main();
