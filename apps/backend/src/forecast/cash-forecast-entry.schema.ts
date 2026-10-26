import { z } from "zod";

/**
 * Leaf module (no imports from the routes or the service): the manual cash-forecast entry body schema
 * and its input type, shared by cash-forecast-manual.routes.ts (validation) and cash-forecast-entry.service.ts
 * (the type). Moved here verbatim to break the routes <-> service import cycle; no behavior change.
 * FIREWALL: like the rest of forecast/, this must never import accounting/finance/reports.
 */
export const entryBody = z.object({
  operating_company_id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["income", "expense"]),
  amount_cents: z.number().int().min(0),
  party_name: z.string().trim().max(200).nullish(),
  invoice_no: z.string().trim().max(120).nullish(),
  category: z.string().trim().max(120).nullish(),
  memo: z.string().trim().max(2000).nullish(),
  ref_kind: z.enum(["account", "unit", "driver", "truck", "trailer"]).nullish(),
  ref_label: z.string().trim().max(200).nullish(),
  ref_external_id: z.string().trim().max(120).nullish(),
  // Part B snapshot refs (read-only display copies, no FK): income row = load/unit/customer
  // auto-filled from a picked load; expense row = driver/vendor party.
  load_ref_id: z.string().trim().max(120).nullish(),
  load_ref_label: z.string().trim().max(200).nullish(),
  unit_ref_label: z.string().trim().max(200).nullish(),
  customer_ref_label: z.string().trim().max(200).nullish(),
  party_ref_kind: z.enum(["customer", "driver", "vendor"]).nullish(),
  party_ref_id: z.string().uuid().nullish(),
  party_ref_label: z.string().trim().max(200).nullish(),
});
export type ForecastEntryInput = z.infer<typeof entryBody>;
