/**
 * LEAD 443.110 G10 — real Postgres: the from-load invoice is itemized from dispatch.load_charge_lines. A load booked with
 * line haul + fuel surcharge + detention produces THREE invoice lines — each with its item and that item's income account
 * (4000 / 4100 / 4210), footing to rate_total_cents — on an isolated company that ENFORCES line categorization (so
 * accounting.enforce_line_categorization accepts every line). Charge lines that do not foot to the rate are refused by name.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { buildInvoiceFromLoad } from "../from-load.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("443.110 G10 — from-load invoice itemized from the load's charge lines (real Postgres)", () => {
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId = "";
  const suffix = randomUUID().slice(0, 8);
  const userId = "00000000-0000-4000-8000-0000000000a1";
  const customerId = randomUUID();
  const acct = { linehaul: randomUUID(), fsc: randomUUID(), detention: randomUUID() };
  const item = { linehaul: randomUUID(), fsc: randomUUID(), detention: randomUUID() };
  const detentionChargeId = randomUUID();

  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  async function bookedLoad(charges: Array<{ code: string; cents: number; additional?: string }>, rateCents: number): Promise<string> {
    const loadId = randomUUID();
    await tx(async () => {
      await db.query(
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'delivered',$5,$6::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`,
        [loadId, companyId, String(Math.floor(Math.random() * 1e9) + 9e9), customerId, rateCents, userId]
      );
      for (const [i, c] of charges.entries()) {
        await db.query(
          `INSERT INTO dispatch.load_charge_lines (operating_company_id, load_id, line_kind, additional_charge_id, charge_code, amount_cents, sort_order, created_by_user_id)
           VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,$8::uuid)`,
          [companyId, loadId, c.additional ? "accessorial" : "system", c.additional ?? null, c.code, c.cents, (i + 1) * 10, userId]
        );
      }
    });
    return loadId;
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await tx(async () => {
      await db.query("SET LOCAL app.allow_owner_bootstrap = '1'");
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `g10-${suffix}@example.test`]
      );
    });
    isolated = await createIsolatedOperatingCompany({ codePrefix: "G10", legalNamePrefix: "443.110 G10 itemized invoice", actorUserId: userId });
    companyId = isolated.companyId;
    await tx(async () => {
      await db.query(`UPDATE org.companies SET enforce_line_categorization = true WHERE id = $1::uuid`, [companyId]);
      const category = (await db.query<{ id: string }>(
        `INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1::uuid, $2, 'G10 revenue') RETURNING id::text`,
        [companyId, `G10${suffix}`]
      )).rows[0]!.id;
      for (const [k, num, name, itemName, code] of [
        ["linehaul", "4000", "Freight / Line-haul Income", "Line Haul", "linehaul"],
        ["fsc", "4100", "Fuel Surcharge Income", "Fuel Surcharge", "fuel_surcharge"],
        ["detention", "4210", "Detention Income", "Sales-Detention Charge", "detention"],
      ] as const) {
        await db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$2::uuid,$3,$4,'Income',true)`,
          [acct[k], companyId, `${num}${suffix.slice(0, 2)}`, `${name} ${suffix}`]
        );
        await db.query(
          `INSERT INTO catalogs.items (id, operating_company_id, item_name, item_type, category_id, default_income_account_id) VALUES ($1::uuid,$2::uuid,$3,'Service',$4::uuid,$5::uuid)`,
          [item[k], companyId, itemName, category, acct[k]]
        );
        await db.query(
          `INSERT INTO accounting.expense_category_account_map (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
           VALUES ($1::uuid,'revenue',$2,$3::uuid,'credit',true)`,
          [companyId, code, acct[k]]
        );
      }
      await db.query(
        `INSERT INTO catalogs.additional_charges (id, operating_company_id, code, display_name, is_active) VALUES ($1::uuid,$2::uuid,'DETENTION','Detention',true)`,
        [detentionChargeId, companyId]
      );
      await db.query(`INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`, [customerId, companyId, `G10 Cust ${suffix}`]);
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (isolated) await deactivateIsolatedOperatingCompany(isolated);
    } catch {
      /* best-effort cleanup */
    }
    await db.end();
  });

  it("line haul + fuel surcharge + detention -> 3 invoice lines, each with its item and income account, footing to the rate", async () => {
    const loadId = await bookedLoad(
      [
        { code: "linehaul", cents: 300_000 },
        { code: "fuel_surcharge", cents: 30_000 },
        { code: "DETENTION", cents: 15_000, additional: detentionChargeId },
      ],
      345_000
    );
    const result = await tx(() => buildInvoiceFromLoad(db as never, { userId, operatingCompanyId: companyId, loadId }));
    const lines = (await tx(() =>
      db.query<{ line_type: string; item_id: string | null; account_id: string; line_total_cents: string; description: string }>(
        `SELECT line_type, item_id::text, account_id::text, line_total_cents::text, description
           FROM accounting.invoice_lines WHERE invoice_id = $1::uuid ORDER BY display_order`,
        [String(result.invoice.id)]
      )
    )).rows;
    expect(lines.map((l) => [l.line_type, l.item_id, l.account_id, Number(l.line_total_cents)])).toEqual([
      ["linehaul", item.linehaul, acct.linehaul, 300_000],
      ["fsc", item.fsc, acct.fsc, 30_000],
      ["detention", item.detention, acct.detention, 15_000],
    ]);
    const loadNumber = (await tx(() => db.query<{ n: string }>(`SELECT load_number AS n FROM mdata.loads WHERE id = $1::uuid`, [loadId]))).rows[0]!.n;
    expect(lines.every((l) => l.description.includes(`Load ${loadNumber}`))).toBe(true);
    const total = (await tx(() => db.query<{ t: string }>(`SELECT total_cents::text AS t FROM accounting.invoices WHERE id = $1::uuid`, [String(result.invoice.id)]))).rows[0]!.t;
    expect(Number(total)).toBe(345_000);
  });

  it("charge lines that do not foot to the load's rate refuse the invoice by name (never plugged)", async () => {
    const loadId = await bookedLoad([{ code: "linehaul", cents: 300_000 }, { code: "fuel_surcharge", cents: 30_000 }], 340_000);
    const err = await tx(() => buildInvoiceFromLoad(db as never, { userId, operatingCompanyId: companyId, loadId })).catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe("invoice_charge_lines_do_not_foot");
    const count = (await tx(() => db.query<{ n: string }>(`SELECT count(*)::text n FROM accounting.invoices WHERE source_load_id = $1::uuid`, [loadId]))).rows[0]!.n;
    expect(Number(count)).toBe(0);
  });
});
