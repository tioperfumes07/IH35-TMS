/**
 * 443.60-4 ONE-TIME READ-ONLY ROUTE — QBO Purchase/Expense search
 *
 * Searches TRANSP + TRK QBO for Purchase/Expense transactions 2026-09-01..2026-10-11
 * that either mention "relay" or match one of the 14 unclassified USMCA Relay deposit amounts.
 *
 * PROTECTED: X-Qbo-Search-Token header must equal QBO_RELAY_SEARCH_ONE_TIME_TOKEN env var.
 * NO WRITES. No DB writes, no QBO writes. Token rotated immediately after use.
 *
 * REMOVE THIS FILE after 443.60-4 is complete.
 */
import type { FastifyInstance } from "fastify";
import { qboCompanyContext, qboListEntity } from "../integrations/qbo/qbo-client.js";

// 14 unclassified USMCA deposits (personal cards 1222, 9830, 3088, 0275, 7180, 1993)
const TARGET_CENTS = new Set([
  103250, 309750, 154875, 413000,   // card 1222
  283938, 258125,                    // card 9830 (413000 shared with 1222)
  206500, 82600,                     // card 0275
  30975,                             // card 7180
  41300, 464625, 25813,              // card 3088
  340725,                            // card 1993
]);

const COMPANIES: Array<{ code: string; id: string }> = [
  { code: "TRANSP", id: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" },
  { code: "TRK",    id: "b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e" },
];

function centify(dollars: number): number {
  return Math.round(dollars * 100);
}

type QboPurchaseRow = {
  Id?: string;
  TxnDate?: string;
  TotalAmt?: number;
  PaymentType?: string;
  EntityRef?: { name?: string; type?: string };
  AccountRef?: { name?: string };
  PrivateNote?: string;
  Memo?: string;
  CustomerMemo?: { value?: string };
  Line?: unknown[];
};

function matchTxn(t: QboPurchaseRow, company: string, entity: string) {
  const totalCents = centify(t.TotalAmt ?? 0);
  const memo = ((t.PrivateNote ?? t.Memo ?? (t.CustomerMemo as {value?:string} | undefined)?.value) ?? "").toLowerCase();
  const vendor = (t.EntityRef?.name ?? "").toLowerCase();
  const acct = (t.AccountRef?.name ?? "").toLowerCase();
  const allText = `${memo} ${vendor} ${acct}`;
  const isRelay = allText.includes("relay");
  const isAmtMatch = TARGET_CENTS.has(totalCents);
  if (!isRelay && !isAmtMatch) return null;
  return {
    company, entity,
    id: t.Id,
    date: t.TxnDate,
    amount_cents: totalCents,
    amount_usd: `$${(totalCents / 100).toFixed(2)}`,
    vendor: t.EntityRef?.name ?? "—",
    account: t.AccountRef?.name ?? "—",
    payment_type: t.PaymentType ?? "—",
    memo: (t.PrivateNote ?? t.Memo ?? (t.CustomerMemo as {value?:string}|undefined)?.value ?? "").slice(0, 120),
    match_reason: isRelay ? "relay_in_text" : `amount_match_${(totalCents/100).toFixed(2)}`,
  };
}

export async function registerQboRelaySearchRoute(app: FastifyInstance) {
  app.get(
    "/api/v1/admin/one-time/qbo-relay-deposit-search",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const expectedToken = (process.env.QBO_RELAY_SEARCH_ONE_TIME_TOKEN ?? "").trim();
      if (!expectedToken) {
        return reply.code(503).send({ error: "one_time_route_disabled" });
      }
      const provided = ((req.headers as Record<string, string | string[] | undefined>)["x-qbo-search-token"] ?? "") as string;
      if (!provided || provided !== expectedToken) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const matches: ReturnType<typeof matchTxn>[] = [];
      const errors: string[] = [];

      for (const { code, id } of COMPANIES) {
        let ctx;
        try {
          ctx = await qboCompanyContext(id);
        } catch (e) {
          errors.push(`${code}: context_failed — ${(e as Error).message}`);
          continue;
        }

        for (const entity of ["Purchase", "Expense"] as const) {
          try {
            let startPos = 1;
            const pageSize = 100;
            while (true) {
              const where = `TxnDate >= '2026-09-01' AND TxnDate <= '2026-10-11'`;
              const payload = await qboListEntity<QboPurchaseRow>(ctx, entity, where, startPos, pageSize);
              const page = (payload.QueryResponse?.[entity] as QboPurchaseRow[] | undefined) ?? [];
              for (const t of page) {
                const m = matchTxn(t, code, entity);
                if (m) matches.push(m);
              }
              if (page.length < pageSize) break;
              startPos += pageSize;
            }
          } catch (e) {
            errors.push(`${code} ${entity}: ${(e as Error).message}`);
          }
        }
      }

      return reply.send({
        searched_at: new Date().toISOString(),
        date_range: "2026-09-01..2026-10-11",
        match_count: matches.length,
        matches,
        errors,
      });
    },
  );
}
