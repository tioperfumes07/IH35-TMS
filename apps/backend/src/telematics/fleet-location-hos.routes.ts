import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import * as XLSX from "xlsx";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getFleetLocationHosRows, minutesToHMM, type FleetLocationHosRow } from "./fleet-location-hos.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  format: z.enum(["json", "xlsx"]).optional().default("json"),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

const SHEET_HEADERS = [
  "Unit", "Driver", "Lat", "Lng", "Speed (mph)", "Heading", "Engine",
  "Last Fix (Laredo)", "Last Fix (UTC)", "Min Ago", "Stale",
  "Drive Rem (11h)", "Shift Rem (14h)", "Break Rem", "Cycle Rem (70h)", "HOS Status", "Map",
] as const;

function rowToSheetArray(r: FleetLocationHosRow): (string | number)[] {
  const map = r.lat != null && r.lng != null ? `https://www.google.com/maps?q=${r.lat},${r.lng}` : "";
  return [
    r.unit_number ?? "",
    r.driver_name ?? "",
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

export async function registerFleetLocationHosRoutes(app: FastifyInstance) {
  // Read-only fleet location + assigned driver + HOS aggregation (Samsara-fed). No 50-cap — covers ALL
  // reporting vehicles. ?format=xlsx returns a .xlsx download. Entity-scoped.
  app.get("/api/v1/telematics/fleet-location-hos", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const asOf = new Date();
    const rows = await withCurrentUser(user.uuid, (client) =>
      getFleetLocationHosRows(client, query.data.operating_company_id, asOf)
    );

    if (query.data.format === "xlsx") {
      const aoa: (string | number)[][] = [SHEET_HEADERS as unknown as string[], ...rows.map(rowToSheetArray)];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Fleet Location HOS");
      const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
      const stamp = asOf.toISOString().slice(0, 10);
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="fleet-location-hos-${stamp}.xlsx"`);
      return reply.send(buffer);
    }

    return reply.send({ rows, generated_at: asOf.toISOString(), count: rows.length });
  });
}
