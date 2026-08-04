#!/usr/bin/env node
/**
 * GUARD — BANK-F03: nothing may reverse a posted journal entry unless a corrected entry can actually
 * be posted afterwards.
 *
 * THE DEFECT (mine, introduced in PR #4225 and caught on a prod fork before it reached production
 * data). BANK-F01 made undo-categorization reverse the JE it had posted, which fixed a stale-ledger
 * bug. But the canonical poster CANNOT re-post a source transaction after a reversal: its batch
 * idempotency key ends in `posting_purpose`, and PostingPurpose has only `initial_post | reversal`, so
 * exactly one initial_post batch can ever exist per source transaction. Calling the poster again
 * returns the EXISTING batch and reports success.
 *
 * The resulting sequence was: reverse the entry -> clear the link -> corrected categorization silently
 * returns the original batch. The expense did not move to the right account; it disappeared from the
 * books. Proven on prod fork br-falling-dew-aksttr2j: 20 rows reversed, fuel expense down exactly
 * $4,593.94, target accounts ZERO lines, poster returning `posted: true` with the ORIGINAL je id.
 *
 * A wrong account on the books is recoverable by a later correction. An expense silently deleted from
 * the ledger is not — nothing surfaces it, and the P&L is understated with no audit signal. So while
 * the poster lacks a repost capability, the only honest behaviour is to REFUSE the undo.
 *
 * WHAT IT ENFORCES:
 *   A. posting-engine.service.ts exports POSTING_ENGINE_SUPPORTS_REPOST — a single, greppable place
 *      where the capability is declared, so consumers cannot each invent their own assumption;
 *   B. the undo-categorization handler consults it and refuses when a JE exists;
 *   C. the refusal is placed BEFORE the reversal call, so a refused undo reverses nothing;
 *   D. if the flag is ever flipped true, PostingPurpose must have gained a real third member — the
 *      flag cannot be flipped on its own to unblock a caller. This is the ratchet: it makes the
 *      capability claim and the capability itself impossible to separate.
 *
 * (D) is the assertion that matters most. Without it the cheapest way to "fix" a blocked undo is to
 * set the flag true, which would restore the exact defect this exists to prevent.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:no-reverse-without-repost";
const ENGINE = "apps/backend/src/accounting/posting-engine.service.ts";
const ROUTES = "apps/backend/src/banking/banking.routes.ts";
const FLAG = "POSTING_ENGINE_SUPPORTS_REPOST";

/**
 * Strip comments before any ordering assertion. Both BANK-F01 and BANK-F03 DESCRIBE the reversal and
 * the capability flag in prose directly above the code, so an indexOf over the raw text finds the
 * comment, not the call — which made this guard fail against its own correct fix. Ordering claims must
 * be made about executable code only.
 */
export function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Isolate the undo-categorization handler so assertions cannot be satisfied by some other route. */
export function extractUndoHandler(src) {
  const start = String(src).indexOf('app.post("/api/v1/banking/transactions/:id/undo-categorization"');
  if (start < 0) return null;
  const rest = String(src).slice(start + 10);
  const nextPost = rest.indexOf("app.post(");
  const nextGet = rest.indexOf("app.get(");
  const ends = [nextPost, nextGet].filter((i) => i > 0);
  const end = ends.length ? start + 10 + Math.min(...ends) : String(src).length;
  return String(src).slice(start, end);
}

export function analyse(files) {
  const problems = [];
  const engine = files[ENGINE];
  const routes = files[ROUTES];

  if (engine == null) {
    problems.push(`${ENGINE} is missing — cannot verify the repost capability declaration.`);
  } else {
    const decl = new RegExp(`export const ${FLAG}\\s*=\\s*(true|false)`).exec(engine);
    if (!decl) {
      problems.push(
        `${ENGINE} does not export ${FLAG}. It is the single declaration of whether the poster can ` +
          `re-post after a reversal; without it every caller invents its own assumption, which is how ` +
          `an expense silently vanished from the ledger.`
      );
    } else if (decl[1] === "true") {
      // (D) the ratchet — the claim and the capability cannot be separated.
      const purposes = /export type PostingPurpose\s*=\s*([^;]+);/.exec(engine);
      const members = purposes ? [...purposes[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
      const hasThird = members.some((m) => m !== "initial_post" && m !== "reversal");
      if (!hasThird) {
        problems.push(
          `${ENGINE}: ${FLAG} is true but PostingPurpose is still ${JSON.stringify(members)} — the batch ` +
            `idempotency key ends in posting_purpose, so a re-post would still collide with the original ` +
            `initial_post batch and silently return it. Flipping the flag without a real third purpose ` +
            `(or a revision counter in the key) re-creates the vanished-expense defect.`
        );
      }
    }
  }

  if (routes == null) {
    problems.push(`${ROUTES} is missing.`);
    return problems;
  }
  const handler = extractUndoHandler(routes);
  if (handler == null) {
    problems.push(
      `${ROUTES}: the undo-categorization route was not found — repoint this guard rather than leaving ` +
        `it silently unable to check the reversal path.`
    );
    return problems;
  }

  const code = stripComments(handler);
  const flagIdx = code.indexOf(FLAG);
  // Match the CALL, not a prose mention.
  const reverseIdx = code.search(/\breverseJournalEntryNoFlip\s*\(/);

  if (flagIdx < 0) {
    problems.push(
      `${ROUTES} undo-categorization reverses a journal entry without consulting ${FLAG}. While the ` +
        `poster cannot re-post, reversing leaves the expense unrecorded — the handler must REFUSE.`
    );
  }
  if (flagIdx >= 0 && reverseIdx >= 0 && flagIdx > reverseIdx) {
    problems.push(
      `${ROUTES} undo-categorization checks ${FLAG} AFTER calling reverseJournalEntryNoFlip. The ` +
        `refusal must come FIRST — a refused undo must reverse nothing.`
    );
  }
  return problems;
}

function readAll() {
  const out = {};
  for (const f of [ENGINE, ROUTES]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  const engineFalse = `export type PostingPurpose = "initial_post" | "reversal";\nexport const ${FLAG} = false;`;
  const engineTrueNoPurpose = `export type PostingPurpose = "initial_post" | "reversal";\nexport const ${FLAG} = true;`;
  const engineTrueWithPurpose = `export type PostingPurpose = "initial_post" | "reversal" | "repost";\nexport const ${FLAG} = true;`;

  const mk = (body) =>
    `app.post("/api/v1/banking/transactions/:id/undo-categorization", async (req, reply) => {\n${body}\n});\napp.get("/x", async () => {});\n`;

  const good = mk(`
      const priorJournalEntryId = row.matched_journal_entry_id;
      if (priorJournalEntryId && !${FLAG}) { return { status: "repost_unsupported" }; }
      if (priorJournalEntryId) { await reverseJournalEntryNoFlip(client, {}); }
  `);
  // The REAL PR #4225 shape: reverses with no capability check at all.
  const preFix = mk(`
      const priorJournalEntryId = row.matched_journal_entry_id;
      if (priorJournalEntryId) { await reverseJournalEntryNoFlip(client, {}); }
  `);
  const wrongOrder = mk(`
      if (priorJournalEntryId) { await reverseJournalEntryNoFlip(client, {}); }
      if (priorJournalEntryId && !${FLAG}) { return { status: "repost_unsupported" }; }
  `);

  t("flag false + refusal before reversal PASSES", analyse({ [ENGINE]: engineFalse, [ROUTES]: good }).length === 0);
  t("the REAL #4225 shape (reverse, no capability check) FAILS",
    analyse({ [ENGINE]: engineFalse, [ROUTES]: preFix }).length === 1);
  t("checking the flag AFTER reversing FAILS", analyse({ [ENGINE]: engineFalse, [ROUTES]: wrongOrder }).length === 1);
  t("flipping the flag true WITHOUT a third PostingPurpose FAILS (the ratchet)",
    analyse({ [ENGINE]: engineTrueNoPurpose, [ROUTES]: good }).length === 1);
  t("flag true WITH a real third purpose PASSES",
    analyse({ [ENGINE]: engineTrueWithPurpose, [ROUTES]: good }).length === 0);
  t("a missing flag export FAILS",
    analyse({ [ENGINE]: 'export type PostingPurpose = "initial_post" | "reversal";', [ROUTES]: good }).length >= 1);
  t("a moved/renamed undo route FAILS rather than passing vacuously",
    analyse({ [ENGINE]: engineFalse, [ROUTES]: 'app.post("/api/v1/banking/other", async () => {});' }).length === 1);
  t("another route's flag check does not satisfy this handler",
    analyse({
      [ENGINE]: engineFalse,
      [ROUTES]: mk(`      if (priorJournalEntryId) { await reverseJournalEntryNoFlip(client, {}); }`) +
        `app.post("/api/v1/other", async () => { if (!${FLAG}) return; });\n`,
    }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 8 cases (2 pass-shapes, 6 fail-shapes incl. the real #4225 shape, the fail-open ordering, cross-route leakage, and flipping the capability flag without a real third PostingPurpose)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — undo-categorization refuses to reverse while the poster cannot re-post`);
