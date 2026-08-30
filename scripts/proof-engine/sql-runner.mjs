#!/usr/bin/env node
/**
 * PROOF ENGINE — SQL RUNNER  (the missing keystone)
 *
 * WHY THIS EXISTS
 *   proof-engine.mjs shipped with:
 *       if (proof.kind === "sql" || proof.kind === "dom")
 *         return done(false, null, `${proof.kind} runner not wired in this prototype`);
 *   Every economics column C25–C31 is a LEDGER assertion. A ledger assertion can only be
 *   replayed as SQL. So with the sql kind unwired, C25–C31 were UNPROVABLE BY CONSTRUCTION —
 *   not hard, not slow: impossible. 112 board cells could never go green honestly.
 *
 * WHAT MAKES THIS THE HIGH BAR
 *   Six rules, each one traceable to a real failure that already happened on this project.
 *   None of them is stylistic. Each one closes a way a green result could be a lie.
 *
 *   R1 DISCRIMINATOR IS MANDATORY.
 *      An RLS-scoped read that returns nothing satisfies "difference == 0" vacuously, because
 *      there is no row to contradict it. This exact trap produced a false "zero reconciliation
 *      sessions exist" read on 2026-08-30 and a false "board broken, 0/14" read before it.
 *      Every sql proof MUST carry a discriminator column with a known non-zero expected value
 *      (je_control = 2214). If the discriminator is absent or wrong, the proof is REJECTED —
 *      not failed, rejected — so it can never be mistaken for a passing assertion.
 *
 *   R2 AN EMPTY RESULT SET IS A FAIL, NEVER A PASS.
 *      "No rows" is the shape of both "clean" and "I could not see the data." They must not
 *      map to the same verdict. A proof that legitimately expects zero rows says so with
 *      expect_rows: 0 AND still carries R1's discriminator on a separate probe row.
 *
 *   R3 THE QUERY MUST COME FROM A COMMITTED .sql FILE, BY BLOCK ID. NO INLINE SQL.
 *      This is the closed-loop defence. If the query and the assertion can be edited in the
 *      same file in the same commit, a seat chasing green can weaken the query and satisfy its
 *      own assertion without anyone seeing a claim change. Separating them means loosening the
 *      query is a visible diff to a file whose whole purpose is to be hard to change.
 *
 *   R4 READ-ONLY, ENFORCED BY PARSE, AND BY THE TRANSACTION.
 *      Rejects INSERT/UPDATE/DELETE/TRUNCATE/DROP/ALTER/GRANT/CREATE/COPY before connecting,
 *      then runs inside BEGIN ... SET TRANSACTION READ ONLY ... ROLLBACK. Two independent
 *      layers, because a verifier that can write is a verifier that can fix its own evidence.
 *
 *   R5 bypass_rls IS FORBIDDEN IN AN ENTITY-ISOLATION PROOF.
 *      C30 asserts a TRANSP user cannot see a USMCA row. Bypassing RLS to check RLS is the
 *      purest closed loop available. Any proof tagged rls_sensitive that mentions bypass_rls
 *      is rejected at load. Since 2026-08-30 (packet 10-RLS-WILL-BREAK-THE-FIRST-RUN.txt), R5
 *      also inspects the RESOLVED runner behaviour, not just the SQL text: a proof declares
 *      `rls: "bypass" | "enforced"` (default "enforced" — a proof with no field can never
 *      silently defeat RLS), and rls_sensitive:true + rls:"bypass" together is rejected at
 *      load even though the SQL text itself never mentions bypass_rls. Without this, a global
 *      connection-level bypass would slip straight past the old text-only R5 check — the exact
 *      hole the packet found the day this shipped, in the same file, the same hour.
 *
 *   R6 THE OBSERVED VALUE IS ALWAYS RECORDED, PASS OR FAIL.
 *      A verdict without the number it saw cannot be audited later. Every result carries the
 *      actual observed value, the block id, the file, and the sha the file was read at.
 *
 * USAGE
 *   import { makeSqlRunner, assertSqlProofShape } from "./sql-runner.mjs";
 *   ctx.runSql = makeSqlRunner({ connectionString: process.env.DATABASE_URL, repoRoot });
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/* ---------- R4: statements a read-only verifier may never contain ---------- */
const WRITE_TOKENS =
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE|CREATE|COPY|VACUUM|REINDEX|REFRESH)\b/i;

/* ---------- R5 ---------- */
const BYPASS = /bypass_rls/i;

/**
 * Extract one \echo-delimited block from a psql invariant file.
 * The block id is the token after '=== ' in the \echo line (e.g. "INV-3").
 */
export function extractBlock(src, blockId, subId) {
  const lines = src.split("\n");
  const isEcho = (l) => /^\s*\\echo\s+'===/.test(l);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!isEcho(lines[i])) continue;
    const m = lines[i].match(/===\s+([A-Z0-9-]+)/);
    if (m && m[1] === blockId) { start = i + 1; break; }
  }
  if (start === -1) throw new Error(`SQL block "${blockId}" not found — proof is out of sync with the file`);
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (isEcho(lines[i])) { end = i; break; }
  }
  let body = lines.slice(start, end);

  // A block may hold several labelled sub-queries (INV-10 holds 10a/10b/10c/10d behind
  // \echo '--- 10c ...' lines). Running the whole block through the simple query protocol
  // returns only the LAST result set — so a proof aimed at 10c would silently be graded on
  // 10d. A proof must name the sub-query it means.
  const isSub = (l) => /^\s*\\echo\s+'---/.test(l);
  if (subId) {
    let s2 = -1;
    for (let i = 0; i < body.length; i++) {
      if (isSub(body[i]) && body[i].includes(subId)) { s2 = i + 1; break; }
    }
    if (s2 === -1) throw new Error(`sub-query "${subId}" not found inside block "${blockId}"`);
    let e2 = body.length;
    for (let i = s2; i < body.length; i++) if (isSub(body[i])) { e2 = i; break; }
    body = body.slice(s2, e2);
  }

  // Strip psql meta-commands — they are not SQL and a driver cannot run them.
  const sql = body.filter((l) => !/^\s*\\/.test(l)).join("\n").trim();

  // One statement, one graded result. More than one and the verdict is ambiguous.
  const statements = sql.split(";").map((x) => x.trim()).filter(Boolean);
  if (statements.length > 1)
    throw new Error(
      `block "${blockId}"${subId ? ` sub "${subId}"` : ""} contains ${statements.length} statements. ` +
      `Only the last would be graded, so the verdict would be silently wrong. Name a sub-query.`);
  if (statements.length === 0) throw new Error(`block "${blockId}" contains no SQL`);
  return statements[0] + ";";
}

/** psql \set variables -> literal substitution, so the committed file stays runnable by psql too. */
export function resolvePsqlVars(src, body) {
  const vars = {};
  for (const m of src.matchAll(/^\s*\\set\s+(\w+)\s+'([^']*)'/gm)) vars[m[1]] = m[2];
  return body.replace(/:'(\w+)'/g, (whole, name) => {
    if (!(name in vars)) throw new Error(`psql variable :'${name}' is not \\set in the file`);
    return `'${vars[name]}'`;
  });
}

/* ---------- R1/R2/R3/R5: reject a badly-shaped proof at LOAD, before it can pass ---------- */
export function assertSqlProofShape(proof) {
  const id = proof.name || proof.query_id || "(unnamed sql proof)";
  if (proof.kind !== "sql") return true;

  if (proof.query || proof.sql)
    throw new Error(`SQL PROOF REJECTED ${id}: inline SQL is forbidden (R3). Reference file + query_id.`);
  if (!proof.file || !/\.sql$/.test(proof.file))
    throw new Error(`SQL PROOF REJECTED ${id}: proof.file must be a committed .sql path (R3).`);
  if (!proof.query_id)
    throw new Error(`SQL PROOF REJECTED ${id}: proof.query_id must name a block in that file (R3).`);

  const d = proof.discriminator;
  if (!d || !d.column || d.value === undefined)
    throw new Error(
      `SQL PROOF REJECTED ${id}: a discriminator is mandatory (R1). An RLS-empty read satisfies ` +
      `any all-rows assertion vacuously. Supply {column, value} with a known non-zero control.`);
  if (Number(d.value) === 0)
    throw new Error(`SQL PROOF REJECTED ${id}: discriminator value 0 cannot distinguish empty from clean (R1).`);

  const hasAssertions = Array.isArray(proof.expect) && proof.expect.length > 0;
  const hasRowCount = proof.expect_rows !== undefined;
  if (!hasAssertions && !hasRowCount)
    throw new Error(`SQL PROOF REJECTED ${id}: supply expect[] assertions or expect_rows.`);

  // R1-b THE ZERO-ROWS HOLE — the subtlest way this whole engine could lie.
  // A proof whose pass condition is "zero rows" gets zero rows from an RLS-scoped read that
  // saw nothing, exactly as it does from a clean ledger. The discriminator cannot ride on a
  // result set that is required to be empty. So a zero-rows proof MUST name a separate probe
  // block that DOES return the discriminator, and that probe must be checked FIRST.
  // R1-b THE PROBE IS UNIVERSAL, not just for zero-rows proofs.
  // The invariant blocks were written for a human at a psql prompt; almost none of them return
  // a control column, and amending 15 committed queries to carry one would be a wide, risky
  // edit to the exact file that must stay hard to change. So the discriminator rides on its own
  // block, and it runs FIRST, every time. If the probe cannot see the ledger, nothing that
  // follows is evidence of anything — and a zero-rows result is then indistinguishable from a
  // clean one, which is the subtlest way this engine could have lied.
  if (!proof.probe_query_id)
    throw new Error(
      `SQL PROOF REJECTED ${id}: probe_query_id is mandatory (R1-b). It must name a block that ` +
      `returns the discriminator, and it is checked before the assertion is believed.`);

  if (proof.rls_sensitive === true && proof.allow_bypass_rls === true)
    throw new Error(`SQL PROOF REJECTED ${id}: bypass_rls may never be used to prove entity isolation (R5).`);

  // R5, resolved-behaviour half (packet 10, 2026-08-30). `rls` is per-proof, fail-closed: a
  // proof that omits the field resolves to "enforced", so forgetting it can never silently
  // defeat RLS. rls_sensitive:true + rls:"bypass" is the exact hole the packet found — reject
  // it at LOAD, before the runner ever gets a chance to set the connection-level GUC.
  const rls = proof.rls ?? "enforced";
  if (rls !== "bypass" && rls !== "enforced")
    throw new Error(`SQL PROOF REJECTED ${id}: rls must be "bypass" or "enforced" (got ${JSON.stringify(proof.rls)}).`);
  if (proof.rls_sensitive === true && rls === "bypass")
    throw new Error(`SQL PROOF REJECTED ${id}: bypass_rls may never be used to prove entity isolation (R5) — resolved rls:"bypass" on an rls_sensitive proof.`);

  return true;
}

const CMP = {
  "==": (a, b) => a === b, "!=": (a, b) => a !== b,
  ">=": (a, b) => a >= b, "<=": (a, b) => a <= b,
  ">": (a, b) => a > b, "<": (a, b) => a < b,
};

function num(v) {
  if (v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Build the runner. `query` is injected so this is unit-testable without a database:
 *   makeSqlRunner({ query: async (sql) => rows })
 */
export function makeSqlRunner({ repoRoot, query, connectionString }) {
  const exec = query || defaultPgQuery(connectionString);

  return async function runSql(proof) {
    const t0 = Date.now();
    const done = (ok, observed, err) => ({
      ok, observed, err: err || null, kind: "sql",
      block: `${proof.file}#${proof.query_id}`, ms: Date.now() - t0,
    });

    try {
      assertSqlProofShape(proof);
      // Fail-closed default, mirrored from assertSqlProofShape: a proof with no rls field
      // never bypasses RLS.
      const rlsMode = proof.rls ?? "enforced";

      const abs = path.join(repoRoot, proof.file);
      const src = fs.readFileSync(abs, "utf8");
      const fileSha = crypto.createHash("sha1").update(src).digest("hex").slice(0, 10);
      let body = resolvePsqlVars(src, extractBlock(src, proof.query_id, proof.sub_id));

      // R4 layer 1 — parse before connecting.
      if (WRITE_TOKENS.test(body))
        return done(false, null, `read-only violation: block contains a write statement (R4)`);
      // R5 — bypass may not appear in an isolation proof.
      if (proof.rls_sensitive === true && BYPASS.test(body))
        return done(false, null, `entity-isolation proof references bypass_rls (R5)`);

      // R1-b: prove we can SEE the ledger before believing anything we read from it.
      {
        const probeBody = resolvePsqlVars(src, extractBlock(src, proof.probe_query_id, proof.probe_sub_id));
        if (WRITE_TOKENS.test(probeBody))
          return done(false, null, `read-only violation in probe block (R4)`);
        const probeRows = await exec(probeBody, { readOnly: true, rls: rlsMode });
        if (probeRows.length === 0)
          return done(false, "probe returned 0 rows",
            `the discriminator probe itself came back empty — the connection cannot see the data (R1-b)`);
        const d0 = proof.discriminator;
        for (const r of probeRows) {
          if (!(d0.column in r))
            return done(false, null, `probe block lacks discriminator column "${d0.column}" (R1-b)`);
          if (num(r[d0.column]) !== num(d0.value))
            return done(false, `probe ${d0.column}=${r[d0.column]}`,
              `probe discriminator mismatch: expected ${d0.value}, read ${r[d0.column]} (R1-b)`);
        }
      }

      const rows = await exec(body, { readOnly: true, rls: rlsMode });

      // R2 — empty is never a silent pass.
      const expectRows = proof.expect_rows;
      if (rows.length === 0 && expectRows !== 0)
        return done(false, `0 rows`,
          `empty result set. Either the assertion is unmet or the read was scoped away (RLS). ` +
          `Empty is never PASS (R2).`);

      // R1 — if the main result ALSO carries the control, it must agree. Belt and braces:
      // the probe already ran, but a block that reports its own control must not contradict it.
      if (rows.length > 0 && proof.discriminator.column in rows[0]) {
        const d = proof.discriminator;
        for (const r of rows) {
          if (num(r[d.column]) !== num(d.value))
            return done(false, `${d.column}=${r[d.column]}`,
              `discriminator mismatch: expected ${d.value}, read ${r[d.column]}. ` +
              `The query did not see the data it must see (R1).`);
        }
      }

      if (expectRows !== undefined && rows.length !== expectRows)
        return done(false, `${rows.length} rows`, `expected exactly ${expectRows} row(s)`);

      // assertions — every one, against every row, observed value always recorded.
      const observed = {};
      for (const a of proof.expect) {
        const op = CMP[a.op];
        if (!op) return done(false, null, `unknown operator "${a.op}"`);
        for (const r of rows) {
          if (!(a.column in r))
            return done(false, null, `column "${a.column}" absent from result`);
          const got = num(r[a.column]);
          observed[a.column] = r[a.column];
          if (!op(got, num(a.value)))
            return done(false, observed,
              `${a.column} = ${r[a.column]}, expected ${a.op} ${a.value}`);
        }
      }

      return done(true, { ...observed, _file_sha: fileSha, _rows: rows.length });
    } catch (e) {
      return done(false, null, String(e.message || e).slice(0, 300));
    }
  };
}

/* ---------- R4 layer 2 — the transaction itself is read-only ---------- */
// PER-PROOF rls (packet 10, 2026-08-30): bypass_rls is set ONLY when the caller resolved
// rls:"bypass" for THIS proof, never at the connection/module level. C30 (rls_sensitive:true)
// always resolves to "enforced" (assertSqlProofShape rejects any other combination at load),
// so its query runs under real RLS with no company context — it CANNOT see chart_of_accounts_
// roles and will correctly fail, not silently pass on an empty result (R2 still applies).
function defaultPgQuery(connectionString) {
  return async function (sql, opts = {}) {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET TRANSACTION READ ONLY");
      await client.query("SET LOCAL statement_timeout = '30s'");
      if (opts.rls === "bypass") await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      const res = await client.query(sql);
      await client.query("ROLLBACK");
      return res.rows;
    } finally {
      await client.end();
    }
  };
}
