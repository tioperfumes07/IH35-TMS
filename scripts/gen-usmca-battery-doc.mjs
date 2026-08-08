#!/usr/bin/env node
/**
 * Generate docs/audit/USMCA-EXHAUSTIVE-BATTERY.md — the enumeration that must exist BEFORE anything is
 * created, per the owner's battery directive.
 *
 * DERIVED, never hand-written. The surface list comes from the code
 * (scripts/usmca-create-surface-inventory.mjs), so it cannot drift from what the server actually
 * serves, and re-running this regenerates the matrix rather than editing it by hand.
 *
 * Usage: node scripts/gen-usmca-battery-doc.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/audit/USMCA-EXHAUSTIVE-BATTERY.md");

// Write the inventory to a temp file rather than /dev/stdout: the inventory script also prints a human
// summary, so parsing its stdout mixes JSON with plain text.
const TMP = join(ROOT, ".tmp-usmca-inventory.json");
execSync(`node scripts/usmca-create-surface-inventory.mjs --json ${TMP}`, {
  cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
});
const inv = JSON.parse(readFileSync(TMP, "utf8"));

/** Module = the first meaningful segment after the version prefix. */
function moduleOf(path) {
  const segs = path.replace(/^\/api\/(v\d+\/)?/, "").split("/").filter(Boolean);
  return segs[0] ?? "(root)";
}

const all = [...inv.create_surfaces, ...inv.nested_create_surfaces];
const byModule = new Map();
for (const e of all) {
  const m = moduleOf(e.path);
  if (!byModule.has(m)) byModule.set(m, []);
  byModule.get(m).push(e);
}

const modules = [...byModule.entries()].sort((a, b) => b[1].length - a[1].length);

const lines = [];
lines.push("# USMCA EXHAUSTIVE TRANSACTION BATTERY — surface → created → registered → gap");
lines.push("");
lines.push("> **GENERATED — do not hand-edit.** Produced by `scripts/gen-usmca-battery-doc.mjs` from");
lines.push("> `scripts/usmca-create-surface-inventory.mjs`, which reads the route files themselves. The list");
lines.push("> therefore cannot drift from what the server actually serves.");
lines.push("");
lines.push("**Entity: USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`** (`USMCA Freight Solutions Inc`, operating_carrier, active — verified on the prod branch).");
lines.push("");
lines.push("## Scope and counts");
lines.push("");
lines.push(`| bucket | n | meaning |`);
lines.push(`|---|---:|---|`);
lines.push(`| **create** (collection POST) | ${inv.by_kind.create ?? 0} | \`POST /api/v1/mdata/customers\` — creates a top-level record |`);
lines.push(`| **nested create** (child POST) | ${inv.by_kind.nested ?? 0} | \`POST /…/loads/:id/stops\` — needs its parent to exist first, so it is ordered after it |`);
lines.push(`| action (NOT a create) | ${inv.by_kind.action ?? 0} | \`/:id/approve\`, \`/scan\` — operates on an existing row |`);
lines.push(`| infra (NOT a surface) | ${inv.by_kind.infra ?? 0} | auth, webhooks, feature flags, integrations plumbing |`);
lines.push(`| **TOTAL POST endpoints** | ${inv.total_post_endpoints} | |`);
lines.push(`| UI files with \`+ Create\`/\`+ Book\` | ${inv.ui_create_surfaces.length} | product vocabulary is locked to those two labels, which is what makes the UI side greppable |`);
lines.push("");
lines.push("Counting the 200 actions as create-surfaces would inflate the denominator and make the coverage");
lines.push("report a lie, so every endpoint lands in exactly one bucket and nothing is silently dropped.");
lines.push("");
lines.push("## ⚠ TEST-DATA TAGGING — the requested mechanism does not exist");
lines.push("");
lines.push("The directive says to tag every created row `is_test_data=true` / `is_sample`. **Verified against the");
lines.push("prod branch: `is_test_data` exists on exactly THREE objects — `audit.scenario_status`,");
lines.push("`audit.v_scenario_status_current`, `driver_finance.driver_pay_rates` — and `is_sample` does not exist");
lines.push("anywhere.** No transaction table (loads, invoices, bills, work_orders, claims, settlements…) has");
lines.push("either column, so the tag cannot be written as specified without a migration across dozens of tables.");
lines.push("");
lines.push("**Substitute, matching existing precedent on prod** (`USMCA-TEST-BILL-05`, `CC3-VOIDTEST-20260807-01`,");
lines.push("`TEST-BILL-0806-A` are all real rows created this way):");
lines.push("");
lines.push("1. every row created by this battery carries the marker **`CC2-BATTERY-20260807`** in its");
lines.push("   human-readable identifier (bill_number / load_number / reference / name), and");
lines.push("2. every created row's **UUID is recorded in the manifest below**, so the whole set is isolatable and");
lines.push("   voidable by id, not by guessing at a naming convention.");
lines.push("");
lines.push("That satisfies the stated intent — *isolatable and voidable before Monday* — which the literal");
lines.push("column cannot. Flagged rather than silently substituted.");
lines.push("");
lines.push("## Dependency order (creation follows this, not the table order)");
lines.push("");
lines.push("1. **masters / catalogs** — customer, vendor, account, item, catalog rows");
lines.push("2. **operational** — load → assign USMCA driver + USMCA-leased unit → dispatch → deliver → POD/BOL");
lines.push("3. **money** — invoice/AR, bill/AP, expense, fuel, settlement, advance, deduction, escrow, WO, factoring, claim, fine, bank txn + match, transfer, lease");
lines.push("");
lines.push("A missing account is CREATED (additive, entity-scoped, sensible default, `qbo_map` null) rather than");
lines.push("blocking the wire — per the owner's standing instruction.");
lines.push("");
lines.push("## Coverage matrix");
lines.push("");
lines.push("`created` / `registered` are filled by the battery run. `registered` means the record produced its");
lines.push("expected downstream effect (balanced JE, both-way link) — that is CC-3's verification, handed over");
lines.push("after creation; a GL/posting failure goes to CC-1.");
lines.push("");
for (const [mod, eps] of modules) {
  lines.push(`### ${mod} — ${eps.length} create-surface(s)`);
  lines.push("");
  lines.push("| kind | endpoint | route file | created | registered | gap |");
  lines.push("|---|---|---|---|---|---|");
  for (const e of eps.sort((a, b) => a.path.localeCompare(b.path))) {
    lines.push(`| ${e.kind} | \`${e.path}\` | \`${e.file}:${e.line}\` | — | — | — |`);
  }
  lines.push("");
}
lines.push("## Known create-surface failures already proven live (2026-08-07)");
lines.push("");
lines.push("| surface | live result | lane |");
lines.push("|---|---|---|");
lines.push("| `GET/POST /api/v1/catalogs/maintenance/services` | **404 — route not found** on the deployed API | CC-2 |");
lines.push("| fleet catalog create | **500** — reported as a trailing `--` SQL comment | CC-2 |");
lines.push("| payment-terms creator | **42701 duplicate column** | CC-2 / lists |");
lines.push("| `GET /api/v1/catalogs/fleet/tire-positions` | 200 `{rows:[],total:0}` — reachable, empty | — |");
lines.push("| `GET /api/v1/catalogs/maintenance/parts` | 200 with USMCA rows — reachable and populated | — |");
lines.push("");
writeFileSync(OUT, `${lines.join("\n")}\n`);
console.log(`wrote ${relative(ROOT, OUT)} — ${all.length} create-surfaces across ${modules.length} modules`);
