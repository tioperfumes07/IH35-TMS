#!/usr/bin/env node
/**
 * GUARD — verify-scenario-tracker-live-binding
 *
 * THE FAILURES THIS PINS DOWN, all of which were live in this codebase before this PR:
 *
 * 1. KEY DRIFT. The frontend registry used `hop.pod_bol`; the backend used `hop.evidence`. They never
 *    bound, so that dot could not go live no matter what the data said, and nothing failed — it simply
 *    sat grey forever. Every FE key must exist in the backend registry.
 *
 * 2. UNPROBED SLICES. The backend registry held only the 9 hops while the FE rendered 24. The 15 Part B
 *    cards therefore had no backend entry at all and could never show live status.
 *
 * 3. IMPORTED ROWS COUNTED AS PROOF — the dangerous one. Prod holds 16,245 QuickBooks-cloned bills and
 *    11,976 cloned invoices against 5 and 8 TMS-native ones. A probe that counts the whole table
 *    certifies the TMS AP and invoicing flows GREEN on work the TMS never performed. For a board whose
 *    entire purpose is "no stale green", that is the worst possible defect: authoritative, freshly
 *    timestamped, and wrong. Every money probe must carry its origin discriminator.
 *
 * 4. MASKED-CONNECTION CERTIFICATION. Under FORCED RLS a `0` can mean "this connection cannot see",
 *    not "there is no data" — observed live while building this, on the same client, varying between
 *    runs. A certifier that trusts those zeroes writes a false all-red board and flips passed slices to
 *    'fix' as though they regressed. Both writers must assert a positive control before writing.
 *
 * METHOD: static. Comments are stripped before structural assertions so this header cannot satisfy or
 * trip anything. --selftest mutates the REAL sources and requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-scenario-tracker-live-binding";
const BACKEND = "apps/backend/src/home/scenario-registry.ts";
const FE = "apps/frontend/src/pages/program/scenario-tracker/registry.ts";
const CERTIFIER = "scripts/scenario-certify.mjs";
const SCOREBOARD = "scripts/scoreboard-from-live.mjs";
const HOME = "apps/frontend/src/pages/program/scenario-tracker/ScenarioTrackerHome.tsx";

/** Money probes that MUST exclude imported rows, and the discriminator each one needs. */
const ORIGIN_REQUIRED = [
  { key: "hop.invoice", needle: "i.qbo_invoice_id IS NULL", why: "11,976 of 11,984 invoices are QBO clones" },
  { key: "scenario.ap", needle: "b.qbo_bill_id IS NULL", why: "16,245 of 16,250 bills are QBO clones" },
  { key: "scenario.customer", needle: "c.qbo_customer_id IS NULL", why: "2,689 of 2,696 customers are QBO clones" },
  { key: "scenario.coa", needle: "a.qbo_account_id IS NULL", why: "1,295 of 1,442 accounts are QBO clones" },
  { key: "scenario.fuel", needle: "f.load_id IS NOT NULL", why: "all 1,548 fuel rows are CSV-imported" },
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}
function keysIn(src) {
  return new Set(Array.from(src.matchAll(/"((?:hop|scenario)\.[a-z_]+)"/g)).map((m) => m[1]));
}

function check(sources) {
  const errors = [];
  const backendRaw = sources[BACKEND];
  const feRaw = sources[FE];
  const backend = stripComments(backendRaw ?? "");

  // 1 + 2 — every FE key is bound in the backend registry.
  const beKeys = keysIn(backend);
  const feKeys = keysIn(stripComments(feRaw ?? ""));
  for (const k of feKeys) {
    if (!beKeys.has(k)) {
      errors.push(
        `${BACKEND}: frontend renders "${k}" but the backend registry has no entry — the dot can never ` +
          `show live status (this is exactly how hop.pod_bol/hop.evidence drifted).`
      );
    }
  }
  if (feKeys.size && beKeys.size < feKeys.size) {
    errors.push(`${BACKEND}: ${beKeys.size} backend slices vs ${feKeys.size} rendered by the FE — Part B unprobed.`);
  }
  if (beKeys.has("hop.evidence")) {
    errors.push(`${BACKEND}: 'hop.evidence' is back — the FE uses 'hop.pod_bol'; these must not diverge again.`);
  }

  // 3 — imported rows must never count as proof a TMS flow works.
  for (const { key, needle, why } of ORIGIN_REQUIRED) {
    const at = backend.indexOf(`"${key}"`);
    if (at === -1) {
      errors.push(`${BACKEND}: slice "${key}" is missing.`);
      continue;
    }
    const nextKey = backend.slice(at + key.length + 2).search(/"(?:hop|scenario)\.[a-z_]+"/);
    const block = backend.slice(at, nextKey === -1 ? undefined : at + key.length + 2 + nextKey);
    if (!block.includes(needle)) {
      errors.push(
        `${BACKEND}: "${key}" does not restrict to TMS-native rows (expected \`${needle}\`). ${why} — ` +
          `counting them certifies the flow GREEN on work the TMS never did.`
      );
    }
  }

  // 4 — both live writers must refuse to write from a masked connection.
  for (const f of [CERTIFIER, SCOREBOARD]) {
    const src = stripComments(sources[f] ?? "");
    if (!src) {
      errors.push(`${f}: missing — the tracker has no automatic writer.`);
      continue;
    }
    if (!/assertNotMasked/.test(src)) {
      errors.push(
        `${f}: no masking assertion. Under FORCED RLS a 0 can mean "masked", so writing without a ` +
          `positive control publishes a false all-zero board.`
      );
    }
    if (!/bypass_rls'\s*,\s*'lucia'\s*,\s*false/.test(src)) {
      errors.push(
        `${f}: the bypass must be SESSION-scoped (third arg false). Transaction-local is discarded ` +
          `between the implicit transactions of later queries, and every probe silently reads 0.`
      );
    }
    // Match the named form only. An earlier version also tried to catch a bare trailing `, true]` in
    // the argument list, but that alternative was unanchored (CodeQL js/regex/missing-regexp-anchor)
    // and matched almost any array literal ending in true — a guard that fires on unrelated code gets
    // muted, and a muted guard protects nothing. The certifier passes is_test_data by name, so the
    // named form is the one that matters.
    if (/is_test_data\s*[:=]\s*true\b/.test(src) && /set_scenario_status/.test(src)) {
      errors.push(`${f}: appears to certify with is_test_data=true — a fixture cert must never move a real dot.`);
    }
  }

  // 5 — every rendered slice must click through to a real in-app route (V3). Dead titles = tracker theater.
  const home = sources[HOME] ?? "";
  if (!/to=\{hop\.href\}/.test(home)) {
    errors.push(`${HOME}: Part A hops must Link with to={hop.href} — titles were dead before this pin.`);
  }
  if (!/to=\{item\.href\}/.test(home)) {
    errors.push(`${HOME}: Part B cards must Link with to={item.href} — titles were dead before this pin.`);
  }
  if (!/useState<EntityScope>\("USMCA"\)/.test(home)) {
    errors.push(`${HOME}: default entity must be USMCA (launch law — do not default ALL/TRANSP).`);
  }
  const feSrc = sources[FE] ?? "";
  const feKeysForHref = keysIn(stripComments(feSrc));
  for (const k of feKeysForHref) {
    const needle = `key: "${k}"`;
    const at = feSrc.indexOf(needle);
    if (at === -1) {
      errors.push(`${FE}: slice "${k}" key not found as key: "…" (href pin).`);
      continue;
    }
    const rest = feSrc.slice(at + needle.length);
    const next = rest.search(/key:\s*"(?:hop|scenario)\./);
    const block = rest.slice(0, next === -1 ? undefined : next);
    if (!/href:\s*"\/[^"]+"/.test(block)) {
      errors.push(`${FE}: slice "${k}" has no href:"/…" — the tracker cannot open the wizard that performs the hop.`);
    }
  }

  return errors;
}

function loadAll() {
  const out = {};
  for (const f of [BACKEND, FE, CERTIFIER, SCOREBOARD, HOME]) {
    try {
      out[f] = readFileSync(f, "utf8");
    } catch {
      out[f] = "";
    }
  }
  return out;
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real sources do not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const mutations = [
    ["pod_bol key reverted to hop.evidence", (s) => ({ ...s, [BACKEND]: s[BACKEND].split('"hop.pod_bol"').join('"hop.evidence"') })],
    ["invoice probe counts QBO clones", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND i.qbo_invoice_id IS NULL", "") })],
    ["bills probe counts QBO clones", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("AND b.qbo_bill_id IS NULL", "") })],
    ["fuel probe drops the load link", (s) => ({ ...s, [BACKEND]: s[BACKEND].replace("WHERE f.load_id IS NOT NULL", "WHERE true") })],
    ["certifier loses its masking guard", (s) => ({ ...s, [CERTIFIER]: s[CERTIFIER].split("assertNotMasked").join("skipCheck") })],
    ["scoreboard loses its masking guard", (s) => ({ ...s, [SCOREBOARD]: s[SCOREBOARD].split("assertNotMasked").join("skipCheck") })],
    ["certifier bypass becomes transaction-local", (s) => ({ ...s, [CERTIFIER]: s[CERTIFIER].replace("'app.bypass_rls','lucia',false", "'app.bypass_rls','lucia',true") })],
    ["a Part B slice is dropped", (s) => ({ ...s, [BACKEND]: s[BACKEND].split('"scenario.escrow"').join('"scenario.gone"') })],
    ["hop.book loses its href", (s) => ({ ...s, [FE]: s[FE].replace('href: "/dispatch/book-load"', "href_missing: true") })],
    ["hop Link wiring removed", (s) => ({ ...s, [HOME]: s[HOME].replace("to={hop.href}", "to=\"/program\"") })],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (JSON.stringify(broken) === JSON.stringify(real)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) binding the tracker to live data:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
    `${LABEL} PASS — all FE keys bound, money probes exclude imported rows, both live writers refuse ` +
      `to publish from a masked connection, and every slice hrefs a live in-app route.`
);
