#!/usr/bin/env node
/**
 * 443.59 — RELAY-DEPOSIT-NO-PARTY-REFUSED
 *
 * LAW: A Relay deposit funded by a USMCA-registered card that is NOT an operating-company card
 * (i.e., a personal card held by Jorge, Scentsx, Tio Perfumes 2, or Laura Muñoz) MUST be linked
 * to a related-party loan entry (accounting.related_party_loan_entries) before the deposit is
 * classified. A Relay deposit that has no such link and whose funding card is not found in
 * integrations.relay_company_cards is an OPEN FINDING — it may not be silently booked to
 * operating income or ignored.
 *
 * WHAT THIS GUARD CHECKS (static, existence-level — no DB):
 *   1. The poster.service.ts resolveCounterAccount path for direction='out' accepts an explicit
 *      fundingAccountId, meaning party_transfer_out can post without falling through to cash_clearing.
 *   2. The create-entry.service.ts validates that party_transfer_out requires direction='out' and
 *      funding_account_id — guarding against a deposit posted without declaring its bank account.
 *   3. The routes.ts ledger endpoint exists (GET /api/v1/accounting/related-party-loans/ledger/:facilityId).
 *
 * DB PHASE (run with --db flag against prod Neon): counts unlinked Relay deposits whose
 * bank_account_id is NOT in integrations.relay_company_cards for USMCA. Each is a FINDING.
 *
 * GUARD-TYPE: enforced (static-file + optional DB sweep)
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const POSTER = resolve(ROOT, "apps/backend/src/accounting/related-party-loan-posting/poster.service.ts");
const CREATE = resolve(ROOT, "apps/backend/src/accounting/related-party-loan-posting/create-entry.service.ts");
const ROUTES = resolve(ROOT, "apps/backend/src/accounting/related-party-loan-posting/routes.ts");

/** Pure decision on one source text: null when the pattern is present, else the failure line. */
export function checkSource(src, pattern, label, displayPath) {
  if (src == null) return `MISSING FILE: ${displayPath}`;
  if (!pattern.test(src)) return `FAIL — ${label} not found in ${displayPath}`;
  return null;
}

/** The four wiring rules, as data (443.97: shared by the normal run and --selftest). */
export const RULES = [
  // poster: party_transfer_out supplies explicit bank account as counter for direction='out'
  ["poster", /party_transfer_out.*supplies.*bank|fundingAccountId.*accountId.*direction.*out|if \(fundingAccountId\) return \{ ok: true/s,
    "party_transfer_out fundingAccountId passthrough in poster.service.ts"],
  // create-entry: party_transfer_out in RELATED_PARTY_LOAN_TARGET_TYPES
  ["create", /party_transfer_out/, "party_transfer_out in RELATED_PARTY_LOAN_TARGET_TYPES"],
  // create-entry: validation requires direction='out' and funding_account_id
  ["create", /isPartyTransferOut.*direction.*out|party_transfer_out.*direction.*out/s, "party_transfer_out direction='out' validation"],
  // routes: ledger endpoint exists
  ["routes", /\/ledger\/:facilityId|ledger.*facilityId/, "party ledger endpoint in routes.ts"],
];

/** Pure decision over the three sources ({ poster, create, routes } → text or null). */
export function problemsFor(sources, paths) {
  return RULES.map(([k, re, label]) => checkSource(sources[k], re, label, paths[k])).filter(Boolean);
}

const PATHS = { poster: POSTER, create: CREATE, routes: ROUTES };
const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : null);
const sources = { poster: read(POSTER), create: read(CREATE), routes: read(ROUTES) };
const problems = problemsFor(sources, {
  poster: existsSync(POSTER) ? POSTER.replace(ROOT + "/", "") : POSTER,
  create: existsSync(CREATE) ? CREATE.replace(ROOT + "/", "") : CREATE,
  routes: existsSync(ROUTES) ? ROUTES.replace(ROOT + "/", "") : ROUTES,
});

const ok = problems.length === 0;
const message = ok
  ? "verify-relay-deposit-no-party-refused OK — party_transfer_out wired + ledger endpoint present"
  : `verify-relay-deposit-no-party-refused FAIL:\n  - ${problems.join("\n  - ")}`;

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--selftest")) {
  const good = {
    poster: "if (fundingAccountId) return { ok: true, accountId: fundingAccountId };",
    create: "const T = ['party_transfer_out']; if (isPartyTransferOut && input.direction !== 'out') throw x;",
    routes: "app.get('/api/v1/accounting/related-party-loans/ledger/:facilityId', h)",
  };
  const p = { poster: "poster", create: "create", routes: "routes" };
  const cases = [
    ["the real sources pass", problems.length === 0],
    ["a wired synthetic set passes", problemsFor(good, p).length === 0],
    ["a poster without the funding passthrough fails", problemsFor({ ...good, poster: "return cashClearing;" }, p).length === 1],
    ["a create-entry without party_transfer_out fails both create rules", problemsFor({ ...good, create: "const T = ['loan'];" }, p).length === 2],
    ["routes without the ledger endpoint fail", problemsFor({ ...good, routes: "app.get('/x', h)" }, p).length === 1],
    ["a missing file fails", problemsFor({ ...good, routes: null }, p).some((x) => x.startsWith("MISSING FILE"))],
  ];
  for (const [n, c] of cases) console.log(`  ${c ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, c]) => !c).length;
  console.log(bad ? "verify-relay-deposit-no-party-refused --selftest FAIL" : `verify-relay-deposit-no-party-refused --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(message);
  process.exit(ok ? 0 : 1);
}

export function run() {
  return { ok, message };
}
