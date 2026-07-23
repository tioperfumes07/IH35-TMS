#!/usr/bin/env node
/**
 * verify-banking-relay-tab-honesty.mjs
 *
 * ROOT FACT (re-derived on EVERY run from db/migrations + apps/backend/src — never hardcoded):
 *
 *   `banking.bank_accounts.is_relay` is a PHANTOM column.
 *     - No migration in db/migrations/ ever ADDs it to banking.bank_accounts
 *       (0072 creates the table; 0169/0177/202607121000/202606280100 add the only real columns).
 *     - Nothing anywhere WRITES it true. The only occurrences in the whole repo are READS /
 *       projections inside the self-disabling view 0044_p3_t11_9_banking_rebuild.sql:
 *       `a.is_relay` (real-account arm) and four literal `false AS is_relay` (virtual arms).
 *     - The real, migration-backed Relay identifier is
 *       catalogs.accounts.system_purpose = 'relay_fuel_wallet'  ->  banking.bank_accounts.ledger_account_id
 *       (see 202607290000_relay_internal_bank_seed.sql, 202607470000_relay_wallet_banking_registration.sql,
 *       apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed.service.ts).
 *       views.banking_account_tiles does NOT project ledger_account_id or system_purpose, so the
 *       /api/v1/banking/account-tiles payload cannot express "this tile is Relay" at all today.
 *
 * INVARIANT ENFORCED while `is_relay` is unwritten — the UI must not treat it as populated data:
 *
 *   R1  apps/frontend/src/api/banking.ts must document is_relay as unpopulated, so no consumer
 *       silently trusts it as a discriminator.
 *   R2  No frontend file may look a Relay tile UP by is_relay (`.find(t => t.is_relay)`).
 *       That expression is *provably* always `undefined`, so any caller that then selects an
 *       account / navigates does so with NO account resolved — a silent mis-navigation.
 *   R3  Any banking surface that gates an empty state on is_relay must disclose the REAL reason
 *       (the field is not populated by any migration or backend writer). "You have no Relay
 *       activity" / "Relay may need account tags" is a false statement about the owner's books:
 *       the truth is the system cannot identify a Relay account at all yet.
 *
 * AUTO-LIFTING: this guard encodes the FACT, not a string ban. The moment a migration (or backend
 * writer) actually creates AND sets is_relay = true, step 1 detects the write and R2/R3 stop
 * applying, because filtering on is_relay becomes honest. Nothing here has to be edited by hand.
 *
 * Usage:
 *   node scripts/verify-banking-relay-tab-honesty.mjs
 *   node scripts/verify-banking-relay-tab-honesty.mjs --selftest
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const LABEL = "verify-banking-relay-tab-honesty";

const MIGRATIONS_DIR = "db/migrations";
const BACKEND_DIR = "apps/backend/src";
const FRONTEND_DIR = "apps/frontend/src";
const API_BANKING = "apps/frontend/src/api/banking.ts";

/** R1 marker — the honest annotation that must sit on the is_relay field declaration. */
const R1_MARKER = "PHANTOM: never populated";

/**
 * A statement that actually SETS is_relay to a truthy value (or adds the column so it could be set).
 * Deliberately does NOT match `a.is_relay` (a read) or `false AS is_relay` (the 0044 virtual arms).
 */
const WRITE_PATTERNS = [
  /ADD\s+COLUMN[^;]{0,200}?\bis_relay\b/is,
  /\bis_relay\b\s*=\s*true\b/i,
  /\btrue\s+AS\s+is_relay\b/i,
  /INSERT\s+INTO\s+banking\.bank_accounts[^;]{0,4000}?\bis_relay\b/is,
  /UPDATE\s+banking\.bank_accounts[^;]{0,4000}?\bis_relay\b/is,
];

/** R2 — `.find(...)` whose predicate mentions is_relay. Always resolves to undefined today. */
const FIND_BY_IS_RELAY = /\.find\(\s*\(?[^)\n]*\)?\s*=>[^\n]*\bis_relay\b/;

/** R3 — a `.filter(...)` predicate keyed on is_relay is what gates the Relay empty state. */
const FILTER_BY_IS_RELAY = /\.filter\(\s*\(?[^)\n]*\)?\s*=>[^\n]*\bis_relay\b/;

/** R3 — an honesty notice element must exist... */
const HONESTY_TESTID = /data-testid="banking-relay-[\w-]*(?:phantom|unproven|unidentifiable|honest)[\w-]*"/;

/** ...and it must name the schema truth, not blame owner configuration. */
const HONESTY_REASON = /\b(?:not populated|never populated|phantom|no migration|cannot identify)\b/i;

function walk(dir, exts) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e === ".git") continue;
    const full = path.join(dir, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) out = out.concat(walk(full, exts));
    else if (exts.some((x) => e.endsWith(x))) out.push(full);
  }
  return out;
}

function read(f) {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return "";
  }
}

/**
 * R2/R3 assert on EXECUTABLE code only. A doc comment that *quotes* the broken expression in order to
 * warn about it (e.g. the annotation on BankingTile.is_relay) is documentation, not a defect — scanning
 * raw text would punish the very disclosure this guard demands. Comments are still scanned for R1,
 * whose marker legitimately lives in a comment.
 */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Step 1 — re-derive the fact. Returns { written: boolean, evidence: string[] }.
 * `written` true means some migration/backend code genuinely populates is_relay.
 */
export function relayFieldIsWritten(migrationsDir = MIGRATIONS_DIR, backendDir = BACKEND_DIR) {
  const evidence = [];
  const files = [...walk(migrationsDir, [".sql"]), ...walk(backendDir, [".ts", ".mts"])];
  for (const f of files) {
    const src = read(f);
    if (!src.includes("is_relay")) continue;
    for (const re of WRITE_PATTERNS) {
      const m = src.match(re);
      if (m) evidence.push(`${f}: ${m[0].replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  return { written: evidence.length > 0, evidence };
}

/** Step 2 — the UI-honesty assertions. Returns string[] of failures. */
export function scanRelayHonesty(frontendDir = FRONTEND_DIR, apiBankingPath = API_BANKING) {
  const failures = [];

  // R1 — the type declaration must tell the truth about the field.
  const api = read(apiBankingPath);
  if (api.includes("is_relay")) {
    if (!api.includes(R1_MARKER)) {
      failures.push(
        `R1 ${apiBankingPath}: declares is_relay but does not carry the marker "${R1_MARKER}". ` +
          `Consumers must be told the field is never written, or they will keep filtering on it.`
      );
    }
  }

  for (const f of walk(frontendDir, [".ts", ".tsx"])) {
    const raw = read(f);
    if (!raw.includes("is_relay")) continue;
    const src = stripComments(raw);
    if (!src.includes("is_relay")) continue;

    // R2 — lookup-by-is_relay is a guaranteed-undefined lookup.
    if (FIND_BY_IS_RELAY.test(src)) {
      failures.push(
        `R2 ${f}: looks a Relay tile up with .find(... is_relay ...). Nothing writes is_relay, so this ` +
          `is always undefined — any account selection / navigation built on it silently resolves to no account.`
      );
    }

    // R3 — an is_relay-gated empty state must state the real reason.
    if (FILTER_BY_IS_RELAY.test(src)) {
      if (!HONESTY_TESTID.test(raw)) {
        failures.push(
          `R3 ${f}: gates a Relay surface on is_relay with no honesty notice ` +
            `(data-testid="banking-relay-...-phantom|unproven|unidentifiable|honest..."). ` +
            `An empty Relay tab implies "no Relay activity" when the truth is "this system cannot identify Relay accounts yet".`
        );
      } else if (!HONESTY_REASON.test(stripComments(raw))) {
        failures.push(
          `R3 ${f}: has a Relay notice but never states the real cause. It must say the field is ` +
            `not populated / phantom / no migration writes it — not blame owner configuration (tags, Plaid mapping).`
        );
      }
    }
  }

  return failures;
}

function runSelftest() {
  const tmp = path.join(process.cwd(), ".tmp-relay-tab-honesty-selftest");
  rmSync(tmp, { recursive: true, force: true });
  const problems = [];

  try {
    // ---- Fixture A: planted VIOLATING frontend source (this is the real shape of the live defect).
    const badDir = path.join(tmp, "bad", "pages", "banking");
    mkdirSync(badDir, { recursive: true });
    const badApi = path.join(tmp, "bad", "api", "banking.ts");
    mkdirSync(path.dirname(badApi), { recursive: true });
    writeFileSync(badApi, "export type BankingTile = { id: string; is_relay: boolean };\n");
    writeFileSync(
      path.join(badDir, "BankingHome.tsx"),
      [
        'export function RelayTab({ tiles, setSelectedAccountId }: any) {',
        '  const open = () => {',
        '    const relay = tiles.find((t: any) => Boolean(t.is_relay));',
        '    if (relay?.id) setSelectedAccountId(String(relay.id));',
        '  };',
        '  return tiles.filter((t: any) => Boolean(t.is_relay)).length === 0 ? (',
        '    <div onClick={open}>No Relay card accounts yet.</div>',
        '  ) : null;',
        '}',
        "",
      ].join("\n")
    );
    const badFailures = scanRelayHonesty(path.join(tmp, "bad"), badApi);
    if (!badFailures.some((f) => f.startsWith("R1 "))) problems.push("selftest: planted violation did not trip R1");
    if (!badFailures.some((f) => f.startsWith("R2 "))) problems.push("selftest: planted violation did not trip R2");
    if (!badFailures.some((f) => f.startsWith("R3 "))) problems.push("selftest: planted violation did not trip R3");

    // ---- Fixture B: planted COMPLIANT frontend source — same tab, honest.
    const goodDir = path.join(tmp, "good", "pages", "banking");
    mkdirSync(goodDir, { recursive: true });
    const goodApi = path.join(tmp, "good", "api", "banking.ts");
    mkdirSync(path.dirname(goodApi), { recursive: true });
    writeFileSync(
      goodApi,
      `/** ${R1_MARKER} by any migration or backend writer. */\nexport type BankingTile = { id: string; is_relay: boolean };\n`
    );
    writeFileSync(
      path.join(goodDir, "BankingHome.tsx"),
      [
        'export function RelayTab({ tiles }: any) {',
        '  return tiles.filter((t: any) => Boolean(t.is_relay)).length === 0 ? (',
        '    <div data-testid="banking-relay-phantom-field-unproven-notice">',
        '      Relay accounts cannot be identified yet: is_relay is not populated by any migration.',
        '    </div>',
        '  ) : null;',
        '}',
        "",
      ].join("\n")
    );
    const goodFailures = scanRelayHonesty(path.join(tmp, "good"), goodApi);
    if (goodFailures.length !== 0) {
      problems.push(`selftest: compliant fixture should pass, got:\n    ${goodFailures.join("\n    ")}`);
    }

    // ---- Fixture C: the notice exists but blames owner configuration -> must still trip R3.
    const blameDir = path.join(tmp, "blame", "pages", "banking");
    mkdirSync(blameDir, { recursive: true });
    writeFileSync(
      path.join(blameDir, "BankingHome.tsx"),
      [
        'export function RelayTab({ tiles }: any) {',
        '  return tiles.filter((t: any) => Boolean(t.is_relay)).length === 0 ? (',
        '    <div data-testid="banking-relay-entry-unproven-banner">',
        '      Relay may need account tags or Plaid mapping under Plaid Connections.',
        '    </div>',
        '  ) : null;',
        '}',
        "",
      ].join("\n")
    );
    const blameFailures = scanRelayHonesty(path.join(tmp, "blame"), goodApi);
    if (!blameFailures.some((f) => f.startsWith("R3 "))) {
      problems.push("selftest: config-blaming notice should still trip R3 (it names the wrong cause)");
    }

    // ---- Fixture D: the fact-derivation must AUTO-LIFT when is_relay is genuinely written.
    const migDir = path.join(tmp, "mig");
    mkdirSync(migDir, { recursive: true });
    writeFileSync(
      path.join(migDir, "0044_reads_only.sql"),
      "CREATE VIEW v AS SELECT a.is_relay, false AS is_relay FROM banking.bank_accounts a;\n"
    );
    const readsOnly = relayFieldIsWritten(migDir, path.join(tmp, "no-backend"));
    if (readsOnly.written) {
      problems.push(`selftest: reads-only migration must NOT count as a write, got: ${readsOnly.evidence.join("; ")}`);
    }
    writeFileSync(
      path.join(migDir, "9999_adds_and_sets.sql"),
      "ALTER TABLE banking.bank_accounts ADD COLUMN IF NOT EXISTS is_relay boolean NOT NULL DEFAULT false;\n" +
        "UPDATE banking.bank_accounts SET is_relay = true WHERE account_name = 'Relay Fuel Wallet';\n"
    );
    const nowWritten = relayFieldIsWritten(migDir, path.join(tmp, "no-backend"));
    if (!nowWritten.written) problems.push("selftest: a real ADD COLUMN + SET is_relay = true must lift the invariant");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (problems.length) {
    console.error(`FAIL ${LABEL} --selftest:\n  ` + problems.map((p) => "x " + p).join("\n  "));
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK (planted violating/compliant/blaming source + fact auto-lift all asserted)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }

  const fact = relayFieldIsWritten();
  if (fact.written) {
    console.log(
      `${LABEL} - OK (is_relay is now genuinely populated; honesty constraint auto-lifted)\n  ` +
        fact.evidence.join("\n  ")
    );
    return;
  }

  const failures = scanRelayHonesty();
  if (failures.length) {
    console.error(
      `FAIL ${LABEL}: is_relay is a phantom column (no migration adds it, nothing writes it true), ` +
        `so the UI must not present it as data.\n  ` + failures.map((f) => "x " + f).join("\n  ")
    );
    process.exit(1);
  }
  console.log(`${LABEL} - OK (is_relay unwritten and no UI treats it as a populated discriminator)`);
}

// Only self-execute when run as a script; the scanners are importable for tests/evidence runs.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
