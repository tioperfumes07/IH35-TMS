// KILL-SWITCH PROOF — every GL-posting path honors its per-entity feature flag. These tests prove that
// when a path's posting flag resolves OFF (the default), the path does its non-GL work but posts NOTHING
// (postSourceTransaction is never called). Covers the four bypass holes closed in this PR:
//   1. maintenance / WO-close bill poster
//   2. generic MVP posting route (via the flag map — every source type it posts is per-entity gated)
//   3. recurring-bill autopost
//   4. customer-payment (A/R receipt) apply path
// The static guard verify-all-posting-paths-gated.mjs enforces the wiring; these tests prove the runtime
// no-op behavior.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── shared fake DB client + flag mock ────────────────────────────────────────────────────────────────
let queryHandler: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const fakeClient = { query: (sql: string, params?: unknown[]) => queryHandler(sql, params) };

const isEnabledMock = vi.fn();

// Keep POSTING_FLAG_KEYS + resolveFlagEnabled real (for the default-OFF proof); override only isEnabled.
vi.mock("../../lib/feature-flags/service.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, isEnabled: (...a: unknown[]) => isEnabledMock(...a) };
});

// withLuciaBypass hands the callback our fake client (used by the maintenance poster + recurring generator).
// Partial-mock so other exports (luciaPool, etc.) stay real for the module graph.
vi.mock("../../auth/db.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, withLuciaBypass: async (fn: (c: typeof fakeClient) => unknown) => fn(fakeClient) };
});

// Spy on the single GL writer. If a kill switch leaks, this spy is called — the test fails.
const postSpy = vi.fn(async () => ({ result: "posted", posting_batch_id: "PB", journal_entry_id: "JE" }));
vi.mock("../posting-engine.service.js", () => ({
  postSourceTransaction: (...a: unknown[]) => postSpy(...a),
  PostingEngineError: class PostingEngineError extends Error { code = ""; },
}));

// Maintenance poster's other collaborators (no DB / no GL math needed for the no-op proof).
vi.mock("../expense-category-map/resolver.service.js", () => ({
  ExpenseCategoryMapResolutionError: class ExpenseCategoryMapResolutionError extends Error {},
  resolveAccountForCategory: async () => ({ account_id: "acct-1" }),
}));
vi.mock("../../qbo/tms-bill-push-chain.service.js", () => ({
  enqueueTmsBillPushRequested: async () => {},
}));

// Recurring generator's bill creator.
vi.mock("../bills.service.js", () => ({
  createBill: async () => ({ id: "bill-recurring-1" }),
  // LV-BILL-MDATA-VENDOR-FK-OPTOUT sweep (poster.service.ts) calls this best-effort during WO-close;
  // mirror the real function's contract (null when unresolved) so it never blocks the kill-switch path.
  resolveMdataVendorIdBestEffort: async () => null,
  // ACCT-F353 sample-tag sweep — same best-effort call site, mirrors the real default (false) contract.
  resolveVendorIsSampleDataBestEffort: async () => false,
}));

import { POSTING_FLAG_KEYS, resolveFlagEnabled } from "../../lib/feature-flags/service.js";
import { POSTING_FLAG_BY_SOURCE_TYPE } from "../posting-engine.routes.js";
import { processMaintenanceWorkOrderClose } from "../maintenance-posting/poster.service.js";
import { generateFromTemplate } from "../bills/recurring/generator.service.js";
import { applyPayment } from "../payments/apply.service.js";

const OC = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

beforeEach(() => {
  vi.clearAllMocks();
  isEnabledMock.mockResolvedValue(false); // flag OFF (default state) for every path
  queryHandler = async () => ({ rows: [] });
});

describe("kill-switch: every posting flag is per-entity gated and default OFF", () => {
  it("all four closed-hole flags are enrolled in POSTING_FLAG_KEYS", () => {
    for (const key of [
      "BILL_GL_POSTING_ENABLED",
      "BILL_PAYMENT_GL_POSTING_ENABLED",
      "INVOICE_AR_GL_POSTING_ENABLED",
      "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",
    ]) {
      expect(POSTING_FLAG_KEYS.has(key)).toBe(true);
    }
  });

  it("MVP route maps EVERY source type it posts to a per-entity-gated flag that resolves OFF by default", () => {
    for (const [sourceType, flagKey] of Object.entries(POSTING_FLAG_BY_SOURCE_TYPE)) {
      // per-entity gated (a global default/rollout can never enable it)
      expect(POSTING_FLAG_KEYS.has(flagKey)).toBe(true);
      // with no per-entity override, the flag is OFF → the route returns posting_disabled (no-op)
      const enabled = resolveFlagEnabled(
        { flag_key: flagKey, default_enabled: false, rollout_pct: 0 },
        [],
        { operating_company_id: OC },
      );
      expect(enabled, `${sourceType} → ${flagKey} must default OFF`).toBe(false);
    }
  });
});

describe("kill-switch: maintenance / WO-close bill poster no-ops when BILL_GL_POSTING_ENABLED is OFF", () => {
  it("creates the bill but posts NOTHING to the GL", async () => {
    queryHandler = async (sql) => {
      if (/information_schema\.columns/.test(sql)) {
        return { rows: sql.includes("IN ('account_id'") ? [] : [] }; // no account column, no optional columns
      }
      if (/FROM maintenance\.work_orders/.test(sql) && /vendor_id/.test(sql)) {
        return { rows: [{ id: "wo-1", status: "closed", vendor_id: "vendor-1", external_vendor_id: null, total_actual_cost: "100", display_id: "WO-1" }] };
      }
      if (/FROM maintenance\.work_orders/.test(sql)) {
        return { rows: [{ wo_type: "pm", wo_service_class: null, description: "pm service" }] };
      }
      if (/FROM accounting\.bills\b/.test(sql) && /linked_work_order_uuid/.test(sql)) {
        return { rows: [] }; // no existing bill → create
      }
      if (/INSERT INTO accounting\.bills/.test(sql)) {
        return { rows: [{ id: "bill-wo-1" }] };
      }
      if (/FROM maintenance\.work_order_lines/.test(sql)) {
        return { rows: [{ wo_line_uuid: "wol-1", line_type: "part", description: "tire", amount: "100", section: "B", expense_category_uuid: null, service_item_uuid: null, part_uuid: null, labor_rate_uuid: null, part_location_codes: null }] };
      }
      if (/linked_wo_line_uuid/.test(sql) && /FROM accounting\.bill_lines/.test(sql)) {
        return { rows: [] };
      }
      if (/MAX\(line_sequence\)/.test(sql)) {
        return { rows: [{ max_line_sequence: 0 }] };
      }
      if (/SUM\(amount\)/.test(sql)) {
        return { rows: [{ total_amount: "100" }] };
      }
      return { rows: [] };
    };

    const res = await processMaintenanceWorkOrderClose({ operating_company_id: OC, work_order_id: "wo-1", actor_user_id: "user-1" });

    expect(res.bill_id).toBe("bill-wo-1"); // bill still created
    expect(res.ledger_posting).toBe("skipped"); // GL skipped
    expect(postSpy).not.toHaveBeenCalled(); // NOTHING posted
    expect(isEnabledMock).toHaveBeenCalledWith(fakeClient, "BILL_GL_POSTING_ENABLED", expect.objectContaining({ operating_company_id: OC }));
  });
});

describe("kill-switch: recurring-bill autopost no-ops when BILL_GL_POSTING_ENABLED is OFF", () => {
  it("generates the bill but posts NOTHING to the GL even when template.auto_post is true", async () => {
    queryHandler = async (sql) => {
      if (/FROM accounting\.recurring_bill_templates/.test(sql)) {
        return { rows: [{ uuid: "tmpl-1", is_active: true, amount: "50", memo: "rent", template_name: "Rent", vendor_uuid: "vendor-1", operating_company_id: OC, frequency: "monthly", auto_post: true }] };
      }
      return { rows: [] }; // UPDATE next_generation_date + INSERT log + set_config
    };

    const res = await generateFromTemplate("tmpl-1", "2026-07-05", "user-1");

    expect(res.billUuid).toBe("bill-recurring-1"); // bill still created
    expect(postSpy).not.toHaveBeenCalled(); // autopost is a no-op with the flag OFF
    expect(isEnabledMock).toHaveBeenCalledWith(fakeClient, "BILL_GL_POSTING_ENABLED", expect.objectContaining({ operating_company_id: OC }));
  });
});

describe("kill-switch: customer-payment apply no-ops when CUSTOMER_PAYMENT_GL_POSTING_ENABLED is OFF", () => {
  it("applies the payment but posts NOTHING to the GL", async () => {
    queryHandler = async (sql) => {
      if (/FROM accounting\.payments/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: [{ id: "pay-1", customer_id: "cust-1", payment_date: "2026-07-05", amount_unapplied_cents: 5000, voided_at: null }] };
      }
      if (/FROM accounting\.payments/.test(sql)) {
        return { rows: [{ amount_unapplied_cents: 0 }] }; // refresh after apply (0 → no credit-memo branch)
      }
      if (/FROM accounting\.payment_applications/.test(sql) && /target_kind/.test(sql)) {
        return { rows: [] }; // no existing application → new
      }
      if (/FROM accounting\.invoices/.test(sql)) {
        return { rows: [{ id: "inv-1", customer_id: "cust-1", status: "sent", amount_open_cents: 5000 }] };
      }
      if (/INSERT INTO accounting\.payment_applications/.test(sql)) {
        return { rows: [{ id: "app-1" }] };
      }
      return { rows: [] };
    };

    const res = await applyPayment(
      fakeClient as never,
      { operating_company_id: OC, payment_id: "pay-1", applications: [{ target_kind: "invoice", target_id: "inv-1", amount_cents: 1000 }] },
      { user_id: "user-1" },
    );

    expect(res.payment_id).toBe("pay-1"); // payment still processed
    expect(postSpy).not.toHaveBeenCalled(); // A/R receipt JE NOT posted
    expect(isEnabledMock).toHaveBeenCalledWith(fakeClient, "CUSTOMER_PAYMENT_GL_POSTING_ENABLED", expect.objectContaining({ operating_company_id: OC }));
  });
});
