/**
 * PERFUME inquiry + report routes (LEAD ROUND L.20 items 2, 4, 5, 6). Owner-only, read only, each list with its Excel (the price book
 * also as a PDF). See reports.service.ts for what each one reads.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import ExcelJS from "exceljs";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import { familyReport, inventoryStatus, itemInquiry, priceBook, priceBookQuery, reportFilter, ReportInvalid, ReportNotFound } from "./reports.service.js";

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
const MONEY = '"$"#,##0.00';
const dollars = (c: number | null | undefined) => (c == null ? "" : Number(c) / 100);
function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof ReportNotFound) return reply.code(404).send({ error: "not_found" });
  if (e instanceof ReportInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}
/** One sheet: Arial, bold header, money columns formatted, a bold totals row at the bottom (CONTROL lists end with totals). */
async function workbook(title: string, cols: Array<{ header: string; width: number; money?: boolean }>, rows: unknown[][], totals: unknown[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
  for (const r of rows) ws.addRow(r);
  const t = ws.addRow(totals);
  t.font = { bold: true, name: "Arial" };
  cols.forEach((c, i) => { if (c.money) ws.getColumn(i + 1).numFmt = MONEY; });
  ws.getRow(1).font = { bold: true, name: "Arial" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const send = (reply: FastifyReply, buf: Buffer, name: string, type = XLSX) =>
  reply.header("Content-Type", type).header("Content-Disposition", `attachment; filename="${name.replace(/[^\w .-]+/g, "")}"`).send(buf);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
const usd = (c: number | null | undefined) => (c == null ? "—" : `$${(Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export async function registerPerfumeReportRoutes(app: FastifyInstance) {
  // 2. Items inquiry — one read-only item card.
  app.get("/api/v1/perfume/reports/item-inquiry/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => itemInquiry(c, id.data)); } catch (e) { return fail(reply, e); }
  });

  // 5. Inventory status.
  app.get("/api/v1/perfume/reports/inventory-status", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = reportFilter.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    return withCurrentUser(uid, (c) => inventoryStatus(c, q.data));
  });
  app.get("/api/v1/perfume/reports/inventory-status/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = reportFilter.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    const r = await withCurrentUser(uid, (c) => inventoryStatus(c, q.data));
    const buf = await workbook("Inventory status",
      [{ header: "TIO code", width: 14 }, { header: "POS code", width: 12 }, { header: "Item", width: 56 }, { header: "Family", width: 24 }, { header: "On hand", width: 10 },
        { header: "Avg cost", width: 12, money: true }, { header: "Value", width: 14, money: true }],
      r.rows.map((x) => [x.tio_code ?? "", x.pos_code ?? "", x.display_name, x.family ?? "", x.on_hand, dollars(x.avg_cost_cents), dollars(x.value_cents)]),
      ["", "", `Total — ${r.total.items.toLocaleString("en-US")} items${r.truncated ? ` (first ${r.rows.length.toLocaleString("en-US")} listed)` : ""}`, "", r.total.on_hand, "", dollars(r.total.value_cents)]);
    return send(reply, buf, "TIO inventory status.xlsx");
  });

  // 4. Price book — screen, Excel and PDF.
  app.get("/api/v1/perfume/reports/price-book", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = priceBookQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    try { return await withCurrentUser(uid, (c) => priceBook(c, q.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/reports/price-book/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = priceBookQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    let r; try { r = await withCurrentUser(uid, (c) => priceBook(c, q.data)); } catch (e) { return fail(reply, e); }
    const buf = await workbook(`Price book ${r.level.name}`,
      [{ header: "TIO code", width: 14 }, { header: "POS code", width: 12 }, { header: "UPC", width: 16 }, { header: "Item", width: 56 }, { header: "Family", width: 24 },
        { header: "On hand", width: 10 }, { header: `${r.level.name} price`, width: 14, money: true }, { header: "Special price", width: 13, money: true }, { header: "Minimum price", width: 13, money: true }],
      r.rows.map((x) => [x.tio_code ?? "", x.pos_code ?? "", x.upc ?? "", x.display_name, x.family ?? "", x.on_hand, dollars(x.price_cents), dollars(x.special_price_cents), dollars(x.min_price_cents)]),
      ["", "", "", `Total — ${r.total.items.toLocaleString("en-US")} items, ${r.total.priced.toLocaleString("en-US")} priced${r.truncated ? ` (first ${r.rows.length.toLocaleString("en-US")} listed)` : ""}`, "", "", "", "", ""]);
    return send(reply, buf, `TIO price book ${r.level.name}.xlsx`);
  });
  app.get("/api/v1/perfume/reports/price-book/export.pdf", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = priceBookQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    let r; try { r = await withCurrentUser(uid, (c) => priceBook(c, q.data)); } catch (e) { return fail(reply, e); }
    const body = r.rows.map((x) => `<tr><td>${esc(x.tio_code ?? "")}</td><td>${esc(x.upc ?? "")}</td><td>${esc(x.display_name)}</td><td>${esc(x.family ?? "")}</td>
      <td class="n">${x.on_hand.toLocaleString("en-US")}</td><td class="n">${usd(x.price_cents)}</td><td class="n">${x.special_price_cents == null ? "" : usd(x.special_price_cents)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#1F2A44;margin:24px}h1{font-size:15px;margin:0 0 2px}.sub{color:#5B6B82;margin-bottom:10px}
      table{width:100%;border-collapse:collapse}th{background:#EEF2F6;text-align:left;border-bottom:1px solid #C6D1DC;padding:4px}td{border-bottom:1px solid #E5EAF0;padding:3px 4px}
      .n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:bold;border-top:1px solid #1F2A44}</style></head><body>
      <h1>TIO Perfumes — Price book · ${esc(r.level.name)}</h1><div class="sub">${esc(new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" }))}</div>
      <table><thead><tr><th>TIO code</th><th>UPC</th><th>Item</th><th>Family</th><th class="n">On hand</th><th class="n">${esc(r.level.name)}</th><th class="n">Special</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td colspan="7">${r.total.items.toLocaleString("en-US")} items · ${r.total.priced.toLocaleString("en-US")} priced${r.truncated ? ` · first ${r.rows.length.toLocaleString("en-US")} listed` : ""}</td></tr></tfoot></table></body></html>`;
    const { default: puppeteer } = await import("puppeteer");
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "Letter", printBackground: true, margin: { top: "0.4in", bottom: "0.4in", left: "0.3in", right: "0.3in" } });
      return send(reply, Buffer.from(pdf), `TIO price book ${r.level.name}.pdf`, "application/pdf");
    } finally { await browser.close(); }
  });

  // 6. Product family report.
  const famQ = z.object({ active_only: reportFilter.shape.active_only });
  app.get("/api/v1/perfume/reports/families", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = famQ.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, (c) => familyReport(c, q.data));
  });
  app.get("/api/v1/perfume/reports/families/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = famQ.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    const r = await withCurrentUser(uid, (c) => familyReport(c, q.data));
    const buf = await workbook("Product families",
      [{ header: "Family", width: 34 }, { header: "Brand", width: 22 }, { header: "Items", width: 9 }, { header: "Items on hand", width: 13 }, { header: "Units on hand", width: 13 },
        { header: "Value", width: 14, money: true }],
      r.rows.map((x) => [x.family, x.brand ?? "", x.items, x.items_on_hand, x.on_hand, dollars(x.value_cents)]),
      [`Total — ${r.total.families.toLocaleString("en-US")} families`, "", r.total.items, r.total.items_on_hand, r.total.on_hand, dollars(r.total.value_cents)]);
    return send(reply, buf, "TIO product families.xlsx");
  });
}
