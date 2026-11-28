/**
 * SCENTSX Sales inquiry routes (LEAD ROUND L.20 item 3): sale lines by item / customer / invoice and the invoice list by customer,
 * each with its Excel. Owner-only, read only. See sales-inquiry.service.ts.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import ExcelJS from "exceljs";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "../perfume/desk.routes.js";
import { ScentsxLinkInvalid, ScentsxNotSetUp } from "./links.service.js";
import { inquiryCustomers, salesInvoices, salesLines, type InquiryFilter } from "./sales-inquiry.service.js";
import { dailyReport, dailyReportQuery, drawerCount, drawerCountBody } from "./daily-report.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}
const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_FILE = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } } as const;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof ScentsxNotSetUp) return reply.code(409).send({ error: "scentsx_not_set_up", message: e.message });
  if (e instanceof ScentsxLinkInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}
const filterOf = (req: FastifyRequest): InquiryFilter => {
  const q = (req.query ?? {}) as Record<string, string | undefined>;
  return { from: q.from ?? "", to: q.to ?? "", item_id: q.item_id || undefined, customer_id: q.customer_id || undefined, invoice_id: q.invoice_id || undefined };
};
async function book(title: string, cols: Array<{ header: string; width: number; money?: boolean }>, rows: unknown[][], totals: unknown[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title);
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
  for (const r of rows) ws.addRow(r);
  ws.addRow(totals).font = { bold: true, name: "Arial" };
  cols.forEach((c, i) => { if (c.money) ws.getColumn(i + 1).numFmt = '"$"#,##0.00'; });
  ws.getRow(1).font = { bold: true, name: "Arial" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function registerScentsxInquiryRoutes(app: FastifyInstance) {
  app.get("/api/v1/scentsx/inquiry/customers", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return { customers: await withCurrentUser(uid, (c) => inquiryCustomers(c)) }; } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/inquiry/sales-lines", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, (c) => salesLines(c, filterOf(req))); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/inquiry/sales-lines/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    let r; try { r = await withCurrentUser(uid, (c) => salesLines(c, filterOf(req))); } catch (e) { return fail(reply, e); }
    const buf = await book("Sales by item",
      [{ header: "Invoice", width: 14 }, { header: "Date", width: 12 }, { header: "Customer", width: 34 }, { header: "Item", width: 50 }, { header: "Description", width: 40 },
        { header: "Qty", width: 8 }, { header: "Price", width: 12, money: true }, { header: "Amount", width: 14, money: true }],
      r.rows.map((x) => [x.invoice ?? "", x.issue_date, x.customer, x.item ?? "", x.description ?? "", x.qty, x.unit_price_cents / 100, x.amount_cents / 100]),
      [`Total — ${r.total.lines.toLocaleString("en-US")} lines, ${r.total.invoices.toLocaleString("en-US")} invoices${r.truncated ? ` (first ${r.rows.length} listed)` : ""}`, "", "", "", "",
        r.total.qty, "", r.total.amount_cents / 100]);
    return reply.header("Content-Type", XLSX).header("Content-Disposition", `attachment; filename="ScentsX sales by item ${r.from} to ${r.to}.xlsx"`).send(buf);
  });
  app.get("/api/v1/scentsx/inquiry/sales-invoices", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, (c) => salesInvoices(c, filterOf(req))); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/inquiry/sales-invoices/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    let r; try { r = await withCurrentUser(uid, (c) => salesInvoices(c, filterOf(req))); } catch (e) { return fail(reply, e); }
    const buf = await book("Sales inquiry",
      [{ header: "Invoice", width: 14 }, { header: "Date", width: 12 }, { header: "Customer", width: 34 }, { header: "Status", width: 10 }, { header: "Lines", width: 8 },
        { header: "Units", width: 9 }, { header: "Sales", width: 14, money: true }, { header: "Tax", width: 12, money: true }, { header: "Total", width: 14, money: true }],
      r.rows.map((x) => [x.invoice ?? "", x.issue_date, x.customer, x.status, x.lines, x.units, x.sales_cents / 100, x.tax_cents / 100, x.total_cents / 100]),
      [`Total — ${r.total.invoices.toLocaleString("en-US")} invoices`, "", "", "", "", r.total.units, r.total.sales_cents / 100, r.total.tax_cents / 100, r.total.total_cents / 100]);
    return reply.header("Content-Type", XLSX).header("Content-Disposition", `attachment; filename="ScentsX sales inquiry ${r.from} to ${r.to}.xlsx"`).send(buf);
  });

  // ROUND L.31 M8 — the day's posted transactions (read only) and the end-of-shift drawer count (over / short through the JE writer).
  app.get("/api/v1/scentsx/daily-report", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = dailyReportQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid", issues: q.error.issues });
    try { return await withCurrentUser(uid, (c) => dailyReport(c, q.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/drawer-count", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = drawerCountBody.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid", issues: b.error.issues });
    try { return await withCurrentUser(uid, (c) => drawerCount(c, { userId: uid, role: "Owner" }, b.data)); } catch (e) { return fail(reply, e); }
  });
}
