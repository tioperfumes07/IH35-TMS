import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

export const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export type ReportLibraryRow = {
  id: string;
  name: string;
  category: "operations" | "financial" | "drivers" | "fleet" | "fuel" | "safety";
  description: string;
  status: "real" | "stub";
};

export const REPORT_LIBRARY: ReportLibraryRow[] = [
  {
    id: "profit-per-truck",
    name: "Profit per truck · MTD",
    category: "financial",
    description: "Revenue minus maintenance work-order costs by unit (v1).",
    status: "real",
  },
  {
    id: "driver-settlement",
    name: "Driver settlement summary",
    category: "financial",
    description: "Cycle totals by driver: gross, advances, deductions, escrow, net.",
    status: "real",
  },
  {
    id: "ar-aging",
    name: "A/R aging",
    category: "financial",
    description: "Customer aging buckets sourced from open invoices.",
    status: "real",
  },
  {
    id: "fuel-savings",
    name: "Fuel savings · rec vs actual",
    category: "fuel",
    description: "Recommended savings versus realized savings by driver.",
    status: "real",
  },
  {
    id: "maint-cost-unit",
    name: "Maintenance cost per unit",
    category: "fleet",
    description: "Work-order costs grouped by unit over period.",
    status: "real",
  },
  {
    id: "detention-claims",
    name: "Detention claims",
    category: "operations",
    description: "Detention billing outcomes by customer and status.",
    status: "stub",
  },
  {
    id: "driver-pay-history",
    name: "Driver pay history",
    category: "drivers",
    description: "Settlement timeline with advances and deductions.",
    status: "real",
  },
  {
    id: "csa-fleet",
    name: "CSA fleet score",
    category: "safety",
    description: "CSA BASIC score rollup from DOT inspections.",
    status: "real",
  },
];

export function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

export function parseMonthWindow(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function getCurrentQuarterInfo(now = new Date()) {
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  const quarter = Math.floor(month / 3) + 1;
  const quarterEndMonth = quarter * 3;
  const quarterEnd = new Date(Date.UTC(year, quarterEndMonth, 0, 23, 59, 59, 999));
  // Texas Comptroller IFTA guidance: returns are due on the last day of the month
  // following quarter end: https://comptroller.texas.gov/taxes/fuels/ifta.php
  const dueAt = new Date(Date.UTC(quarterEnd.getUTCFullYear(), quarterEnd.getUTCMonth() + 2, 0, 23, 59, 59, 999));
  const daysUntilDue = Math.max(0, Math.ceil((dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  return { quarter: `Q${quarter}`, dueAt: dueAt.toISOString().slice(0, 10), daysUntilDue };
}
