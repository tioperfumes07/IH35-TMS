#!/usr/bin/env node
/**
 * SQL RUNNER SELFTEST — every arm PLANTS a defect and DEMANDS rejection.
 * A selftest that only exercises the happy path proves nothing.
 * No database required: the query function is injected.
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { makeSqlRunner, assertSqlProofShape, extractBlock, resolvePsqlVars, assertConnectionCanEnforceRls } from "./sql-runner.mjs";
import fs from "node:fs";

const REPO = process.env.IH35_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILE = "scripts/verify-gl-invariants.sql";

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  -> " + detail : ""}`); }
};

const GOOD = {
  kind: "sql", name: "C26 subledger tie", file: FILE, query_id: "INV-3",
  discriminator: { column: "je_control", value: 2214 }, probe_query_id: "INV-0",
  expect: [{ column: "ar_difference", op: "==", value: 0 },
           { column: "ap_difference", op: "==", value: 0 }],
};
const runner = (rows) => {
  // probe first, then the graded block
  let n = 0;
  return makeSqlRunner({ repoRoot: REPO, query: async () => (++n === 1 ? [{ je_control: 2214 }] : rows) });
};
/** a runner whose PROBE is broken */
const blindRunner = (probeRows) => makeSqlRunner({ repoRoot: REPO, query: async () => probeRows });

console.log("SQL RUNNER SELFTEST — each arm plants a defect and demands rejection\n");

// --- R3: inline SQL is forbidden
try { assertSqlProofShape({ ...GOOD, query: "SELECT 1" }); t("R3 inline SQL is rejected", false, "accepted"); }
catch { t("R3 inline SQL is rejected", true); }

// --- R3: must name a committed .sql file and a block
try { assertSqlProofShape({ ...GOOD, file: "notes.md" }); t("R3 non-.sql source is rejected", false, "accepted"); }
catch { t("R3 non-.sql source is rejected", true); }
try { const p = { ...GOOD }; delete p.query_id; assertSqlProofShape(p); t("R3 missing query_id is rejected", false, "accepted"); }
catch { t("R3 missing query_id is rejected", true); }

// --- R1: discriminator is mandatory, and 0 is not a discriminator
try { const p = { ...GOOD }; delete p.discriminator; assertSqlProofShape(p); t("R1 missing discriminator is rejected", false, "accepted"); }
catch { t("R1 missing discriminator is rejected", true); }
try { assertSqlProofShape({ ...GOOD, discriminator: { column: "je_control", value: 0 } }); t("R1 zero discriminator is rejected", false, "accepted"); }
catch { t("R1 zero discriminator is rejected", true); }

// --- R5: bypass_rls may not prove entity isolation
try { assertSqlProofShape({ ...GOOD, rls_sensitive: true, allow_bypass_rls: true }); t("R5 bypass_rls in an isolation proof is rejected", false, "accepted"); }
catch { t("R5 bypass_rls in an isolation proof is rejected", true); }

// --- R5, resolved-behaviour half (packet 10, 2026-08-30): rls:"bypass" on an rls_sensitive
// proof is rejected even though the SQL TEXT never mentions bypass_rls at all — this is the
// hole a text-only R5 check cannot see, closed by inspecting the RESOLVED rls mode instead.
try { assertSqlProofShape({ ...GOOD, rls_sensitive: true, rls: "bypass" }); t("R5-resolved rls:\"bypass\" on an rls_sensitive proof is rejected", false, "accepted"); }
catch { t("R5-resolved rls:\"bypass\" on an rls_sensitive proof is rejected", true); }
// An rls_sensitive proof that OMITS rls entirely must still be accepted — it resolves to the
// safe default ("enforced"), never rejected for the omission itself.
try { assertSqlProofShape({ ...GOOD, rls_sensitive: true }); t("rls_sensitive proof with no rls field (defaults enforced) is accepted", true); }
catch (e) { t("rls_sensitive proof with no rls field (defaults enforced) is accepted", false, e.message); }
// An invalid rls value is rejected outright — no silent coercion to a mode nobody chose.
try { assertSqlProofShape({ ...GOOD, rls: "sometimes" }); t("an unrecognized rls value is rejected", false, "accepted"); }
catch { t("an unrecognized rls value is rejected", true); }

// --- rls is actually THREADED to the query executor, not just validated at load. A proof with
// no rls field must reach the executor as "enforced" (never silently bypass); rls:"bypass" must
// reach it as "bypass" — this is what makes defaultPgQuery's SET LOCAL app.bypass_rls decision
// correct instead of a no-op.
{
  const seen = [];
  let n = 0;
  const capture = makeSqlRunner({
    repoRoot: REPO,
    query: async (_sql, opts) => { seen.push(opts?.rls); return ++n === 1 ? [{ je_control: 2214 }] : [{ ar_difference: 0, ap_difference: 0 }]; },
  });
  await capture(GOOD); // no rls field on GOOD
  t("no rls field threads through as \"enforced\" (probe + main query)", seen.length === 2 && seen.every((v) => v === "enforced"), JSON.stringify(seen));
}
{
  const seen = [];
  let n = 0;
  const capture = makeSqlRunner({
    repoRoot: REPO,
    query: async (_sql, opts) => { seen.push(opts?.rls); return ++n === 1 ? [{ je_control: 2214 }] : [{ ar_difference: 0, ap_difference: 0 }]; },
  });
  await capture({ ...GOOD, rls: "bypass" });
  t("rls:\"bypass\" threads through to both the probe and the main query", seen.length === 2 && seen.every((v) => v === "bypass"), JSON.stringify(seen));
}

// --- company_context (packet 10 section 3, C30's own probe): validated shape at load,
// threaded to the executor exactly like rls.
try { assertSqlProofShape({ ...GOOD, company_context: "not-a-uuid" }); t("a malformed company_context is rejected", false, "accepted"); }
catch { t("a malformed company_context is rejected", true); }
try { assertSqlProofShape({ ...GOOD, company_context: "5c854333-6ea5-4faa-af31-67cb272fef80" }); t("a real-shaped company_context is accepted", true); }
catch (e) { t("a real-shaped company_context is accepted", false, e.message); }
{
  const seen = [];
  let n = 0;
  const capture = makeSqlRunner({
    repoRoot: REPO,
    query: async (_sql, opts) => { seen.push(opts?.company_context); return ++n === 1 ? [{ je_control: 2214 }] : [{ ar_difference: 0, ap_difference: 0 }]; },
  });
  await capture({ ...GOOD, company_context: "5c854333-6ea5-4faa-af31-67cb272fef80" });
  t(
    "company_context threads through to both the probe and the main query",
    seen.length === 2 && seen.every((v) => v === "5c854333-6ea5-4faa-af31-67cb272fef80"),
    JSON.stringify(seen)
  );
}
{
  const seen = [];
  let n = 0;
  const capture = makeSqlRunner({
    repoRoot: REPO,
    query: async (_sql, opts) => { seen.push(opts?.company_context); return ++n === 1 ? [{ je_control: 2214 }] : [{ ar_difference: 0, ap_difference: 0 }]; },
  });
  await capture(GOOD); // no company_context on GOOD
  t("no company_context field threads through as undefined (never a guessed entity)", seen.length === 2 && seen.every((v) => v === undefined), JSON.stringify(seen));
}

// --- R7 (found 2026-08-30 wiring C30's own probe): a pooled connection's role-downgrade was
// measured to land on a bypass-capable role ~40% of the time against the identical endpoint.
// This assertion is the fix -- never trust an "enforced" result unless the connected role is
// PROVEN unable to bypass RLS at all.
try { assertConnectionCanEnforceRls(true); t("R7 rejects a connection whose role CAN bypass RLS", false, "accepted"); }
catch { t("R7 rejects a connection whose role CAN bypass RLS", true); }
try { assertConnectionCanEnforceRls(undefined); t("R7 rejects an unrecognized/missing role lookup (fail closed, never assume safe)", false, "accepted"); }
catch { t("R7 rejects an unrecognized/missing role lookup (fail closed, never assume safe)", true); }
try { assertConnectionCanEnforceRls(null); t("R7 rejects a null rolbypassrls read (same as missing)", false, "accepted"); }
catch { t("R7 rejects a null rolbypassrls read (same as missing)", true); }
try { assertConnectionCanEnforceRls(false); t("R7 accepts a confirmed non-bypass role", true); }
catch (e) { t("R7 accepts a confirmed non-bypass role", false, e.message); }

// --- THE BIG ONE. R2: an RLS-empty read must never satisfy "difference == 0".
{
  const r = await runner([])(GOOD);
  t("R2 empty result set is FAIL, not a vacuous PASS", r.ok === false && /empty result set/i.test(r.err || ""), JSON.stringify(r));
}

// --- R1 at runtime: right answer, wrong discriminator = the query did not see the data
{
  const r = await blindRunner([{ je_control: 0, ar_difference: 0, ap_difference: 0 }])(GOOD);
  t("R1 correct numbers with a WRONG discriminator still FAIL", r.ok === false && /discriminator mismatch/i.test(r.err || ""), JSON.stringify(r));
}

// --- honest pass
{
  const r = await runner([{ je_control: 2214, ar_difference: 0, ap_difference: 0 }])(GOOD);
  t("all assertions met at the right discriminator = PASS", r.ok === true, JSON.stringify(r));
}

// --- a real non-zero difference must fail, and must record what it saw (R6)
{
  const r = await runner([{ je_control: 2214, ar_difference: -65.75, ap_difference: 0 }])(GOOD);
  t("a real variance FAILs and records the observed value (R6)",
    r.ok === false && /-65\.75/.test(JSON.stringify(r)), JSON.stringify(r));
}

// --- R4: a write statement in the referenced block is refused before connecting
{
  const tmp = path.join(REPO, "scripts/.selftest-write.sql");
  fs.writeFileSync(tmp, "\\echo '=== INV-X  planted ==='\nDELETE FROM accounting.journal_entries;\n");
  const r = await makeSqlRunner({ repoRoot: REPO, query: async () => [{ je_control: 2214 }] })(
    { ...GOOD, file: "scripts/.selftest-write.sql", query_id: "INV-X", probe_query_id: "INV-X" });
  fs.unlinkSync(tmp);
  t("R4 a write statement is refused BEFORE connecting", r.ok === false && /read-only violation/i.test(r.err || ""), JSON.stringify(r));
}

// --- the block extractor is anchored, not a loose search
{
  const src = fs.readFileSync(path.join(REPO, FILE), "utf8");
  const b = resolvePsqlVars(src, extractBlock(src, "INV-3"));
  t("extractBlock isolates INV-3 only", /accounts_receivable/.test(b) && !/INV-4/.test(b) && !/future_dated/.test(b));
  t("psql :'USMCA' is resolved to the literal uuid", b.includes("'5c854333-6ea5-4faa-af31-67cb272fef80'") && !b.includes(":'USMCA'"));
}

// --- a `--` comment's own English-prose semicolon must never be counted as a statement
// separator (found 2026-08-30 wiring C30's own probe: a real comment reading "...carries no
// WHERE clause; FORCE ROW LEVEL SECURITY..." corrupted the returned query before this fix).
{
  const synthetic = [
    "\\echo '=== SELFTEST-SEMI  SYNTHETIC ==='",
    "-- a prose comment; with a semicolon in it, on purpose",
    "-- and a second one; right here too",
    "SELECT 1 AS one;",
    "",
    "\\echo '=== SELFTEST-SEMI-NEXT  BOUNDARY ==='",
    "SELECT 2 AS two;",
  ].join("\n");
  let threw = null;
  let extracted = null;
  try { extracted = extractBlock(synthetic, "SELFTEST-SEMI"); } catch (e) { threw = e; }
  t(
    "a comment's own semicolon is never counted as a statement separator",
    threw === null && extracted === "SELECT 1 AS one;",
    threw ? threw.message : JSON.stringify(extracted)
  );
}

// --- a proof pointing at a block that no longer exists must fail loudly, not silently pass
{
  const r = await runner([{ je_control: 2214 }])({ ...GOOD, query_id: "INV-999" });
  t("a stale query_id fails loudly", r.ok === false && /not found/i.test(r.err || ""), JSON.stringify(r));
}


// --- R1-b THE ZERO-ROWS HOLE: a zero-rows proof with no probe is rejected at load
const ZERO = { kind:"sql", name:"C25", file:FILE, query_id:"INV-4",
               discriminator:{column:"je_control",value:2214}, expect_rows:0, expect:[] };
// (no probe_query_id on purpose — that is what this arm tests)
try { assertSqlProofShape(ZERO); t("R1-b a proof without a probe is rejected", false, "accepted"); }
catch { t("R1-b a proof without a probe is rejected", true); }

// --- R1-b: with a probe that comes back EMPTY, a zero-rows proof must FAIL, not pass
{
  const r = await blindRunner([])({ ...ZERO, probe_query_id: "INV-0" });
  t("R1-b a blind read cannot pass a zero-rows proof",
    r.ok === false && /probe/i.test(r.err || ""), JSON.stringify(r));
}

// --- R1-b: probe good, main block empty = the honest PASS
{
  const r = await runner([])({ ...ZERO, probe_query_id: "INV-0" });
  t("R1-b probe sees the ledger + main block empty = honest PASS", r.ok === true, JSON.stringify(r));
}

// --- R1-b: probe with the WRONG control still fails even though the main block is empty
{
  const r = await blindRunner([{ je_control: 0 }])({ ...ZERO, probe_query_id: "INV-0" });
  t("R1-b a wrong probe control fails a zero-rows proof",
    r.ok === false && /probe discriminator mismatch/i.test(r.err || ""), JSON.stringify(r));
}

// --- a multi-statement block is refused rather than silently graded on its last statement
{
  const r = await makeSqlRunner({ repoRoot: REPO, query: async () => { throw new Error("MUST NOT RUN"); } })(
    { ...GOOD, query_id: "INV-10" });
  t("a multi-statement block is REFUSED, not graded on its last statement",
    r.ok === false && /contains 4 statements/i.test(r.err || ""), JSON.stringify(r));
}

// --- naming the sub-query makes it legal and isolates the right one
{
  const src2 = fs.readFileSync(path.join(REPO, FILE), "utf8");
  const b = resolvePsqlVars(src2, extractBlock(src2, "INV-10", "10c"));
  t("sub_id 10c isolates the duplicate-role query only",
    /dup_rows/.test(b) && !/pg_get_constraintdef/.test(b) && !/missing_in_opco/.test(b));
}

console.log(`\nSELFTEST ${fail === 0 ? "PASS" : "FAIL"} ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
