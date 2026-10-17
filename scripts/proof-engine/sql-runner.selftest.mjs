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
  discriminator: { column: "je_control", equals_column: "je_control_expected" }, probe_query_id: "INV-0",
  expect: [{ column: "ar_difference", op: "==", value: 0 },
           { column: "ap_difference", op: "==", value: 0 }],
};
/** a probe row where the RLS-subject read agrees with the independently-derived expectation */
const PROBE_OK = { je_control: 4102, je_control_expected: 4102 };
const runner = (rows) => {
  // probe first, then the graded block
  let n = 0;
  return makeSqlRunner({ repoRoot: REPO, query: async () => (++n === 1 ? [PROBE_OK] : rows) });
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

// --- R1-c (LEAD 443.187): a frozen literal rots (2214 -> 4102) and is rejected at load, even
// when it carries a derived column too — the literal is the thing that must never come back.
try { assertSqlProofShape({ ...GOOD, discriminator: { column: "je_control", value: 2214 } }); t("R1-c frozen literal discriminator is rejected", false, "accepted"); }
catch (e) { t("R1-c frozen literal discriminator is rejected", /frozen literal/.test(e.message), e.message); }
try { assertSqlProofShape({ ...GOOD, discriminator: { column: "je_control", equals_column: "je_control_expected", value: 4102 } }); t("R1-c literal alongside a derived column is still rejected", false, "accepted"); }
catch (e) { t("R1-c literal alongside a derived column is still rejected", /frozen literal/.test(e.message), e.message); }
try { assertSqlProofShape({ ...GOOD, discriminator: { column: "je_control" } }); t("R1-c discriminator without equals_column is rejected", false, "accepted"); }
catch (e) { t("R1-c discriminator without equals_column is rejected", /equals_column is mandatory/.test(e.message), e.message); }
try { assertSqlProofShape({ ...GOOD, discriminator: { column: "je_control", equals_column: "je_control" } }); t("R1-c self-comparison (equals_column === column) is rejected", false, "accepted"); }
catch (e) { t("R1-c self-comparison (equals_column === column) is rejected", /must differ/.test(e.message), e.message); }

// --- R1-c at runtime: the PLANTED WRONG POPULATIONS the frozen literal used to catch must still
// be caught by the derived expectation. Main block is "clean" in every arm, so only the probe
// can stop a false PASS.
{
  const ZERO_OK = { kind:"sql", name:"C25", file:FILE, query_id:"INV-4", probe_query_id:"INV-0",
                    discriminator:{column:"je_control",equals_column:"je_control_expected"}, expect_rows:0, expect:[] };
  const probeThen = (probe) => { let n = 0; return makeSqlRunner({ repoRoot: REPO, query: async () => (++n === 1 ? [probe] : []) }); };
  const blind = await probeThen({ je_control: 0, je_control_expected: 4102 })(ZERO_OK);
  t("R1-c PLANT RLS-empty read (0 seen vs 4102 derived) FAILs a zero-rows proof",
    blind.ok === false && /probe discriminator mismatch/.test(blind.err || ""), JSON.stringify(blind));
  const oneEntity = await probeThen({ je_control: 2314, je_control_expected: 4102 })(ZERO_OK);
  t("R1-c PLANT wrong-company / one-entity read (2314 of 4102) FAILs",
    oneEntity.ok === false && /probe discriminator mismatch/.test(oneEntity.err || ""), JSON.stringify(oneEntity));
  const emptyDb = await probeThen({ je_control: 0, je_control_expected: 0 })(ZERO_OK);
  t("R1-c PLANT empty database (0 == 0) FAILs on the non-zero rule, never agrees its way to PASS",
    emptyDb.ok === false && /not a non-zero population/.test(emptyDb.err || ""), JSON.stringify(emptyDb));
  const nullStat = await probeThen({ je_control: 4102, je_control_expected: null })(ZERO_OK);
  t("R1-c PLANT unreadable derived expectation (null) FAILs",
    nullStat.ok === false && /not a non-zero population/.test(nullStat.err || ""), JSON.stringify(nullStat));
  const noCol = await probeThen({ je_control: 4102 })(ZERO_OK);
  t("R1-c PLANT probe missing the derived column FAILs",
    noCol.ok === false && /derived-expectation column/.test(noCol.err || ""), JSON.stringify(noCol));
  const honest = await probeThen({ je_control: 4102, je_control_expected: 4102 })(ZERO_OK);
  t("R1-c probe agrees with its derived expectation + main block empty = honest PASS, discriminator recorded (R6)",
    honest.ok === true && honest.observed?._discriminator?.je_control_expected === 4102, JSON.stringify(honest));
  const grown = await probeThen({ je_control: 9999, je_control_expected: 9999 })(ZERO_OK);
  t("R1-c a GROWN ledger still passes (the expectation moves with the data, never rots)",
    grown.ok === true, JSON.stringify(grown));
}

// --- R1-c for C30 (INV-0B under enforced RLS): a bypass-capable read sees every entity's rows,
// so the in-context count (73) disagrees with the total (161) and the proof FAILs.
{
  const C30 = { kind:"sql", name:"C30", file:FILE, query_id:"INV-10", sub_id:"10c", probe_query_id:"INV-0B",
                discriminator:{column:"role_control",equals_column:"role_control_expected"},
                expect_rows:0, expect:[], rls_sensitive:true, rls:"enforced", rls_role:"ih35_app",
                company_context:"5c854333-6ea5-4faa-af31-67cb272fef80" };
  const probeThen = (probe) => { let n = 0; return makeSqlRunner({ repoRoot: REPO, query: async () => (++n === 1 ? [probe] : []) }); };
  const leaked = await probeThen({ role_control: 161, role_control_expected: 73 })(C30);
  t("R1-c PLANT C30 read that saw OTHER entities' rows (161 vs 73 in-context) FAILs",
    leaked.ok === false && /probe discriminator mismatch/.test(leaked.err || ""), JSON.stringify(leaked));
  const noCtx = await probeThen({ role_control: 0, role_control_expected: 0 })(C30);
  t("R1-c PLANT C30 blind read (no company context took) FAILs",
    noCtx.ok === false && /not a non-zero population/.test(noCtx.err || ""), JSON.stringify(noCtx));
  const ok = await probeThen({ role_control: 73, role_control_expected: 73 })(C30);
  t("R1-c C30 enforced, in-context-only read + zero active duplicates = honest PASS", ok.ok === true, JSON.stringify(ok));
}

// --- rls_role: only ih35_app, only under enforced, and threaded to the executor
try { assertSqlProofShape({ ...GOOD, rls: "bypass", rls_role: "ih35_app" }); t("rls_role with rls:\"bypass\" is rejected", false, "accepted"); }
catch { t("rls_role with rls:\"bypass\" is rejected", true); }
try { assertSqlProofShape({ ...GOOD, rls: "enforced", rls_role: "neondb_owner" }); t("rls_role outside the allowlist (an owner role) is rejected", false, "accepted"); }
catch { t("rls_role outside the allowlist (an owner role) is rejected", true); }
try { assertSqlProofShape({ ...GOOD, rls: "enforced", rls_role: "ih35_app; RESET ROLE" }); t("rls_role injection text is rejected", false, "accepted"); }
catch { t("rls_role injection text is rejected", true); }
{
  const seen = [];
  let n = 0;
  const capture = makeSqlRunner({
    repoRoot: REPO,
    query: async (_sql, opts) => { seen.push(opts?.rls_role); return ++n === 1 ? [PROBE_OK] : [{ ar_difference: 0, ap_difference: 0 }]; },
  });
  await capture({ ...GOOD, rls: "enforced", rls_role: "ih35_app" });
  t("rls_role threads through to both the probe and the main query", seen.length === 2 && seen.every((v) => v === "ih35_app"), JSON.stringify(seen));
}

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
    query: async (_sql, opts) => { seen.push(opts?.rls); return ++n === 1 ? [PROBE_OK] : [{ ar_difference: 0, ap_difference: 0 }]; },
  });
  await capture(GOOD); // no rls field on GOOD
  t("no rls field threads through as \"enforced\" (probe + main query)", seen.length === 2 && seen.every((v) => v === "enforced"), JSON.stringify(seen));
}
{
  const seen = [];
  let n = 0;
  const capture = makeSqlRunner({
    repoRoot: REPO,
    query: async (_sql, opts) => { seen.push(opts?.rls); return ++n === 1 ? [PROBE_OK] : [{ ar_difference: 0, ap_difference: 0 }]; },
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
    query: async (_sql, opts) => { seen.push(opts?.company_context); return ++n === 1 ? [PROBE_OK] : [{ ar_difference: 0, ap_difference: 0 }]; },
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
    query: async (_sql, opts) => { seen.push(opts?.company_context); return ++n === 1 ? [PROBE_OK] : [{ ar_difference: 0, ap_difference: 0 }]; },
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
  const r = await blindRunner([{ je_control: 0, je_control_expected: 4102, ar_difference: 0, ap_difference: 0 }])(GOOD);
  t("R1 correct numbers with a WRONG discriminator still FAIL", r.ok === false && /discriminator mismatch/i.test(r.err || ""), JSON.stringify(r));
}

// --- honest pass
{
  const r = await runner([{ je_control: 4102, ar_difference: 0, ap_difference: 0 }])(GOOD);
  t("all assertions met at the right discriminator = PASS", r.ok === true, JSON.stringify(r));
}

// --- a real non-zero difference must fail, and must record what it saw (R6)
{
  const r = await runner([{ je_control: 4102, ar_difference: -65.75, ap_difference: 0 }])(GOOD);
  t("a real variance FAILs and records the observed value (R6)",
    r.ok === false && /-65\.75/.test(JSON.stringify(r)), JSON.stringify(r));
}

// --- R4: a write statement in the referenced block is refused before connecting
{
  const tmp = path.join(REPO, "scripts/.selftest-write.sql");
  fs.writeFileSync(tmp, "\\echo '=== INV-X  planted ==='\nDELETE FROM accounting.journal_entries;\n");
  const r = await makeSqlRunner({ repoRoot: REPO, query: async () => [PROBE_OK] })(
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

// --- R1 belt-and-braces: a graded block that reports its own control must agree with the probe
{
  const r = await runner([{ je_control: 4101, ar_difference: 0, ap_difference: 0 }])(GOOD);
  t("R1 graded block contradicting the probe's control FAILs", r.ok === false && /discriminator mismatch/.test(r.err || ""), JSON.stringify(r));
}

// --- the committed probe blocks really carry the derived-expectation columns (not just the selftest)
{
  const src3 = fs.readFileSync(path.join(REPO, FILE), "utf8");
  const p0 = extractBlock(src3, "INV-0");
  const p0b = extractBlock(src3, "INV-0B");
  t("INV-0 returns je_control AND an independently-derived je_control_expected (no literal)",
    /AS je_control\b/.test(p0) && /pg_stat_get_live_tuples\('accounting\.journal_entries'::regclass\)\s+AS je_control_expected/.test(p0), p0);
  t("INV-0B returns role_control AND the in-context role_control_expected",
    /AS role_control\b/.test(p0b) && /current_setting\('app\.operating_company_id'/.test(p0b) && /AS role_control_expected/.test(p0b), p0b);
}

// --- 443.187 TASK 2/3: the repointed invariants keep their teeth (static shape of the committed SQL)
{
  const src4 = fs.readFileSync(path.join(REPO, FILE), "utf8");
  const inv4 = extractBlock(src4, "INV-4");
  t("INV-4 exempts only $0 invoices and still demands a JE for every non-zero sent/partial/paid one",
    /total_cents\s*<>\s*0/.test(inv4) && /NOT EXISTS/.test(inv4) && /status IN \('sent','partial','paid'\)/.test(inv4) &&
    !/total_cents\s*(>|>=)\s*\d/.test(inv4), inv4);
  const c10 = extractBlock(src4, "INV-10", "10c");
  t("INV-10c grades >1 ACTIVE row per (company, role), not inactive history",
    /HAVING count\(\*\) FILTER \(WHERE r\.is_active\) > 1/.test(c10) && !/HAVING count\(\*\)\s*>\s*1/.test(c10), c10);
  const d10 = extractBlock(src4, "INV-10", "10d");
  t("INV-10d looks for a UNIQUE partial index on (operating_company_id, role) WHERE is_active",
    /indisunique/.test(d10) && /is_active/.test(d10) && /ARRAY\['operating_company_id','role'\]/.test(d10), d10);
}

// --- a proof pointing at a block that no longer exists must fail loudly, not silently pass
{
  const r = await runner([PROBE_OK])({ ...GOOD, query_id: "INV-999" });
  t("a stale query_id fails loudly", r.ok === false && /not found/i.test(r.err || ""), JSON.stringify(r));
}


// --- R1-b THE ZERO-ROWS HOLE: a zero-rows proof with no probe is rejected at load
const ZERO = { kind:"sql", name:"C25", file:FILE, query_id:"INV-4",
               discriminator:{column:"je_control",equals_column:"je_control_expected"}, expect_rows:0, expect:[] };
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
  const r = await blindRunner([{ je_control: 0, je_control_expected: 4102 }])({ ...ZERO, probe_query_id: "INV-0" });
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
