#!/usr/bin/env node
/**
 * CLS-MONEY-PRECOMMIT-SIDE-EFFECT — a GL poster that opens its OWN database connection must never be
 * awaited inline from inside an open `withCurrentUser()` transaction. It must be deferred to after
 * COMMIT via `enqueueAfterCommit` (apps/backend/src/lib/after-commit.ts).
 *
 * WHAT WAS BROKEN (LV-REVREC-NOT-FIRING, live-proven on prod 2026-08-07): `dispatch/loads.routes.ts`
 * stamped the delivery departure and then, ~40 lines later and still INSIDE the same open
 * transaction, awaited `postLoadRevenueLatch()`. That poster runs on its own connection through
 * `withLuciaBypass`, and under READ COMMITTED a second connection cannot see the first one's
 * uncommitted rows. The poster's evidence gate re-read `actual_departure_at`, found NULL, returned
 * `missing_delivery_evidence`, and posted NOTHING. The caller then committed, the row appeared, and
 * nothing ever retried. Revenue recognition was dark for every load.
 *
 * WHY THIS NEEDS A GUARD AND NOT JUST A FIX: the failure is invisible three ways over — the gate is
 * a RETURN VALUE rather than a throw so the swallow-and-log never fired; the row the poster wanted
 * did exist moments later so nothing looked wrong afterwards; and every static guard was green,
 * because the call was lexically exactly where a reader would expect it. Nothing in the codebase
 * made the ordering wrong LOOK wrong. This guard is that thing.
 *
 * WHY IT SCANS FOR THE SHAPE, NOT THE ONE FILE (§9.0.17): there are nine posting services that open
 * their own connection, and any route that calls one from inside its transaction reproduces the
 * defect exactly — silently, because the symptom is a missing ledger row, not an error. The poster
 * set is DISCOVERED from the source (a non-test file that imports both `withLuciaBypass` and
 * `createJournalEntry`), so a tenth poster added tomorrow is covered without editing this file.
 *
 * IT ALSO GUARDS THE PRIMITIVE ITSELF. A queue that is never drained, or drained after a ROLLBACK,
 * or not truncated when a SAVEPOINT rolls back, is worse than no queue: the first silently drops
 * money side-effects, the last two fire one for a write that never happened. The savepoint half is
 * not hypothetical — the bulk runner gives every row its own savepoint on the shared outer client,
 * and revrec Event 2 keys off Event 1's existence rather than a re-read of load status, so a
 * rolled-back bulk `completed_docs_received` row would otherwise have posted DR A/R / CR Unbilled
 * for a load that never moved.
 *
 * NOT CLAIMED: this is a static scan. It proves the ORDERING is structurally enforced, not that any
 * given entry posted — posting depends on the per-entity flag and each poster's own gates, which
 * the posters' db tests exercise.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-money-side-effect-after-commit";
const SRC = "apps/backend/src";

const DB_FILE = "apps/backend/src/auth/db.ts";
const QUEUE_FILE = "apps/backend/src/lib/after-commit.ts";

/** A file is a cross-connection GL poster when it opens its own connection AND writes journal entries. */
const OWN_CONNECTION_MARKER = "withLuciaBypass";
const GL_WRITE_MARKER = "createJournalEntry";

/**
 * Files allowed to call a poster inside a transaction scope — a stated decision, never a silencer.
 * Only the queue module itself, which defines the primitive and opens no transaction. Poster files
 * are skipped separately (a poster calling itself is not a caller). The shared latch helper is
 * deliberately NOT exempt: it is the highest-traffic user of the queue and must be held to the
 * handled-return rule like anyone else.
 */
const EXEMPT_CALLERS = new Set([QUEUE_FILE]);

/** Strip comments and string/template literals so the paren matcher and call scan see code only. */
function stripNonCode(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** [start, end) of the argument list of every `NAME(` call in `code`. */
function callArgSpans(code, name) {
  const spans = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  let m;
  while ((m = re.exec(code))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < code.length && depth > 0) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") depth--;
      i++;
    }
    if (depth === 0) spans.push([start, i - 1]);
  }
  return spans;
}

/**
 * Names that open a transaction scope, DISCOVERED to a fixpoint rather than hardcoded.
 *
 * THIS IS THE HALF THAT MADE THE FIRST DRAFT OF THIS GUARD USELESS. Scanning only `withCurrentUser(`
 * spans missed the actual defect: `dispatch/loads.routes.ts` runs its status handler inside
 * `withCompanyScope(...)`, one of NINE per-module wrappers that each `return withCurrentUser(...)`
 * and hand the SAME client object down. Replanting the real inline poster call in the real file left
 * the guard GREEN — a guard that passes with the defect it was written for is not a guard.
 *
 * So a scope opener is: an exported function whose body RETURNS a call to a known opener. Seeded
 * with the two wrappers that actually issue `BEGIN` and iterated until the set stops growing, which
 * picks up every existing wrapper and any wrapper added later. The `return` requirement is what
 * keeps it from swallowing every route registrar that merely happens to call a wrapper somewhere
 * inside a handler.
 *
 * BOTH SEEDS, NOT JUST THE SCOPED ONE. `withLuciaBypass` opens a real transaction on its own pool,
 * so a caller inside it that awaits a poster reproduces the defect exactly — the poster takes a
 * SECOND luciaPool client and still cannot see the uncommitted rows. Seeding only `withCurrentUser`
 * would have covered half the class while reading, from the outside, as if it covered all of it.
 * (Measured when this seed was widened: zero existing sites violate it, so the coverage is free
 * today and the point is that it stays that way.)
 */
const SCOPE_SEEDS = ["withCurrentUser", "withLuciaBypass"];

export function discoverScopeOpeners(files) {
  const openers = new Set(SCOPE_SEEDS);
  const bodies = [];
  for (const { src } of files) {
    const code = stripNonCode(src);
    const re = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g;
    let m;
    while ((m = re.exec(code))) {
      const open = code.indexOf("{", re.lastIndex);
      if (open === -1) continue;
      let depth = 1;
      let i = open + 1;
      while (i < code.length && depth > 0) {
        if (code[i] === "{") depth++;
        else if (code[i] === "}") depth--;
        i++;
      }
      bodies.push({ name: m[1], body: code.slice(open, i) });
    }
  }
  for (;;) {
    let grew = false;
    for (const { name, body } of bodies) {
      if (openers.has(name)) continue;
      for (const opener of openers) {
        if (new RegExp(`return\\s+(?:await\\s+)?${opener}\\s*\\(`).test(body)) {
          openers.add(name);
          grew = true;
          break;
        }
      }
    }
    if (!grew) break;
  }
  return openers;
}

/** [start, end) of the argument list of every scope-opening call — i.e. each callback body. */
function transactionScopes(code, openers) {
  const spans = [];
  for (const opener of openers) {
    for (const [start, end] of callArgSpans(code, opener)) spans.push([start, end, opener]);
  }
  return spans;
}

/**
 * Blank out the arguments of every `enqueueAfterCommit(...)`. A poster call in there is DEFERRED —
 * that IS the fix — so it must not read as a violation. Blanking (rather than deleting) preserves
 * every other offset in the file.
 */
function blankDeferredTasks(code) {
  let out = code;
  for (const [start, end] of callArgSpans(code, "enqueueAfterCommit")) {
    out = out.slice(0, start) + " ".repeat(end - start) + out.slice(end);
  }
  return out;
}

/**
 * `enqueueAfterCommit` returns FALSE when the client is not inside a managed transaction, and the
 * caller must then run the work itself. Ignoring that return value silently drops a money
 * side-effect — the exact class this module exists to end — so the return must be consumed.
 */
function unhandledEnqueueResults(code) {
  const hits = [];
  const re = /\benqueueAfterCommit\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const stmtStart = Math.max(
      code.lastIndexOf(";", m.index),
      code.lastIndexOf("{", m.index),
      code.lastIndexOf("}", m.index)
    );
    const lead = code.slice(stmtStart + 1, m.index);
    if (!/[=!?]|\bif\b|\breturn\b|&&|\|\|/.test(lead)) hits.push(m.index);
  }
  return hits;
}

/**
 * Exported functions of a poster module that THEMSELVES open a connection — the call names a route
 * would use to trigger a cross-connection post.
 *
 * Scoped to the function BODY, not the file, deliberately. A poster module also exports pure
 * helpers next to the poster — `buildEarnEvent1Postings`, `standingLatchJePredicate`,
 * `dollarsToCents` — and a file-wide name sweep makes every one of those a "poster", so a route
 * doing arithmetic gets flagged for a defect it cannot have. That false positive is not cosmetic:
 * a guard that cries wolf on `dollarsToCents()` is a guard someone exempts their file from, and
 * then the real ordering bug walks through the exemption.
 */
export function exportedFunctionNames(src) {
  const code = stripNonCode(src);
  const names = [];
  const re = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g;
  let m;
  while ((m = re.exec(code))) {
    const open = code.indexOf("{", re.lastIndex);
    if (open === -1) continue;
    let depth = 1;
    let i = open + 1;
    while (i < code.length && depth > 0) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") depth--;
      i++;
    }
    if (code.slice(open, i).includes(OWN_CONNECTION_MARKER)) names.push(m[1]);
  }
  return names;
}

/**
 * @param files [{rel, src}] every non-test backend source file
 * @param posterNamesByFile optional override for the selftest; otherwise discovered from `files`
 */
export function auditSources(files, posterNamesByFile) {
  const posterNames = new Map(); // name -> defining file
  if (posterNamesByFile) {
    for (const [rel, names] of Object.entries(posterNamesByFile)) {
      for (const n of names) posterNames.set(n, rel);
    }
  } else {
    for (const { rel, src } of files) {
      if (!src.includes(OWN_CONNECTION_MARKER) || !src.includes(GL_WRITE_MARKER)) continue;
      for (const n of exportedFunctionNames(src)) posterNames.set(n, rel);
    }
  }

  const openers = discoverScopeOpeners(files);
  const problems = [];
  let scanned = 0;
  for (const { rel, src } of files) {
    if (EXEMPT_CALLERS.has(rel)) continue;
    if (posterNames.has(rel)) continue;
    const raw = stripNonCode(src);

    for (const _ of unhandledEnqueueResults(raw)) {
      problems.push(
        `${rel}: calls enqueueAfterCommit() without using its return value. It returns FALSE when the ` +
          `client is not inside a managed transaction, and the caller must then run the work itself — ` +
          `ignoring it silently DROPS the side-effect. Branch on the result (see ` +
          `apps/backend/src/dispatch/delivery-evidence-latch.ts).`
      );
    }

    const code = blankDeferredTasks(raw);
    const spans = transactionScopes(code, openers);
    if (spans.length === 0) continue;
    scanned++;
    for (const [start, end, opener] of spans) {
      const body = code.slice(start, end);
      for (const [name, definedIn] of posterNames) {
        if (definedIn === rel) continue;
        if (!new RegExp(`\\b${name}\\s*\\(`).test(body)) continue;
        problems.push(
          `${rel}: calls ${name}() (a GL poster defined in ${definedIn}, which opens its OWN ` +
            `connection via ${OWN_CONNECTION_MARKER}) from INSIDE a ${opener}() transaction. ` +
            `Under READ COMMITTED that second connection cannot see this transaction's uncommitted ` +
            `writes, so the poster's gates read stale rows and post nothing — silently, since a gate ` +
            `is a return value, not a throw. Defer it with enqueueAfterCommit(client, …) from ` +
            `${QUEUE_FILE} so it runs after COMMIT.`
        );
      }
    }
  }
  return { problems, scanned, posterCount: new Set(posterNames.values()).size, openers };
}

/** Body of `function NAME(...) { … }` in already-stripped code, or "" when absent. */
function functionBody(code, name) {
  const m = new RegExp(`function\\s+${name}\\b`).exec(code);
  if (!m) return "";
  const open = code.indexOf("{", m.index + m[0].length);
  if (open === -1) return "";
  let depth = 1;
  let i = open + 1;
  while (i < code.length && depth > 0) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
    i++;
  }
  return code.slice(open, i);
}

/**
 * The after-commit primitive is load-bearing: assert it is wired, drained, and rollback-safe.
 *
 * SCOPED PER WRAPPER, NOT FILE-WIDE. Both `withCurrentUser` and `withLuciaBypass` open a real
 * transaction, so both must open and drain a queue. A file-wide substring check cannot tell the
 * difference between "both wrappers are wired" and "one is wired twice" — delete the drain from
 * `withLuciaBypass` and a file-wide check stays green because `withCurrentUser` still mentions it.
 * That is the exact shape of green-with-the-defect-present this guard exists to refuse.
 */
export function auditPrimitive(dbSrc, queueSrc) {
  const problems = [];
  const db = stripNonCode(dbSrc);
  const queue = stripNonCode(queueSrc);

  const need = (hay, needle, where, why) => {
    if (!hay.includes(needle)) problems.push(`${where}: missing ${needle} — ${why}`);
  };

  for (const wrapper of SCOPE_SEEDS) {
    const body = functionBody(db, wrapper);
    if (!body) {
      problems.push(
        `${DB_FILE}: no ${wrapper}() found — the transaction wrapper this guard anchors on was ` +
          `renamed or removed, so its after-commit wiring can no longer be checked at all.`
      );
      continue;
    }
    need(body, "beginAfterCommitScope(", `${DB_FILE} ${wrapper}()`, "the wrapper must open the queue, or every enqueue inside it silently falls back to firing inline — pre-commit, which IS the original defect.");
    need(body, "drainAfterCommit(", `${DB_FILE} ${wrapper}()`, "a queue that is never drained silently DROPS every deferred money side-effect.");
    need(body, "discardAfterCommit(", `${DB_FILE} ${wrapper}()`, "a rolled-back transaction must drop its queue — a side effect must never outlive the write that justified it.");
  }

  const savepoint = functionBody(db, "withSavepoint");
  if (!savepoint) {
    problems.push(`${DB_FILE}: no withSavepoint() found — the savepoint half of the queue rollback cannot be checked.`);
  } else {
    need(savepoint, "afterCommitMark(", `${DB_FILE} withSavepoint()`, "withSavepoint must record the queue depth so a rolled-back savepoint can truncate its tasks.");
    need(savepoint, "afterCommitRollbackTo(", `${DB_FILE} withSavepoint()`, "ROLLBACK TO SAVEPOINT must also roll back the queue, or a rolled-back bulk row still fires its money side-effect after COMMIT.");
  }

  for (const fn of ["beginAfterCommitScope", "enqueueAfterCommit", "drainAfterCommit", "discardAfterCommit", "afterCommitMark", "afterCommitRollbackTo"]) {
    if (!new RegExp(`export (?:async )?function ${fn}\\b`).test(queue)) {
      problems.push(`${QUEUE_FILE}: no exported ${fn} — the after-commit primitive is incomplete.`);
    }
  }
  return problems;
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "__tests__" || e === "dist") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (rel.endsWith(".ts") && !rel.endsWith(".d.ts") && !rel.includes(".test.")) out.push(rel);
}

function auditTree() {
  const rels = [];
  walk(SRC, rels);
  const files = rels.map((rel) => ({ rel, src: readFileSync(join(ROOT, rel), "utf8") }));
  const { problems, scanned, posterCount, openers } = auditSources(files);

  if (posterCount === 0) {
    return [
      `${LABEL}: discovered ZERO cross-connection GL posters — the markers are stale ` +
        `("${OWN_CONNECTION_MARKER}" / "${GL_WRITE_MARKER}" renamed?). Refusing to pass vacuously.`,
    ];
  }
  // The DISCOVERED wrappers are the whole point: seeing only the two seeds means discovery broke,
  // and a wrapper-blind scan is exactly the version of this guard that stayed green on the real
  // defect. Compared against the seed count, not a literal 2, so widening SCOPE_SEEDS can never
  // quietly satisfy this check on its own.
  if (openers.size <= SCOPE_SEEDS.length) {
    return [
      `${LABEL}: discovered no transaction-scope openers beyond the ${SCOPE_SEEDS.length} seed(s) ` +
        `(${[...openers].join(", ")}). The per-module withCompanyScope wrappers were not found — ` +
        `discovery is stale. Refusing to pass vacuously.`,
    ];
  }
  if (scanned === 0) {
    return [`${LABEL}: found ZERO transaction-scope call sites — the matcher is stale. Refusing to pass vacuously.`];
  }

  const dbAbs = join(ROOT, DB_FILE);
  const queueAbs = join(ROOT, QUEUE_FILE);
  if (!existsSync(dbAbs) || !existsSync(queueAbs)) {
    return [`${LABEL}: ${DB_FILE} or ${QUEUE_FILE} is missing — the after-commit primitive was removed.`];
  }
  problems.push(...auditPrimitive(readFileSync(dbAbs, "utf8"), readFileSync(queueAbs, "utf8")));
  return problems;
}

/** Mutation proof: each case plants the real defect and asserts this guard goes RED. */
function selftest() {
  const failures = [];
  const POSTERS = { "apps/backend/src/accounting/p/poster.service.ts": ["postLoadRevenueLatch"] };
  const posterFile = {
    rel: "apps/backend/src/accounting/p/poster.service.ts",
    src: `import { withLuciaBypass } from "../../auth/db.js";\nimport { createJournalEntry } from "../journal-entries.service.js";\nexport async function postLoadRevenueLatch(i) { return withLuciaBypass(async (c) => createJournalEntry(c, i)); }`,
  };

  // case1 — THE DEFECT: poster awaited inline inside the transaction. MUST be caught.
  const inline = {
    rel: "apps/backend/src/dispatch/loads.routes.ts",
    src: `await withCurrentUser(u, async (client) => {\n  await client.query("UPDATE mdata.load_stops SET actual_departure_at = now()");\n  await postLoadRevenueLatch({ load_id: id });\n});`,
  };
  if (auditSources([posterFile, inline], POSTERS).problems.length === 0)
    failures.push("case1 FAIL — an inline pre-commit poster call was NOT caught");

  // case2 — the FIX, as it is actually shaped: the route calls a shared HELPER from inside the
  // transaction, and the helper (which opens no transaction of its own) enqueues, with the FALSE
  // return handled by firing inline. Both files must be clean.
  const helper = {
    rel: "apps/backend/src/dispatch/delivery-evidence-latch.ts",
    src: `import { postLoadRevenueLatch } from "../accounting/p/poster.service.js";\nexport async function latchOnDeliveryEvidence(client, input) {\n  const queued = enqueueAfterCommit(client, { label: "x", run: () => postLoadRevenueLatch(input) });\n  if (!queued) await postLoadRevenueLatch(input);\n}`,
  };
  const deferred = {
    rel: "apps/backend/src/dispatch/loads.routes.ts",
    src: `await withCurrentUser(u, async (client) => {\n  await client.query("UPDATE mdata.load_stops SET actual_departure_at = now()");\n  await latchOnDeliveryEvidence(client, { loadId: id });\n});`,
  };
  if (auditSources([posterFile, helper, deferred], POSTERS).problems.length !== 0)
    failures.push("case2 FAIL — a correctly deferred call was flagged");

  // case2a — the inline FALLBACK is not a licence to call the poster directly inside a transaction.
  // Within a withCurrentUser() callback the scope always exists, so enqueueAfterCommit() cannot
  // return false and the "fallback" is dead code that reads exactly like the original defect. The
  // handled-return escape hatch belongs in a helper (case2), never in a transaction body.
  const fallbackInScope = {
    rel: "apps/backend/src/dispatch/w.routes.ts",
    src: `await withCurrentUser(u, async (client) => {\n  const queued = enqueueAfterCommit(client, { label: "x", run: () => postLoadRevenueLatch({ load_id: id }) });\n  if (!queued) await postLoadRevenueLatch({ load_id: id });\n});`,
  };
  if (auditSources([posterFile, fallbackInScope], POSTERS).problems.length === 0)
    failures.push("case2a FAIL — a dead inline fallback inside a transaction was NOT caught");

  // case2b — deferred but the FALSE return dropped on the floor: a silently lost side-effect.
  const droppedReturn = {
    rel: "apps/backend/src/dispatch/z.routes.ts",
    src: `await withCurrentUser(u, async (client) => {\n  enqueueAfterCommit(client, { label: "x", run: () => postLoadRevenueLatch({ load_id: id }) });\n});`,
  };
  if (auditSources([posterFile, droppedReturn], POSTERS).problems.length === 0)
    failures.push("case2b FAIL — an ignored enqueueAfterCommit() return was NOT caught");

  // case3 — the poster called OUTSIDE any transaction is fine (nothing to wait for).
  const outside = {
    rel: "apps/backend/src/cron/x.cron.ts",
    src: `await postLoadRevenueLatch({ load_id: id });\nawait withCurrentUser(u, async (client) => { await client.query("SELECT 1"); });`,
  };
  if (auditSources([posterFile, outside], POSTERS).problems.length !== 0)
    failures.push("case3 FAIL — a poster call outside the transaction was flagged");

  // case4 — a mention in a COMMENT inside the scope must not trip it (stripNonCode).
  const commented = {
    rel: "apps/backend/src/dispatch/y.routes.ts",
    src: `await withCurrentUser(u, async (client) => {\n  // do not call postLoadRevenueLatch({}) here — see LV-REVREC-NOT-FIRING\n  await client.query("SELECT 1");\n});`,
  };
  if (auditSources([posterFile, commented], POSTERS).problems.length !== 0)
    failures.push("case4 FAIL — a commented-out mention was flagged");

  // case5..9 — the PRIMITIVE. Deleting any half of EITHER wrapper must go RED.
  const wrapperWiring = (n) =>
    `export async function ${n}(){ beginAfterCommitScope(scoped); if (committed) await drainAfterCommit(scoped); else discardAfterCommit(scoped); }`;
  const goodDb = `export async function withSavepoint(){ const mark = afterCommitMark(client); try {} catch { afterCommitRollbackTo(client, mark); } }
${wrapperWiring("withCurrentUser")}
${wrapperWiring("withLuciaBypass")}`;
  const goodQueue = ["beginAfterCommitScope", "enqueueAfterCommit", "drainAfterCommit", "discardAfterCommit", "afterCommitMark", "afterCommitRollbackTo"]
    .map((f) => `export function ${f}(){}`)
    .join("\n");

  if (auditPrimitive(goodDb, goodQueue).length !== 0)
    failures.push("case5 FAIL — a correctly wired primitive was flagged");

  // Per WRAPPER, not per file. Breaking either one alone must be caught — a file-wide substring
  // check passes all four of these, because the OTHER wrapper still mentions the same call.
  for (const w of ["withCurrentUser", "withLuciaBypass"]) {
    const body = wrapperWiring(w);
    if (auditPrimitive(goodDb.replace(body, body.replace("await drainAfterCommit(scoped);", "")), goodQueue).length === 0)
      failures.push(`case6 FAIL — ${w}() never draining its queue was NOT caught`);
    if (auditPrimitive(goodDb.replace(body, body.replace("discardAfterCommit(scoped);", "")), goodQueue).length === 0)
      failures.push(`case7 FAIL — ${w}() not discarding its queue on ROLLBACK was NOT caught`);
    if (auditPrimitive(goodDb.replace(body, body.replace("beginAfterCommitScope(scoped);", "")), goodQueue).length === 0)
      failures.push(`case7b FAIL — ${w}() never opening a queue scope was NOT caught`);
    if (auditPrimitive(goodDb.replace(`${body}\n`, "").replace(body, ""), goodQueue).length === 0)
      failures.push(`case7c FAIL — a removed/renamed ${w}() wrapper was NOT caught`);
  }

  if (auditPrimitive(goodDb.replace("afterCommitRollbackTo(client, mark);", ""), goodQueue).length === 0)
    failures.push("case8 FAIL — a savepoint that does not roll back its queue was NOT caught");
  if (auditPrimitive(goodDb.replace("const mark = afterCommitMark(client);", ""), goodQueue).length === 0)
    failures.push("case8b FAIL — a savepoint that never marks the queue depth was NOT caught");
  if (auditPrimitive(goodDb, goodQueue.replace("export function enqueueAfterCommit(){}", "")).length === 0)
    failures.push("case9 FAIL — a primitive missing enqueueAfterCommit was NOT caught");
  if (auditPrimitive(goodDb, goodQueue.replace("export function drainAfterCommit(){}", "export async function drainAfterCommit(){}")).length !== 0)
    failures.push("case9b FAIL — an `export async function` queue export was not recognised");

  // case10..11 — DISCOVERY, exercised for real (no POSTERS override). A poster module exports pure
  // helpers beside the poster; only the function that opens the connection is a poster.
  const mixedPoster = {
    rel: "apps/backend/src/accounting/q/poster.service.ts",
    src: `import { withLuciaBypass } from "../../auth/db.js";\nimport { createJournalEntry } from "../journal-entries.service.js";\nexport function dollarsToCents(a) { return Math.round(a * 100); }\nexport async function postThing(i) { return withLuciaBypass(async (c) => createJournalEntry(c, i)); }`,
  };
  const usesHelperOnly = {
    rel: "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts",
    src: `await withCurrentUser(u, async (client) => {\n  const cents = dollarsToCents(12.5);\n  await client.query("SELECT $1", [cents]);\n});`,
  };
  if (auditSources([mixedPoster, usesHelperOnly]).problems.length !== 0)
    failures.push("case10 FAIL — a pure helper exported from a poster module was treated as a poster");
  const usesRealPoster = {
    rel: "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts",
    src: `await withCurrentUser(u, async (client) => {\n  await postThing({ id });\n});`,
  };
  if (auditSources([mixedPoster, usesRealPoster]).problems.length === 0)
    failures.push("case11 FAIL — discovery missed the real poster in a module that also exports helpers");

  // case12..14 — WRAPPER discovery. This is the case the first draft of this guard got wrong: the
  // real defect site sits inside withCompanyScope, not withCurrentUser.
  const wrapper = {
    rel: "apps/backend/src/catalogs/dispatch/shared.ts",
    src: `export async function withCompanyScope(userId, opco, fn) {\n  await assertCompanyMembership(userId, opco);\n  return withCurrentUser(userId, async (client) => {\n    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [opco]);\n    return fn(client);\n  });\n}`,
  };
  const insideWrapper = {
    rel: "apps/backend/src/dispatch/loads.routes.ts",
    src: `await withCompanyScope(u, opco, async (client) => {\n  await client.query("UPDATE mdata.load_stops SET actual_departure_at = now()");\n  await postLoadRevenueLatch({ load_id: id });\n});`,
  };
  if (auditSources([posterFile, wrapper, insideWrapper], POSTERS).problems.length === 0)
    failures.push("case12 FAIL — an inline poster call inside withCompanyScope was NOT caught");
  if (!discoverScopeOpeners([wrapper]).has("withCompanyScope"))
    failures.push("case13 FAIL — withCompanyScope was not discovered as a transaction-scope opener");

  // A wrapper of a wrapper is still a scope (fixpoint), and a registrar that merely calls one
  // somewhere inside a handler is NOT — otherwise every route file becomes a false scope.
  const nested = {
    rel: "apps/backend/src/x/shared.ts",
    src: `export async function withThing(u, o, fn) { return withCompanyScope(u, o, fn); }`,
  };
  const registrar = {
    rel: "apps/backend/src/x/routes.ts",
    src: `export async function registerXRoutes(app) {\n  app.get("/x", async () => {\n    const r = await withCompanyScope(u, o, async (c) => c.query("SELECT 1"));\n    return { r };\n  });\n}`,
  };
  const openers = discoverScopeOpeners([wrapper, nested, registrar]);
  if (!openers.has("withThing")) failures.push("case14 FAIL — a wrapper of a wrapper was not discovered");
  if (openers.has("registerXRoutes"))
    failures.push("case14b FAIL — a route registrar was misread as a transaction-scope opener");

  // case15 — the OTHER transaction wrapper. withLuciaBypass issues its own BEGIN on its own pool, so
  // a poster awaited inside it is the same cross-connection defect and must be caught identically.
  // Asserted rather than assumed: this is the half a withCurrentUser-only seed silently missed.
  const insideBypass = {
    rel: "apps/backend/src/jobs/some-worker.ts",
    src: `await withLuciaBypass(async (client) => {\n  await client.query("UPDATE mdata.load_stops SET actual_departure_at = now()");\n  await postLoadRevenueLatch({ load_id: id });\n});`,
  };
  if (auditSources([posterFile, insideBypass], POSTERS).problems.length === 0)
    failures.push("case15 FAIL — an inline poster call inside withLuciaBypass was NOT caught");
  const deferredInBypass = {
    rel: "apps/backend/src/jobs/other-worker.ts",
    src: `await withLuciaBypass(async (client) => {\n  await client.query("SELECT 1");\n  await latchOnDeliveryEvidence(client, { loadId: id });\n});`,
  };
  if (auditSources([posterFile, helper, deferredInBypass], POSTERS).problems.length !== 0)
    failures.push("case15b FAIL — a correctly deferred call inside withLuciaBypass was flagged");

  return failures;
}

const selfFailures = selftest();
if (selfFailures.length) {
  console.error(`${LABEL} SELFTEST FAILED:\n  ${selfFailures.join("\n  ")}`);
  process.exit(1);
}

const problems = auditTree();
if (problems.length) {
  console.error(`${LABEL} FAIL (${problems.length}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — no GL poster runs inside an open transaction; the after-commit queue is wired, drained, and rollback-safe`);
