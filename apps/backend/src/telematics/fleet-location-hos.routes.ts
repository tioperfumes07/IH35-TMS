import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import ExcelJS from "exceljs";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { addArrayWorksheet, writeWorkbookBuffer } from "../lib/exceljs-workbook.js";
import { getFleetLocationHosRows, minutesToHMM, type FleetLocationHosRow } from "./fleet-location-hos.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  format: z.enum(["json", "xlsx"]).optional().default("json"),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

const SHEET_HEADERS = [
  "Unit", "Driver", "City", "State", "Location", "Lat", "Lng", "Speed (mph)", "Heading", "Engine",
  "Last Fix (Laredo)", "Last Fix (UTC)", "Min Ago", "Stale",
  "Drive Rem (11h)", "Shift Rem (14h)", "Break Rem", "Cycle Rem (70h)", "HOS Status", "Map",
] as const;

function rowToSheetArray(r: FleetLocationHosRow): (string | number)[] {
  const map = r.lat != null && r.lng != null ? `https://www.google.com/maps?q=${r.lat},${r.lng}` : "";
  return [
    r.unit_number ?? "",
    r.driver_name ?? "Not assigned",
    r.city ?? "",
    r.state ?? "",
    r.formatted_location ?? "",
    r.lat ?? "",
    r.lng ?? "",
    r.speed_mph ?? "",
    r.heading_deg ?? "",
    r.engine_state ?? "",
    r.captured_at_local ?? "",
    r.captured_at_utc ?? "",
    r.minutes_since_fix ?? "",
    r.stale ? "STALE" : "",
    minutesToHMM(r.drive_remaining_min),
    minutesToHMM(r.window_remaining_min),
    minutesToHMM(r.break_remaining_min),
    minutesToHMM(r.cycle_remaining_min),
    r.hos_status ?? "",
    map,
  ];
}

export async function renderFleetLocationHosXlsx(rows: FleetLocationHosRow[]): Promise<Buffer> {
  const aoa: (string | number)[][] = [SHEET_HEADERS as unknown as string[], ...rows.map(rowToSheetArray)];
  const workbook = new ExcelJS.Workbook();
  addArrayWorksheet(workbook, "Fleet Location HOS", aoa);
  return writeWorkbookBuffer(workbook);
}

export async function registerFleetLocationHosRoutes(app: FastifyInstance) {
  // Read-only fleet location + assigned driver + HOS aggregation (Samsara-fed). No 50-cap — covers ALL
  // reporting vehicles. ?format=xlsx returns a .xlsx download. Entity-scoped.
  app.get("/api/v1/telematics/fleet-location-hos", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const asOf = new Date();
    const rows = await withCurrentUser(user.uuid, (client) =>
      getFleetLocationHosRows(client, query.data.operating_company_id, asOf)
    );

    if (query.data.format === "xlsx") {
      const buffer = await renderFleetLocationHosXlsx(rows);
      const stamp = companyBusinessDate(asOf);
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="fleet-location-hos-${stamp}.xlsx"`);
      return reply.send(buffer);
    }

    return reply.send({ rows, generated_at: asOf.toISOString(), count: rows.length });
  });
}
