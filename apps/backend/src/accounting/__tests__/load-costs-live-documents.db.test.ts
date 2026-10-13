/** R443.139: exercise the actual GET query on migrated PostgreSQL 16, rollback-only.
 * Isolated tenant, never USMCA; no production connection, no fabricated production evidence.
 */
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { registerLoadCostsBoardRoutes } from "../load-costs-board.routes.js";

const { scope } = vi.hoisted(() => ({ scope: vi.fn() }));
vi.mock("../../banking/pending-categorization.js", () => ({ countUncategorizedTransactions: async () => 0 }));
vi.mock("../shared.js", async original => ({
  ...await original<typeof import("../shared.js")>(),
  currentAuthUser: () => ({ uuid: "00000000-0000-4000-8000-0000000000ee", role: "Owner" }),
  withCompanyScope: scope,
}));

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("load-costs live document read model (real PostgreSQL)", () => {
  it("uses current booking/issued revenue, immediate line costs, one driver obligation, and preserves invoiced open loads", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    refuseProductionConnectionString(cs);
    if (!["localhost","127.0.0.1","::1"].includes(new URL(cs).hostname)) throw new Error("Loopback PostgreSQL only");
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const app = Fastify();
    const actor = "00000000-0000-4000-8000-0000000000ee";
    const tag = randomUUID().slice(0,8);
    const one = async (sql: string, params: unknown[] = []) => (await db.query(sql,params)).rows[0]!;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls='lucia'");
      await db.query("SET LOCAL app.allow_owner_bootstrap='1'");
      await db.query("INSERT INTO identity.users (id,email,role,preferred_language) VALUES ($1,$2,'Owner','en') ON CONFLICT(id) DO NOTHING", [actor,`costs-${tag}@test.invalid`]);
      const company = (await one("INSERT INTO org.companies (code,legal_name,company_type) VALUES ($1,'Live costs test','operating_carrier') RETURNING id", [`LC${tag}`])).id;
      await db.query("SELECT set_config('app.operating_company_id',$1,true)",[company]);
      const trailerType = await prepareCompanyForLoadInserts(db,company);
      const customer = (await one("INSERT INTO mdata.customers (operating_company_id,customer_name) VALUES ($1,'Cost test customer') RETURNING id",[company])).id;
      const driver = (await one("INSERT INTO mdata.drivers (operating_company_id,first_name,last_name,phone) VALUES ($1,'Cost','Test',$2) RETURNING id",[company,`555${Date.now().toString().slice(-7)}`])).id;
      const unit = (await one("INSERT INTO mdata.units (unit_number,vin,owner_company_id,is_sample_data) VALUES ($1,$2,$3,true) RETURNING id",[`LC-${tag}`,`LC${tag}1234567`,company])).id;
      const account = (await one("INSERT INTO catalogs.accounts (operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1,'96601','Cost test','Expense',true) RETURNING id",[company])).id;
      const item = (await one("INSERT INTO catalogs.items (operating_company_id,item_name,item_type,default_expense_account_id) VALUES ($1,'Cost test item','Service',$2) RETURNING id",[company,account])).id;
      const vendor = (await one("INSERT INTO mdata.vendors (operating_company_id,vendor_name,vendor_type) VALUES ($1,'Cost test vendor','other') RETURNING id",[company])).id;
      const loadNumber = String(7000000000 + Number.parseInt(tag,16));
      const load = (await one(`INSERT INTO mdata.loads
        (operating_company_id,load_number,customer_id,dispatcher_user_id,load_trailer_equipment_id,status,rate_total_cents,assigned_primary_driver_id,assigned_unit_id,trailer_source,is_sample_data)
        VALUES ($1,$2,$3,$4,$5,'delivered',999999,$6,$7,'none',false) RETURNING id`,
        [company,loadNumber,customer,actor,trailerType,driver,unit])).id;
      await db.query(`INSERT INTO dispatch.load_charge_lines (operating_company_id,load_id,line_kind,charge_code,amount_cents,sort_order,created_by_user_id)
        VALUES ($1,$2,'system','linehaul',100000,10,$3),($1,$2,'system','fuel_surcharge',20000,20,$3)`,[company,load,actor]);
      scope.mockImplementation(async (_actor,_company,fn) => fn(db));
      await registerLoadCostsBoardRoutes(app);
      const board = async (scopeCompany=company) => {
        const response = await app.inject(`/api/v1/accounting/load-costs-board?operating_company_id=${scopeCompany}`);
        expect(response.statusCode,response.body).toBe(200);
        return response.json().rows as Array<Record<string,unknown>>;
      };
      expect(await board()).toEqual([expect.objectContaining({load_id:load,revenue_cents:"120000",revenue_source:"proforma"})]);
      const otherCompany=(await one("INSERT INTO org.companies (code,legal_name,company_type) VALUES ($1,'Other isolated cost tenant','operating_carrier') RETURNING id",[`LC2${tag}`])).id;
      // Lucia is enabled: isolation here comes from the bound SQL predicate, not masked RLS.
      expect(await board(otherCompany)).toHaveLength(0);
      const invoice = (await one(`INSERT INTO accounting.invoices
        (operating_company_id,customer_id,display_id,invoice_type,issue_date,due_date,subtotal_cents,tax_cents,total_cents,status,source_load_id)
        VALUES ($1,$2,$3,'manual',CURRENT_DATE,CURRENT_DATE,90000,10000,100000,'draft',$4) RETURNING id`,[company,customer,`INV-2026-${String(Number.parseInt(tag,16)%90000+10000)}`,load])).id;
      expect((await board())[0]?.revenue_cents).toBe("120000");
      await db.query("INSERT INTO accounting.invoice_lines (operating_company_id,invoice_id,line_type,account_id,description,unit_amount_cents,line_total_cents,display_order) VALUES ($1,$2,'other',$3,'Test revenue',90000,90000,1)",[company,invoice,account]);
      await db.query("UPDATE accounting.invoices SET status='sent' WHERE id=$1",[invoice]);
      expect(await board()).toEqual([expect.objectContaining({load_id:load,revenue_cents:"90000",revenue_source:"invoice",is_invoiced:true})]);
      const expense = (await one("INSERT INTO accounting.expenses (operating_company_id,transaction_date,total_amount_cents,status,posting_status,payment_account_uuid,load_id,driver_uuid,unit_id,vendor_uuid) VALUES ($1,CURRENT_DATE,10000,'draft','unposted',$2,$3,$4,$5,$6) RETURNING id",[company,account,load,driver,unit,vendor])).id;
      await db.query(`INSERT INTO accounting.expense_lines (expense_id,operating_company_id,line_sequence,amount_cents,amount,description,expense_account_uuid,item_id,quantity,rate_cents,unit_of_measure,load_id,driver_id,unit_id,line_category)
        VALUES ($1,$2,1,10000,100,'Fuel document',$3,$4,1,10000,'each',$5,$6,$7,'diesel')`,[expense,company,account,item,load,driver,unit]);
      expect((await board())[0]).toMatchObject({expense_cents:"10000",expense_count:1,fuel_cents:"10000",other_cost_cents:"0"});
      const bill = (await one("INSERT INTO accounting.bills (operating_company_id,bill_date,status,amount_cents,total_amount,bill_number,mdata_vendor_id,load_id,driver_id,unit_id) VALUES ($1,CURRENT_DATE,'unpaid',30000,300,$2,$3,$4,$5,$6) RETURNING id",[company,`LC-${tag}`,vendor,load,driver,unit])).id;
      await db.query("INSERT INTO accounting.bill_lines (bill_id,line_sequence,amount,description,account_id,load_id,item_id,quantity,rate_cents,unit_of_measure) VALUES ($1,1,300,'Driver pay',$2,$3,$4,1,30000,'each')",[bill,account,load,item]);
      expect((await board())[0]).toMatchObject({bill_cents:"30000",bill_count:1});
      await db.query("INSERT INTO driver_finance.driver_bills (operating_company_id,load_id,load_number,bill_number,driver_id,gross_amount_cents,status,accrued_bill_id) VALUES ($1,$2,$3,$3,$4,30000,'open',$5)",[company,load,loadNumber,driver,bill]);
      const row = (await board())[0]!;
      expect(row).toMatchObject({revenue_cents:"90000",expense_cents:"10000",bill_cents:"0",driver_pay_cents:"30000"});
      expect(Number(row.revenue_cents)-Number(row.expense_cents)-Number(row.bill_cents)-Number(row.driver_pay_cents)).toBe(50000);
      // Issued zero is a real revenue amount, not a falsey fallback to booking revenue.
      await db.query("UPDATE accounting.invoice_lines SET unit_amount_cents=0,line_total_cents=0 WHERE invoice_id=$1",[invoice]);
      await db.query("UPDATE accounting.invoices SET subtotal_cents=0,tax_cents=0,total_cents=0 WHERE id=$1",[invoice]);
      expect((await board())[0]).toMatchObject({revenue_cents:"0",revenue_source:"invoice"});
      // A link to an OPEN settlement is not payment or closure.
      const settlement=(await one("INSERT INTO driver_finance.driver_settlements (operating_company_id,display_id,driver_id,period_start,period_end,status,gross_pay,deductions_total,reimbursements_total,net_pay,settlement_model) VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE,'open',0,0,0,0,'load_bookended') RETURNING id",[company,`LC-${tag}`,driver])).id;
      await db.query("UPDATE driver_finance.driver_bills SET settled_in_settlement_id=$1 WHERE load_id=$2 AND operating_company_id=$3",[settlement,load,company]);
      expect(await board()).toHaveLength(1);
      await db.query("UPDATE driver_finance.driver_settlements SET status='closed' WHERE id=$1",[settlement]);
      expect(await board()).toHaveLength(0);
    } finally {
      await app.close();
      await db.query("ROLLBACK");
      await db.end();
    }
  },60_000);
});
