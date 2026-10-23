/**
 * LEAD 443.215 extension (owner 10-21 5:40 PM CT: "these must be engine fixes because something failed ... then the new updated
 * one is the correct one"). AlwaysTrack re-printed settlement 5842 on 10-21 with a different TOTAL DUE (1,645.90 → 1,726.40)
 * and nothing in the app noticed. Now:
 *   - every Creator post stores the SOURCE FINGERPRINT it was posted from (driver_settlements.source_fingerprint): settlement
 *     number, printed date, printed TOTAL DUE, printed Net Revenue, the normalized printed lines and their hash;
 *   - any later source for the same settlement number (a new PDF / feed draft) goes through the settlement's feed intake and is
 *     compared: same → "already posted"; different → "source changed: repost needed" with the exact line diff, recorded as a
 *     failing `source / source_unchanged` check (measured.new_draft carries the new source for the Edit = void and repost);
 *   - never two live settlements for one number (the Creator's settlement_exists refusal now names the verdict + diff).
 * A settlement posted before fingerprints existed is compared on its live lines (TOTAL DUE + every non-mileage line by load +
 * amount) — basis "live_lines".
 */
import { notVoided, statusNotCancelled } from "../accounting/live-document-predicates.sql.js";
import { createHash } from "node:crypto";
import { openOrGetIntakeOnClient } from "./feed-gate/feed-gate.service.js";
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";

type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type SourceLine = { kind: string; load: string | null; text: string; amount_cents: number };
export type SourceFingerprint = {
  settlement_no: string;
  printed_date: string | null;
  total_due_cents: number;
  net_revenue_cents: number | null;
  period: string;
  lines: SourceLine[];
  line_hash: string;
  basis: "draft" | "live_lines";
};
export type SourceDiff = {
  changed: Array<{ field: string; before: unknown; after: unknown }>;
  added: SourceLine[];
  removed: SourceLine[];
};
export type SourceVerdict =
  | { verdict: "new"; settlement_no: string }
  | { verdict: "already_posted" | "source_changed"; settlement_no: string; settlement_id: string; display_id: string; diff: SourceDiff; basis: SourceFingerprint["basis"] };

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const key = (l: SourceLine) => `${l.kind}|${l.load ?? ""}|${l.text}|${l.amount_cents}`;
const coarseKey = (l: SourceLine) => `${l.kind}|${l.load ?? ""}|${l.amount_cents}`;

function hashLines(lines: SourceLine[]): string {
  return createHash("sha256").update(lines.map(key).sort().join("\n")).digest("hex");
}

/** The fingerprint of a Creator draft — what the printed settlement says. */
export function fingerprintFromDraft(draft: SettlementCreatorDraft): SourceFingerprint {
  const d = draft as SettlementCreatorDraft & { source_printed_date?: string | null; pdf_company_net_revenue_cents?: number | null };
  const lines: SourceLine[] = [];
  for (const l of draft.loads ?? []) {
    lines.push({ kind: "miles", load: l.load_number, text: norm(`short ${l.miles_shortest ?? ""} empty ${l.empty_miles ?? 0} rate ${l.line_haul_rate_cents ?? ""} empty_rate ${l.empty_rate_cents ?? ""} ${l.driver_pay_mode ?? ""}`), amount_cents: 0 });
  }
  for (const a of draft.additional_pay ?? []) lines.push({ kind: "additional_pay", load: a.load_number ?? null, text: norm(a.description), amount_cents: a.amount_cents });
  for (const e of draft.expenses ?? []) {
    if (e.is_reimbursable) lines.push({ kind: "reimbursement", load: e.load_number ?? null, text: norm(e.description), amount_cents: e.amount_cents });
    else lines.push({ kind: "company_expense", load: e.load_number ?? null, text: norm(`${e.description} ${e.vendor_document_number ?? ""}`), amount_cents: e.amount_cents });
  }
  for (const r of (draft as { reimbursements?: Array<{ description?: string; amount_cents: number; load_number?: string | null }> }).reimbursements ?? [])
    lines.push({ kind: "reimbursement", load: r.load_number ?? null, text: norm(r.description), amount_cents: r.amount_cents });
  for (const x of draft.deductions ?? []) lines.push({ kind: "deduction", load: x.load_number ?? null, text: norm(x.description), amount_cents: x.amount_cents });
  for (const x of draft.escrow ?? []) lines.push({ kind: "escrow", load: x.load_number ?? null, text: norm(x.description), amount_cents: x.amount_cents });
  for (const f of draft.fuel_purchases ?? []) lines.push({ kind: "fuel", load: f.load_number ?? null, text: norm(`${f.invoice ?? ""} ${f.fuel_type ?? "diesel"} ${f.card}`), amount_cents: Number(f.receipt_cents ?? 0) });
  lines.sort((a, b) => key(a).localeCompare(key(b)));
  return {
    settlement_no: String(draft.settlement_no ?? "").trim(),
    printed_date: d.source_printed_date ?? null,
    total_due_cents: draft.pdf_driver_net_cents,
    net_revenue_cents: d.pdf_company_net_revenue_cents ?? null,
    period: `${draft.period_start}..${draft.period_end}`,
    lines,
    line_hash: hashLines(lines),
    basis: "draft",
  };
}

/** A settlement posted before fingerprints: its live lines (non-mileage, by load + amount) and net pay. */
async function fingerprintFromLive(client: Q, companyId: string, settlementId: string, settlementNo: string): Promise<SourceFingerprint> {
  const head = (await client.query<{ net_pay: string; period_start: string; period_end: string }>(
    `SELECT net_pay::text, period_start::text, period_end::text FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [settlementId, companyId])).rows[0]!;
  const rows = (await client.query<{ line_type: string; load_number: string | null; amount: string }>(
    `SELECT sl.line_type, l.load_number, sl.amount::text FROM driver_finance.settlement_lines sl LEFT JOIN mdata.loads l ON l.id = sl.load_id
      WHERE sl.settlement_id = $1::uuid AND sl.is_active IS TRUE AND sl.line_type NOT IN ('earnings', 'deadhead_pay')`,
    [settlementId])).rows;
  const kind = (t: string) => (t === "extra_pay" ? "additional_pay" : t === "escrow_contribution" ? "escrow" : t);
  const lines = rows.map((r) => ({ kind: kind(r.line_type), load: r.load_number, text: "", amount_cents: Math.round(Number(r.amount) * 100) }))
    .sort((a, b) => coarseKey(a).localeCompare(coarseKey(b)));
  return { settlement_no: settlementNo, printed_date: null, total_due_cents: Math.round(Number(head.net_pay) * 100), net_revenue_cents: null,
    period: `${head.period_start}..${head.period_end}`, lines, line_hash: hashLines(lines), basis: "live_lines" };
}

/** The exact difference between the posted source and a new one. */
export function diffSourceFingerprints(posted: SourceFingerprint, incoming: SourceFingerprint): SourceDiff {
  const coarse = posted.basis === "live_lines";
  const k = coarse ? coarseKey : key;
  const inc = coarse
    ? incoming.lines.filter((l) => !["miles", "fuel", "company_expense"].includes(l.kind)).map((l) => ({ ...l, text: "" }))
    : incoming.lines;
  const count = (ls: SourceLine[]) => ls.reduce((m, l) => m.set(k(l), (m.get(k(l)) ?? 0) + 1), new Map<string, number>());
  const a = count(posted.lines), b = count(inc);
  const added: SourceLine[] = [], removed: SourceLine[] = [];
  for (const l of inc) { const n = a.get(k(l)) ?? 0; if (n > 0) a.set(k(l), n - 1); else added.push(l); }
  for (const l of posted.lines) { const n = b.get(k(l)) ?? 0; if (n > 0) b.set(k(l), n - 1); else removed.push(l); }
  const changed: SourceDiff["changed"] = [];
  if (posted.total_due_cents !== incoming.total_due_cents) changed.push({ field: "total_due_cents", before: posted.total_due_cents, after: incoming.total_due_cents });
  if (posted.net_revenue_cents != null && incoming.net_revenue_cents != null && posted.net_revenue_cents !== incoming.net_revenue_cents)
    changed.push({ field: "net_revenue_cents", before: posted.net_revenue_cents, after: incoming.net_revenue_cents });
  if (posted.period !== incoming.period) changed.push({ field: "period", before: posted.period, after: incoming.period });
  if (posted.printed_date && incoming.printed_date && posted.printed_date !== incoming.printed_date)
    changed.push({ field: "printed_date", before: posted.printed_date, after: incoming.printed_date });
  return { changed, added, removed };
}

export const sourceDiffIsEmpty = (d: SourceDiff) =>
  d.added.length === 0 && d.removed.length === 0 && d.changed.filter((c) => c.field !== "printed_date").length === 0;

/** Store the source a settlement was posted from (the Creator calls this at post). */
export async function storeSettlementSourceFingerprint(client: Q, companyId: string, settlementId: string, draft: SettlementCreatorDraft): Promise<SourceFingerprint> {
  const fp = fingerprintFromDraft(draft);
  await client.query(
    `UPDATE driver_finance.driver_settlements SET source_fingerprint = $3::jsonb, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [settlementId, companyId, JSON.stringify(fp)]);
  return fp;
}

/**
 * Compare a new source (draft) for a settlement number against the live settlement posted from it, and record the result on
 * the settlement's feed intake (check group "source", key "source_unchanged"). No live settlement → verdict "new".
 */
export async function checkSettlementSourceOnClient(
  client: Q,
  input: { operatingCompanyId: string; draft: SettlementCreatorDraft; actorUserId: string; record?: boolean },
): Promise<SourceVerdict> {
  const no = String(input.draft.settlement_no ?? "").trim();
  const live = (await client.query<{ id: string; display_id: string; source_fingerprint: SourceFingerprint | null }>(
    `SELECT id::text, display_id, source_fingerprint FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND source_document_ref = $2 AND ${notVoided()} AND ${statusNotCancelled()}
      ORDER BY created_at DESC LIMIT 1`,
    [input.operatingCompanyId, no])).rows[0];
  if (!no || !live) return { verdict: "new", settlement_no: no };
  const posted = live.source_fingerprint ?? (await fingerprintFromLive(client, input.operatingCompanyId, live.id, no));
  const incoming = fingerprintFromDraft(input.draft);
  const diff = diffSourceFingerprints(posted, incoming);
  const same = sourceDiffIsEmpty(diff);
  if (input.record === false) return { verdict: same ? "already_posted" : "source_changed", settlement_no: no, settlement_id: live.id, display_id: live.display_id, diff, basis: posted.basis };
  const intake = await openOrGetIntakeOnClient(client as never, input.operatingCompanyId, "settlement", live.id, input.actorUserId);
  await client.query(
    `INSERT INTO driver_finance.feed_intake_checks
       (operating_company_id, intake_id, run_no, check_group, check_key, status, subject_table, subject_id, subject_label, missing, fix_link, measured)
     VALUES ($1::uuid, $2::uuid, $3, 'source', 'source_unchanged', $4, 'driver_finance.driver_settlements', $5::uuid, $6, $7, $8, $9::jsonb)`,
    [input.operatingCompanyId, intake.id, Number((intake as { last_run_no?: number }).last_run_no ?? 0), same ? "pass" : "fail", live.id,
      `Settlement ${no} (${live.display_id})`,
      same ? null : "source changed: repost needed",
      same ? null : `/settlements?creator_edit=${encodeURIComponent(no)}`,
      JSON.stringify({ verdict: same ? "already_posted" : "source_changed", basis: posted.basis, diff, posted_total_due_cents: posted.total_due_cents,
        new_total_due_cents: incoming.total_due_cents, new_fingerprint: incoming, ...(same ? {} : { new_draft: input.draft }) })]);
  return { verdict: same ? "already_posted" : "source_changed", settlement_no: no, settlement_id: live.id, display_id: live.display_id, diff, basis: posted.basis };
}

/** Human summary of a diff, one line per change (for refusals and the Settlements screen). */
export function describeSourceDiff(d: SourceDiff): string[] {
  const money = (c: number) => (c / 100).toFixed(2);
  return [
    ...d.changed.map((c) => (c.field.endsWith("_cents") ? `${c.field.replace("_cents", "")}: ${money(Number(c.before))} → ${money(Number(c.after))}` : `${c.field}: ${String(c.before)} → ${String(c.after)}`)),
    ...d.added.map((l) => `+ ${l.kind}${l.load ? ` load ${l.load}` : ""}${l.text ? ` "${l.text}"` : ""} ${money(l.amount_cents)}`),
    ...d.removed.map((l) => `− ${l.kind}${l.load ? ` load ${l.load}` : ""}${l.text ? ` "${l.text}"` : ""} ${money(l.amount_cents)}`),
  ];
}
