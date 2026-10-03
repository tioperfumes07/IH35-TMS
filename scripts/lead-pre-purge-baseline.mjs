#!/usr/bin/env node
// lead-pre-purge-baseline.mjs — ROUND 365.5 / 374 (Lead, 2026-10-03).
//
// THE CONTROL THE WHOLE PURGE RESTS ON. The owner is deleting every settlement-created transaction
// and load, then re-uploading EXACTLY the same data through the settlement wizard creator. That
// makes the book itself the test: the same documents must reproduce the same totals. This writes the
// "before" side.
//
// It also answers what he actually asked for — "there are many issues in balances and from there I
// want to see them" — by listing every account with its DERIVED balance, zeros included, and
// flagging every account whose balance sits on the wrong side of its own natural sign.
//
// DERIVED, NEVER STORED. Every number here is computed from accounting.journal_entry_postings. There
// is no second place a balance lives (00-ORDER-KILL-THE-SECOND-SYSTEM-THE-LEDGER-IS-THE-BALANCE.md).
//
// READ ONLY. BEGIN READ ONLY, app.bypass_rls='lucia', USMCA only, DIRECT endpoint. It refuses to
// print a number if it finds itself connected as ih35_app, because that is the pooler and a 0 from
// the pooler is MASKED, not empty.
import fs from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "lead-pre-purge-baseline";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const money = (c) => (Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A debit-natural account should hold a debit balance; a credit-natural account a credit balance.
// An account on the wrong side is not automatically an error — a contra account lives there by
// design — but it is ALWAYS something that must be explained, never something to pass over.
const DEBIT_NATURAL = new Set(["asset", "expense", "cost_of_goods_sold", "cogs", "other_expense", "fixed_asset", "bank", "accounts_receivable", "other_current_asset", "other_asset"]);
const CREDIT_NATURAL = new Set(["liability", "income", "revenue", "equity", "other_income", "accounts_payable", "credit_card", "other_current_liability", "long_term_liability"]);

const main = async () => {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const lines = [];
  const say = (s = "") => { lines.push(s); console.log(s); };

  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

    const who = await client.query(`SELECT current_user AS u, now() AT TIME ZONE 'UTC' AS t`);
    if (who.rows[0].u === "ih35_app") {
      console.error(`${LABEL}: FAIL — connected as ih35_app (the POOLER). Every number would be masked, not empty.`);
      await client.query("ROLLBACK");
      return 1;
    }

    say(`${LABEL} — USMCA ${USMCA}`);
    say(`measured ${new Date(who.rows[0].t).toISOString().replace(".000Z", "Z")} · role ${who.rows[0].u} · DIRECT endpoint · derived from postings, never stored`);
    say("");

    const tb = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN debit_or_credit = 'debit'  THEN amount_cents ELSE 0 END), 0)::bigint AS dr,
         COALESCE(SUM(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE 0 END), 0)::bigint AS cr,
         count(*)::int AS postings
       FROM accounting.journal_entry_postings WHERE operating_company_id = $1`, [USMCA]);
    const { dr, cr, postings } = tb.rows[0];
    const diff = BigInt(dr) - BigInt(cr);

    say("TRIAL BALANCE");
    say(`  debits   ${money(dr).padStart(16)}`);
    say(`  credits  ${money(cr).padStart(16)}`);
    say(`  difference ${money(diff.toString()).padStart(14)}${diff === 0n ? "   — BALANCED" : "   *** OUT OF BALANCE ***"}`);
    say(`  postings ${String(postings).padStart(16)}`);
    say("");

    // Every account in the chart, zeros included (LAW 363.8). LEFT JOIN is the point: an account with
    // no postings must still appear, or the owner cannot tell "no activity" from "does not exist".
    const accts = await client.query(
      `SELECT a.id AS account_id, a.account_number, a.account_name, a.account_type, a.account_subtype,
              (a.deactivated_at IS NULL) AS is_active, a.opening_balance_cents,
              COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit'  THEN p.amount_cents ELSE 0 END), 0)::bigint AS dr,
              COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS cr,
              count(p.id)::int AS n
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings p
                ON p.account_id = a.id AND p.operating_company_id = $1
        WHERE a.operating_company_id = $1
        GROUP BY a.id, a.account_number, a.account_name, a.account_type, a.account_subtype, a.deactivated_at, a.opening_balance_cents
        ORDER BY a.account_number NULLS LAST, a.account_name`, [USMCA]);

    const wrongSign = [];
    let zeroAccounts = 0;
    say(`CHART OF ACCOUNTS — ${accts.rows.length} accounts, zeros included`);
    say("");
    say("  acct   name                                               type            postings           balance");
    for (const r of accts.rows) {
      const bal = BigInt(r.dr) - BigInt(r.cr);          // positive = net debit
      const type = String(r.account_type || "").toLowerCase().replace(/[^a-z_]/g, "_");
      if (bal === 0n) zeroAccounts++;
      const natural = DEBIT_NATURAL.has(type) ? "debit" : CREDIT_NATURAL.has(type) ? "credit" : "unknown";
      const side = bal > 0n ? "debit" : bal < 0n ? "credit" : "zero";
      const flag = bal !== 0n && natural !== "unknown" && side !== natural ? "  <-- WRONG SIDE" : "";
      if (flag) wrongSign.push({ ...r, bal, natural, side });
      const shown = bal < 0n ? `(${money((-bal).toString())})` : money(bal.toString());
      say(`  ${String(r.account_number ?? "").padEnd(6)} ${String(r.account_name).slice(0, 48).padEnd(50)} ${String(r.account_type ?? "").slice(0, 14).padEnd(15)} ${String(r.n).padStart(6)} ${shown.padStart(16)}${r.is_active === false ? "  [inactive]" : ""}${flag}`);
    }
    say("");
    say(`  ${zeroAccounts} account(s) at 0.00 — shown above, never hidden (LAW 363.8)`);
    say("");

    say(`ACCOUNTS SITTING ON THE WRONG SIDE OF THEIR OWN NATURAL SIGN — ${wrongSign.length}`);
    if (wrongSign.length === 0) {
      say("  none");
    } else {
      say("  Not automatically an error: a contra account belongs here by design. But every one of these");
      say("  must be EXPLAINED before the purge, because a sign that is wrong today comes back the moment");
      say("  the same data is re-entered.");
      say("");
      for (const w of wrongSign) {
        say(`  ${String(w.account_number ?? "").padEnd(6)} ${String(w.account_name).slice(0, 48).padEnd(50)} ${w.account_type} is ${w.natural}-natural, holds a ${w.side} balance of ${money((w.bal < 0n ? -w.bal : w.bal).toString())}`);
      }
    }
    say("");

    const unlinked = await client.query(
      `SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
        WHERE p.operating_company_id = $1
          AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links l WHERE l.journal_entry_posting_id = p.id)`, [USMCA]);
    const stamped = await client.query(
      `SELECT count(*)::int AS n FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1 AND load_id IS NOT NULL`, [USMCA]);

    say("LINEAGE AT BASELINE");
    say(`  postings with no spine link ....... ${unlinked.rows[0].n}   (ROUND 373 — fix the writers, then backfill, then arm the refusal)`);
    say(`  postings carrying load_id ......... ${stamped.rows[0].n}   (ROUND 363-CC1-A — column live, values land on the next deploy)`);
    say("");
    say("AFTER THE RE-UPLOAD, THE SAME DOCUMENTS MUST REPRODUCE THE TRIAL BALANCE ABOVE.");
    say("Every difference is named per account with its cause. No plugs. Ever.");

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const out = `docs/audit/${stamp}-PRE-PURGE-BASELINE-USMCA.md`;
  fs.writeFileSync(out, "# PRE-PURGE BASELINE — USMCA\n\n```\n" + lines.join("\n") + "\n```\n");
  console.log(`\nwritten: ${out}`);
  return 0;
};

main().then((c) => process.exit(c)).catch((e) => { console.error(`${LABEL}: FAIL — ${e.message}`); process.exit(1); });
