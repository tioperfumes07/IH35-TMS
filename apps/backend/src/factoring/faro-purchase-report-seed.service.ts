/**
 * ACCT-F11108 — the Faro PURCHASE REPORT export, seeded as ONE file through the ONE factoring purchase engine
 * (owner order 2026-11-09 18:42 CT: "faro purchase reports, get the data seeded instantly in the app. not manually not one
 * by one"). The CSV commit (POST /api/v1/factoring/import/faro) is retired by design — it wrote Faro fundings outside the
 * purchase engine — so the report had no path in except Factoring -> Submit to Factor, one wire at a time.
 *
 * This service only DRIVES the engine: runPurchaseFeedGate -> createPurchaseDraft -> postPurchase (the secured-borrowing
 * funding poster) -> syncLoadsForFactoringAdvance. No INSERT of its own, no GL math of its own.
 *
 *  - One purchase per Faro purchase date (one Faro wire), lines = that date's invoices, Faro's own figures per line:
 *    Purchase -> gross, Escrow Rsv -> escrow reserve, Cash Rsv -> cash reserve, Discount -> fee, Inv # -> faro_invoice_number;
 *    the date's Fees column (the flat wire fee) -> wire_fee_cents.
 *  - DELTA ONLY: a Faro Inv # already on a live purchase line of this company is "already_present", never re-posted.
 *  - MATCH = PO, then Other Ref (owner ruling, ROUND 40.1) -> mdata.loads WO/PO -> that load's live invoice. Never Faro's
 *    Inv # against our invoice number, never the load number. Faro's Inv # is Faro's own sequence.
 *  - A date posts only WHOLE: every line of the date resolved and eligible, AND the engine's net to company equals the sum
 *    of Faro's Net Adv for that date (the wire). Otherwise the date is held and every line names its reason.
 *  - A Dispatch or Sch Fee amount the engine has no slot for holds the date (never dropped).
 *  - Preview runs the SAME engine inside a transaction that is rolled back, so preview and commit answer the same.
 */
import { withCompanyScope } from "../accounting/db-scope.js";
import { syncLoadsForFactoringAdvance } from "../dispatch/load-billing-lifecycle.service.js";
import { enrichFaroPreviewLines, parseFaroCsv, type FaroCsvLine } from "./faro-csv-import.js";
import { runPurchaseFeedGate } from "./purchase-candidates.service.js";
import { createPurchaseDraft, FactoringPurchaseError, postPurchase } from "./purchase.service.js";

type Q = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export type FaroSeedLineOutcome = "already_present" | "posted" | "would_post" | "held";

export type FaroSeedLine = {
  faro_invoice_number: string;
  purchase_date: string | null;
  po: string | null;
  debtor: string | null;
  gross_cents: number;
  net_advance_cents: number;
  invoice_id: string | null;
  invoice_display_id: string | null;
  outcome: FaroSeedLineOutcome;
  purchase_display_id?: string | null;
  reason?: string | null;
};

export type FaroSeedDate = {
  purchase_date: string;
  outcome: "already_present" | "posted" | "would_post" | "held";
  invoice_count: number;
  gross_cents: number;
  faro_net_advance_cents: number;
  engine_net_cents?: number | null;
  purchase_id?: string | null;
  purchase_display_id?: string | null;
  reason?: string | null;
};

export type FaroSeedResult = {
  commit: boolean;
  line_count: number;
  gross_cents: number;
  net_advance_cents: number;
  already_present: { count: number; gross_cents: number };
  posted: { count: number; gross_cents: number; purchases: number };
  held: { count: number; gross_cents: number };
  dates: FaroSeedDate[];
  lines: FaroSeedLine[];
};

export class FaroSeedError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

class PreviewRollback extends Error {
  constructor(readonly payload: { purchaseId: string; displayId: string | null; netCents: number }) {
    super("preview_rollback");
  }
}

/** Faro's Net Adv for a line — the column the export prints, the wire's own figure. */
function netAdvance(line: FaroCsvLine): number {
  return line.advance_amount_cents;
}

/** The Faro vendor the company's purchases are made with: exactly one mdata.vendors row named Faro, or a named refusal. */
async function resolveFaroVendor(client: Q, oci: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.vendors
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND vendor_name ILIKE 'faro%'
      ORDER BY vendor_name LIMIT 2`,
    [oci],
  );
  if (r.rows.length === 1) return r.rows[0]!.id;
  throw new FaroSeedError(
    r.rows.length ? "faro_vendor_ambiguous" : "faro_vendor_not_found",
    r.rows.length ? "More than one active vendor named Faro in this company." : "No active vendor named Faro in this company.",
  );
}

async function alreadyPresent(client: Q, oci: string, faroNumbers: string[]) {
  const r = await client.query<{ faro_invoice_number: string; display_id: string }>(
    `SELECT pl.faro_invoice_number, p.display_id
       FROM accounting.factoring_purchase_lines pl
       JOIN accounting.factoring_purchases p ON p.id = pl.purchase_id
      WHERE pl.operating_company_id = $1::uuid AND pl.voided_at IS NULL AND p.voided_at IS NULL
        AND pl.faro_invoice_number = ANY($2::text[])`,
    [oci, faroNumbers],
  );
  return new Map(r.rows.map((x) => [x.faro_invoice_number, x.display_id]));
}

async function invoiceDisplay(client: Q, oci: string, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const r = await client.query<{ id: string; display_id: string }>(
    `SELECT id::text, display_id::text FROM accounting.invoices WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])`,
    [oci, ids],
  );
  return new Map(r.rows.map((x) => [x.id, x.display_id]));
}

function reasonOf(err: unknown): string {
  if (err instanceof FactoringPurchaseError) {
    return err.details ? `${err.code}: ${JSON.stringify(err.details)}` : err.code;
  }
  return err instanceof Error ? err.message : String(err);
}

export async function seedFaroPurchaseReport(input: {
  actorUserId: string;
  operatingCompanyId: string;
  csvText: string;
  sourceFilename: string;
  commit: boolean;
  /** Test seam: one transaction (defaults to withCompanyScope). */
  scope?: <T>(fn: (client: Q) => Promise<T>) => Promise<T>;
  /** Test seam: post-commit load sync (defaults to syncLoadsForFactoringAdvance). */
  syncLoads?: (a: { operatingCompanyId: string; factoringAdvanceId: string; actorUserId: string }) => Promise<void>;
}): Promise<FaroSeedResult> {
  const oci = input.operatingCompanyId;
  const scope = input.scope ?? (<T>(fn: (client: Q) => Promise<T>) => withCompanyScope(input.actorUserId, oci, fn));
  const syncLoads = input.syncLoads ?? syncLoadsForFactoringAdvance;
  const parsed = parseFaroCsv(input.csvText);

  for (const l of parsed.lines) {
    if (!l.due_on) throw new FaroSeedError("faro_line_no_date", `Faro Inv # ${l.invoice_number} has no Date — the purchase date is never guessed.`);
    if (!/^\d{1,6}$/.test(l.invoice_number)) throw new FaroSeedError("faro_invoice_number_invalid", `Faro Inv # "${l.invoice_number}" is not Faro's numeric sequence.`);
  }
  const dupes = parsed.lines.map((l) => l.invoice_number).filter((n, i, a) => a.indexOf(n) !== i);
  if (dupes.length) throw new FaroSeedError("faro_invoice_number_duplicated", `Faro Inv # repeated in the file: ${[...new Set(dupes)].join(", ")}`);

  const { vendorId, present, resolved, display } = await scope(async (client) => {
    const vendorId = await resolveFaroVendor(client, oci);
    const present = await alreadyPresent(client, oci, parsed.lines.map((l) => l.invoice_number));
    // PO / Other Ref ONLY: the invoice-number path is blanked so Faro's own sequence never matches our invoice numbers.
    const resolved = await enrichFaroPreviewLines(client as never, oci, parsed.lines.map((l) => ({ ...l, invoice_number: "" })));
    const display = await invoiceDisplay(client, oci, resolved.map((r) => r.invoice_id).filter((v): v is string => Boolean(v)));
    return { vendorId, present, resolved, display };
  });

  const lines: FaroSeedLine[] = parsed.lines.map((l, i) => {
    const invoiceId = resolved[i]?.invoice_id ?? null;
    const base: FaroSeedLine = {
      faro_invoice_number: l.invoice_number,
      purchase_date: l.due_on ?? null,
      po: l.match_key ?? null,
      debtor: l.customer_name ?? null,
      gross_cents: l.gross_amount_cents,
      net_advance_cents: netAdvance(l),
      invoice_id: invoiceId,
      invoice_display_id: invoiceId ? display.get(invoiceId) ?? null : null,
      outcome: "held",
    };
    if (present.has(l.invoice_number)) return { ...base, outcome: "already_present", purchase_display_id: present.get(l.invoice_number) ?? null };
    if (!invoiceId) return { ...base, reason: `no_invoice_for_po: no single USMCA load with WO/PO "${l.match_key ?? ""}" carrying a live invoice` };
    if ((l.dispatch_amount_cents ?? 0) !== 0 || (l.schedule_fee_amount_cents ?? 0) !== 0) {
      return { ...base, reason: "faro_deduction_without_engine_slot: Dispatch / Sch Fee is not 0 on this line" };
    }
    if (l.chargeback_amount_cents !== 0) return { ...base, reason: "faro_chargeback_on_purchase_line: ChgBack (Refund) is not 0 on this line" };
    return base;
  });

  const byDate = new Map<string, number[]>();
  parsed.lines.forEach((l, i) => {
    const d = l.due_on!;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(i);
  });

  const dates: FaroSeedDate[] = [];
  for (const [date, idxs] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dl = idxs.map((i) => lines[i]!);
    const src = idxs.map((i) => parsed.lines[i]!);
    const gross = dl.reduce((a, l) => a + l.gross_cents, 0);
    const faroNet = dl.reduce((a, l) => a + l.net_advance_cents, 0);
    const head: FaroSeedDate = { purchase_date: date, outcome: "held", invoice_count: dl.length, gross_cents: gross, faro_net_advance_cents: faroNet };
    if (dl.every((l) => l.outcome === "already_present")) {
      dates.push({ ...head, outcome: "already_present" });
      continue;
    }
    if (dl.some((l) => l.outcome === "already_present")) {
      const reason = "faro_date_partly_present: some of this date's Faro invoices are already on a purchase — the wire is never split";
      for (const l of dl) if (l.outcome !== "already_present") l.reason = l.reason ?? reason;
      dates.push({ ...head, reason });
      continue;
    }
    const blocked = dl.filter((l) => l.reason);
    if (blocked.length) {
      const reason = `faro_date_incomplete: ${blocked.length} of ${dl.length} line(s) on this date cannot post — the date posts whole or not at all`;
      for (const l of dl) if (!l.reason) l.reason = reason;
      dates.push({ ...head, reason });
      continue;
    }

    const invoiceIds = dl.map((l) => l.invoice_id!);
    const lineInputs = src.map((s, k) => ({
      invoice_id: invoiceIds[k]!,
      gross_cents: s.gross_amount_cents,
      escrow_reserve_cents: s.reserve_amount_cents,
      cash_reserve_cents: s.cash_rsv_amount_cents ?? 0,
      fee_cents: s.fee_amount_cents,
      faro_invoice_number: s.invoice_number,
    }));
    const wireFee = src.reduce((a, s) => a + s.wire_fee_amount_cents, 0);
    const draftInput = {
      operatingCompanyId: oci,
      actorUserId: input.actorUserId,
      factoringCompanyVendorId: vendorId,
      purchaseDate: date,
      wireDate: null,
      faroReportRef: `Faro purchase report ${date} (Inv # ${src.map((s) => s.invoice_number).join(", ")})`.slice(0, 80),
      wireFeeCents: wireFee,
      notes: `Seeded from ${input.sourceFilename} (ACCT-F11108). Faro Net Adv for the date ${(faroNet / 100).toFixed(2)}.`,
      lines: lineInputs,
      docsOverrideCode: null,
    };

    try {
      // FEED GATE first, in its own committed scope (its intake/check rows are WORM evidence even when red) — the same
      // order as POST /api/v1/factoring/purchases. No owner override is ever supplied here.
      const gate = input.commit
        ? await scope((client) => runPurchaseFeedGate(client as never, oci, invoiceIds, input.actorUserId, null, { actorIsOwner: true }))
        : null;
      const red = gate?.filter((g) => !g.passed) ?? [];
      if (red.length) {
        const reason = `feed_gate_blocked: ${JSON.stringify(red.map((r) => ({ invoice_id: r.invoice_id, error: r.error, reds: r.reds })))}`;
        for (const l of dl) l.reason = reason;
        dates.push({ ...head, reason });
        continue;
      }

      const run = async (client: Q) => {
        const draft = (await createPurchaseDraft(client as never, draftInput)) as Record<string, unknown>;
        const purchaseId = String(draft.id);
        const engineNet = Number(draft.net_to_company_cents);
        if (engineNet !== faroNet) {
          throw new FaroSeedError("faro_wire_tie_out", `engine net to company ${engineNet} != Faro Net Adv ${faroNet} for ${date}`);
        }
        if (!input.commit) throw new PreviewRollback({ purchaseId, displayId: (draft.display_id as string) ?? null, netCents: engineNet });
        const posted = await postPurchase(client as never, { operatingCompanyId: oci, actorUserId: input.actorUserId, purchaseId });
        return { purchaseId, displayId: (draft.display_id as string) ?? null, netCents: engineNet, advanceId: posted.factoringAdvanceId };
      };

      try {
        const out = await scope(run);
        await syncLoads({ operatingCompanyId: oci, factoringAdvanceId: out.advanceId, actorUserId: input.actorUserId });
        for (const l of dl) Object.assign(l, { outcome: "posted", purchase_display_id: out.displayId, reason: null });
        dates.push({ ...head, outcome: "posted", engine_net_cents: out.netCents, purchase_id: out.purchaseId, purchase_display_id: out.displayId });
      } catch (err) {
        if (!(err instanceof PreviewRollback)) throw err;
        for (const l of dl) Object.assign(l, { outcome: "would_post", reason: null });
        dates.push({ ...head, outcome: "would_post", engine_net_cents: err.payload.netCents });
      }
    } catch (err) {
      const reason = reasonOf(err);
      for (const l of dl) l.reason = reason;
      dates.push({ ...head, reason });
    }
  }

  const tally = (pred: (l: FaroSeedLine) => boolean) => {
    const xs = lines.filter(pred);
    return { count: xs.length, gross_cents: xs.reduce((a, l) => a + l.gross_cents, 0) };
  };
  return {
    commit: input.commit,
    line_count: lines.length,
    gross_cents: lines.reduce((a, l) => a + l.gross_cents, 0),
    net_advance_cents: lines.reduce((a, l) => a + l.net_advance_cents, 0),
    already_present: tally((l) => l.outcome === "already_present"),
    posted: { ...tally((l) => l.outcome === "posted" || l.outcome === "would_post"), purchases: dates.filter((d) => d.outcome === "posted" || d.outcome === "would_post").length },
    held: tally((l) => l.outcome === "held"),
    dates,
    lines,
  };
}
