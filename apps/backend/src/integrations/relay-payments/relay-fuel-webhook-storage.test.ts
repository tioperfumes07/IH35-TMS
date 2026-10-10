/**
 * ROUND 443.21 (owner, 2026-10-10): a verified Relay delivery to ?entity=TRANSP (the only Relay account in use) is
 * stored ONCE under USMCA; ?entity=USMCA is stored under USMCA; a fill before 2026-08-03 is refused by name. The
 * signature still verifies with the ENTITY's own secret, and response codes are unchanged.
 */
import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TRANSP_ID = "91e0bf0a-0000-4000-8000-000000000001";
const h = vi.hoisted(() => ({
  ingest: vi.fn(),
  audits: [] as { eventClass: string; payload: Record<string, unknown> }[],
  flagCompanies: [] as string[],
}));

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: async (fn: (c: unknown) => unknown) =>
    fn({
      query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes("FROM org.companies")) {
          const code = String(params[0]);
          if (code === "TRANSP") return { rows: [{ id: TRANSP_ID, code: "TRANSP" }] };
          if (code === "USMCA") return { rows: [{ id: "5c854333-6ea5-4faa-af31-67cb272fef80", code: "USMCA" }] };
          return { rows: [] };
        }
        if (sql.includes("audit.append_event")) {
          h.audits.push({ eventClass: String(params[0]), payload: JSON.parse(String(params[2])) });
        }
        return { rows: [] };
      },
    }),
}));
vi.mock("../../lib/feature-flags/service.js", () => ({
  isEnabled: async (_c: unknown, _k: string, ctx: { operating_company_id: string }) => {
    h.flagCompanies.push(ctx.operating_company_id);
    return true;
  },
}));
vi.mock("./relay-fuel-ingest.cron.js", () => ({ ingestForCompany: h.ingest }));
vi.mock("../../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js", () => ({ flushFuelGlPostsAfterCommit: async () => {} }));
vi.mock("../../fuel/fuel-card-overage.service.js", () => ({ flushFuelCardOverageAfterCommit: async () => {} }));

import { RELAY_WEBHOOK_PATH, registerRelayFuelWebhookRoute, relayWebhookStorageCompanyId, splitRelayRowsAtUsmcaFloor } from "./relay-fuel-webhook.routes.js";
import { USMCA_OPERATING_COMPANY_ID as USMCA } from "./relay-usmca-date-floor.js";

const SECRETS = { TRANSP: "fake-transp-secret-for-test", USMCA: "fake-usmca-secret-for-test" };
const app = Fastify();

function signed(entity: "TRANSP" | "USMCA", rows: unknown, secret = SECRETS[entity]) {
  const body = JSON.stringify(rows);
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${ts}.`).update(Buffer.from(body)).digest("hex");
  return app.inject({
    method: "POST",
    url: `${RELAY_WEBHOOK_PATH}?entity=${entity}`,
    headers: { "content-type": "application/json", "x-relay-timestamp": String(ts), "x-relay-signature": sig },
    payload: body,
  });
}

const fill = (id: string, day: string) => ({ transaction_id: id, created_at: `${day}T15:00:00Z`, total_amount_paid: "100.00", total_retail_price: "110.00" });

beforeAll(async () => {
  process.env.RELAY_WEBHOOK_SECRET_TRANSP = SECRETS.TRANSP;
  process.env.RELAY_WEBHOOK_SECRET_USMCA = SECRETS.USMCA;
  await registerRelayFuelWebhookRoute(app);
  await app.ready();
});
afterAll(async () => {
  delete process.env.RELAY_WEBHOOK_SECRET_TRANSP;
  delete process.env.RELAY_WEBHOOK_SECRET_USMCA;
  await app.close();
});
beforeEach(() => {
  h.ingest.mockReset();
  h.ingest.mockResolvedValue({ pulled: 1, upserted: 1, skipped: 0, rejected: [], gl_post_candidates: [] });
  h.audits.length = 0;
  h.flagCompanies.length = 0;
});

describe("Relay webhook storage company (443.21)", () => {
  it("a verified ?entity=TRANSP delivery is ingested ONCE, under USMCA, and under no other company", async () => {
    const res = await signed("TRANSP", [fill("tx-transp-1", "2026-10-10")]);
    expect(res.statusCode).toBe(200);
    expect(h.ingest).toHaveBeenCalledTimes(1);
    const [, , companyId, , , code, opts] = h.ingest.mock.calls[0]!;
    expect(companyId).toBe(USMCA);
    expect(code).toBe("USMCA");
    expect(opts.source).toBe("webhook");
    expect(opts.preloaded.map((r: { transaction_id: string }) => r.transaction_id)).toEqual(["tx-transp-1"]);
    expect(h.ingest.mock.calls.some((c) => c[2] === TRANSP_ID)).toBe(false);
    expect(h.flagCompanies).toEqual([USMCA]);
    expect(h.audits.find((a) => a.eventClass === "integrations.relay_fuel_webhook_received")?.payload.received_entity).toBe("TRANSP");
  });

  it("a verified ?entity=USMCA delivery is ingested under USMCA", async () => {
    const res = await signed("USMCA", [fill("tx-usmca-1", "2026-10-10")]);
    expect(res.statusCode).toBe(200);
    expect(h.ingest.mock.calls[0]![2]).toBe(USMCA);
  });

  it("the signature still uses the ENTITY's secret: TRANSP signed with the USMCA secret is 401 and nothing is ingested", async () => {
    const res = await signed("TRANSP", [fill("tx-x", "2026-10-10")], SECRETS.USMCA);
    expect(res.statusCode).toBe(401);
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it("a fill dated before 2026-08-03 is refused by name and never ingested; the rest of the batch is", async () => {
    const res = await signed("TRANSP", [fill("tx-old", "2026-08-02"), fill("tx-new", "2026-08-03")]);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.refused_before_usmca_floor).toEqual([{ transaction_id: "tx-old", fill_day: "2026-08-02" }]);
    expect(h.ingest.mock.calls[0]![6].preloaded.map((r: { transaction_id: string }) => r.transaction_id)).toEqual(["tx-new"]);
  });

  it("a batch that is entirely before 2026-08-03 ingests nothing and says why (still 200 so Relay does not retry)", async () => {
    const res = await signed("TRANSP", [fill("tx-old", "2026-07-30")]);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("refused_before_usmca_floor");
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it("pure mapping: TRANSP and USMCA store under USMCA; any other entity maps to itself (the writer refuses it)", () => {
    expect(relayWebhookStorageCompanyId("transp", TRANSP_ID)).toBe(USMCA);
    expect(relayWebhookStorageCompanyId("USMCA", USMCA)).toBe(USMCA);
    expect(relayWebhookStorageCompanyId("TRK", "trk-id")).toBe("trk-id");
    expect(splitRelayRowsAtUsmcaFloor([fill("a", "2026-08-02")], "trk-id").beforeFloor).toEqual([]);
  });
});
