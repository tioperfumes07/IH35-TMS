#!/usr/bin/env node
// GUARD — verify-relay-deposits-posted
//
// A Relay wallet-funding deposit that landed on the bank feed (banking.bank_transactions.source_ref 'relay_deposit:<id>')
// from a KNOWN funding card must have its posted relay_deposit journal entry (integrations.relay_deposits.posted_journal_entry_id
// -> accounting.journal_entries status 'posted', not voided) within 24 hours. A known-card deposit with no posted JE for more than
// 24 hours FAILS. A deposit from a card nobody has identified (no integrations.relay_company_cards row and not in
// RELATED_PARTY_CARD_MAP) is held BY DESIGN (an owner ruling names it: loan, capital, or company) — it is REPORTED, never failed.
//
// Known cards = integrations.relay_company_cards (active, not voided) UNION the keys of RELATED_PARTY_CARD_MAP + the USMCA own
// card in apps/backend/src/accounting/bank-recon/related-party-card-map.ts. USMCA only.
//
// Live money guard: cannot connect => FAIL (ROUND 29.9-B). --selftest runs on planted rows and needs no database.
export const REQUIRES_LIVE_DB = "money-relevant (Relay wallet funding posting) — must fail-closed, never skip, per ROUND 29.9-B";

import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-relay-deposits-posted";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const MAX_PENDING_HOURS = 24;
const CARD_MAP_FILE = new URL("../apps/backend/src/accounting/bank-recon/related-party-card-map.ts", import.meta.url);

/** Card last4 keys of RELATED_PARTY_CARD_MAP plus USMCA_OWN_RELAY_CARD_LAST4, read from the source (a .ts file cannot be imported here). */
export function cardsFromCode(src) {
  const out = new Set();
  const mapStart = src.indexOf("RELATED_PARTY_CARD_MAP");
  const body = mapStart >= 0 ? src.slice(src.indexOf("Object.freeze", mapStart)) : "";
  for (const m of body.matchAll(/^\s*"(\d{4})":\s*\{/gm)) out.add(m[1]);
  const own = src.match(/USMCA_OWN_RELAY_CARD_LAST4\s*=\s*"(\d{4})"/);
  if (own) out.add(own[1]);
  return out;
}

/**
 * rows: { source_ref, created_at (ISO), card_last4|null, has_posted_je }
 * Returns { failing, held_unknown_card, posted, young }.
 */
export function evaluate(rows, knownCards, now) {
  const failing = [];
  const held = [];
  const young = [];
  let posted = 0;
  for (const r of rows) {
    if (r.has_posted_je) {
      posted += 1;
      continue;
    }
    const known = r.card_last4 != null && knownCards.has(r.card_last4);
    if (!known) {
      held.push(r);
      continue;
    }
    const ageH = (now.getTime() - new Date(r.created_at).getTime()) / 3_600_000;
    if (ageH > MAX_PENDING_HOURS) failing.push({ ...r, age_hours: Math.round(ageH * 10) / 10 });
    else young.push(r);
  }
  return { failing, held_unknown_card: held, posted, young };
}

async function measure(client, codeCards) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
  const cards = await client.query(
    `SELECT card_last4 FROM integrations.relay_company_cards
      WHERE operating_company_id = $1::uuid AND is_active AND voided_at IS NULL`,
    [USMCA_COMPANY_ID]
  );
  const known = new Set([...codeCards, ...cards.rows.map((r) => r.card_last4)]);
  const res = await client.query(
    `SELECT bt.source_ref, bt.created_at::text AS created_at, rd.funding_card_last4 AS card_last4,
            (je.id IS NOT NULL) AS has_posted_je
       FROM banking.bank_transactions bt
       LEFT JOIN integrations.relay_deposits rd
              ON rd.operating_company_id = bt.operating_company_id AND 'relay_deposit:' || rd.deposit_id = bt.source_ref
       LEFT JOIN accounting.journal_entries je
              ON je.id = rd.posted_journal_entry_id AND je.status = 'posted' AND je.voided_at IS NULL
      WHERE bt.operating_company_id = $1::uuid
        AND bt.source_ref LIKE 'relay_deposit:%'
        AND bt.voided_at IS NULL
        AND COALESCE(bt.is_sample_data, false) IS NOT TRUE`,
    [USMCA_COMPANY_ID]
  );
  await client.query("ROLLBACK");
  return { rows: res.rows, known };
}

function selftest() {
  const now = new Date("2026-11-10T12:00:00Z");
  const known = new Set(["0680", "0210"]);
  const hoursAgo = (h) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const planted = [
    { source_ref: "relay_deposit:ok", created_at: hoursAgo(100), card_last4: "0680", has_posted_je: true },
    { source_ref: "relay_deposit:young", created_at: hoursAgo(2), card_last4: "0680", has_posted_je: false },
    { source_ref: "relay_deposit:stuck", created_at: hoursAgo(30), card_last4: "0210", has_posted_je: false },
    { source_ref: "relay_deposit:edge24", created_at: hoursAgo(24), card_last4: "0680", has_posted_je: false },
    { source_ref: "relay_deposit:unknown", created_at: hoursAgo(500), card_last4: "7941", has_posted_je: false },
    { source_ref: "relay_deposit:nodeposit", created_at: hoursAgo(500), card_last4: null, has_posted_je: false },
  ];
  const r = evaluate(planted, known, now);
  const errs = [];
  if (r.failing.length !== 1 || r.failing[0].source_ref !== "relay_deposit:stuck") errs.push(`stuck known-card row not the only failure: ${JSON.stringify(r.failing.map((x) => x.source_ref))}`);
  if (r.held_unknown_card.map((x) => x.source_ref).sort().join() !== "relay_deposit:nodeposit,relay_deposit:unknown") errs.push("unknown-card rows must be reported, not failed");
  if (r.young.length !== 2) errs.push("rows within 24h (incl. exactly 24h) must not fail");
  if (r.posted !== 1) errs.push("posted row miscounted");
  const clean = evaluate(planted.filter((p) => p.source_ref === "relay_deposit:ok" || p.source_ref === "relay_deposit:unknown"), known, now);
  if (clean.failing.length !== 0) errs.push("posted + unknown-only set must pass");
  const codeCards = cardsFromCode(readFileSync(CARD_MAP_FILE, "utf8"));
  for (const c of ["0210", "6248", "9855", "0680"]) if (!codeCards.has(c)) errs.push(`code card map parse lost ${c}`);
  if (codeCards.has("7941")) errs.push("7941 must not be a known card");
  if (errs.length) {
    console.error(`${LABEL} --selftest FAIL:\n - ${errs.join("\n - ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${LABEL} --selftest PASS — planted: 1 stuck known-card row caught (30h), 2 unknown-card rows reported not failed, 2 young rows (2h, 24h) pass, 1 posted pass; code card map parsed ${codeCards.size} cards (7941 not among them)`);
}

async function run() {
  if (process.argv.includes("--selftest")) return selftest();
  const codeCards = cardsFromCode(readFileSync(CARD_MAP_FILE, "utf8"));
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const { rows, known } = await measure(client, codeCards);
    const r = evaluate(rows, known, new Date());
    for (const h of r.held_unknown_card) {
      console.log(`${LABEL}: REPORT held by design (card ${h.card_last4 ?? "unknown"} not identified) — ${h.source_ref}, pending since ${h.created_at}`);
    }
    if (r.failing.length) {
      console.error(
        `${LABEL}: LIVE FAIL — ${r.failing.length} known-card relay deposit(s) with no posted JE for more than ${MAX_PENDING_HOURS}h: ` +
          r.failing.map((f) => `${f.source_ref} (card ${f.card_last4}, ${f.age_hours}h)`).join("; ")
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: LIVE PASS — ${rows.length} relay_deposit bank rows: ${r.posted} posted, ${r.young.length} under ${MAX_PENDING_HOURS}h, ${r.held_unknown_card.length} held (unknown card, reported).`);
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
