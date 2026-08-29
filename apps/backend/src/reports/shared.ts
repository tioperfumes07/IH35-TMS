import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";

export const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export const reportBasisSchema = z.enum(["cash", "accrual"]).optional().default("accrual");

export type ReportBasis = z.infer<typeof reportBasisSchema>;

export type ReportLibraryRow = {
  id: string;
  name: string;
  category: "operations" | "financial" | "drivers" | "fleet" | "fuel" | "safety";
  description: string;
  status: "real" | "stub";
};

export const REPORT_LIBRARY: ReportLibraryRow[] = [
  {
    id: "cash-flow-overview",
    name: "Cash flow overview",
    category: "financial",
    description:
      "Operating liquidity snapshot with bank buckets, factoring reserves/advances, 30-day AR/AP/settlement projection, and recent banking cadence.",
    status: "real",
  },
  {
    id: "settlement-summary",
    name: "Settlement summary · deductions",
    category: "financial",
    description:
      "Driver settlement rollup with gross/net totals, categorized deductions/chargebacks, and deduction-type aggregates.",
    status: "real",
  },
  {
    id: "customer-profitability",
    name: "Customer profitability",
    category: "financial",
    description: "Load revenue versus attributed driver-bill cost per customer with A/R aging context and margin flags.",
    status: "real",
  },
  {
    id: "profit-per-truck",
    name: "Profit per truck · MTD",
    category: "financial",
    description:
      "Month view compares revenue to WO maintenance costs; date-range mode subtracts driver pay, fuel (transactions), and maintenance for net truck profit.",
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
    id: "ap-aging",
    name: "A/P aging",
    category: "financial",
    description: "Vendor aging buckets sourced from open bills.",
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
    id: "fuel-price-variance",
    name: "Fuel price variance",
    category: "fuel",
    description: "Actual transaction price versus the company Loves daily state benchmark.",
    status: "real",
  },
  {
    id: "fuel-reconciliation",
    name: "Fuel reconciliation · cards vs work orders",
    category: "fuel",
    description:
      "Bank fuel-card totals versus work-order fuel costs by truck with variance flags and unmatched receipts.",
    status: "real",
  },
  {
    id: "maint-cost-unit",
    name: "Maintenance cost per unit",
    category: "fleet",
    description:
      "Work-order maintenance totals by truck over a date range with parts/labor/outsourced splits, per-mile cost, category rollup, and fleet reliability flags.",
    status: "real",
  },
  {
    id: "fleet-utilization",
    name: "Fleet utilization",
    category: "fleet",
    description: "Company fleet units currently assigned to active loads versus available units.",
    status: "real",
  },
  {
    id: "dispatch-margin",
    name: "Dispatch margin",
    category: "operations",
    description: "Per-load revenue minus direct costs (driver pay, fuel, tolls, chargebacks) with accrual or cash basis.",
    status: "real",
  },
  {
    id: "geofence-dwell",
    name: "Geofence dwell report",
    category: "operations",
    description: "Entry/exit dwell windows by geofence with unit and paired driver context.",
    status: "real",
  },
  {
    id: "detention-claims",
    name: "Detention claims",
    category: "operations",
    description: "Detention billing outcomes by customer and status.",
    status: "real",
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
    name: "Internal inspection-point rollup",
    category: "safety",
    description: "IH35 internal inspection-point rollup from DOT inspections; not an FMCSA BASIC percentile.",
    status: "real",
  },
  {
    id: "hos-violations",
    name: "HOS violations trend",
    category: "safety",
    description: "Company HOS violation timeline with driver, load, source, duration, and severity context.",
    status: "real",
  },
  {
    id: "dot-audit-pack",
    name: "DOT audit inspection packet",
    category: "safety",
    description: "Exportable company DOT inspection ledger with driver, unit, outcome, and follow-up work-order context.",
    status: "real",
  },
];

export function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

export function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

// GO-0036-REPORTS-DATE-RANGE-ORDER-UNVALIDATED: neither the shared DatePicker (frontend) nor most
// report query schemas here validate that a from/period_start/cycle_start value is on-or-before its
// to/period_end/cycle_end pair. A reversed range passes every existing guard, the SQL BETWEEN/>=+<=
// predicate becomes unsatisfiable (always false, never an error), and the endpoint returns a
// legitimate 200 with all-zero totals and an empty row set -- indistinguishable from a genuine
// zero-activity period. detention-claims.routes.ts / fuel-price-variance.routes.ts /
// maintenance-cost-per-unit.routes.ts already guard this exact condition; this is the shared form of
// that same check for every other report route that takes a date range.
export function dateRangeOrderError(reply: FastifyReply, fromLabel: string, toLabel: string) {
  return reply.code(400).send({ error: "validation_error", details: { period: [`${fromLabel} must be on or before ${toLabel}`] } });
}

export async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
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
  // RPT-1: report the NEXT IFTA return that is actually due, not the current calendar quarter's future
  // deadline. During a filing month (e.g. July) the just-ended quarter (Q2, due Jul 31) is what's due —
  // the old logic skipped it and showed Q3/Oct 31. Texas Comptroller IFTA guidance: a quarter's return is
  // due the last day of the month following that quarter's end. https://comptroller.texas.gov/taxes/fuels/ifta.php
  const month = now.getUTCMonth(); // 0-11
  const year = now.getUTCFullYear();
  const currentQuarter = Math.floor(month / 3) + 1; // 1-4

  // Deadline for quarter q of a given year: q ends at month (q*3-1) 0-based (Mar/Jun/Sep/Dec); the return
  // is due the last day of the following month. Date.UTC(y, (q*3-1)+2, 0) = last day of that next month.
  const dueForQuarter = (qYear: number, q: number) =>
    new Date(Date.UTC(qYear, q * 3 + 1, 0, 23, 59, 59, 999));

  // The just-ended (previous) quarter and its deadline — for Q1 that is the prior year's Q4 (due Jan 31).
  const prevQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const prevQuarterYear = currentQuarter === 1 ? year - 1 : year;
  const prevDue = dueForQuarter(prevQuarterYear, prevQuarter);

  let quarter: number;
  let dueAt: Date;
  if (now.getTime() <= prevDue.getTime()) {
    // Still inside the previous quarter's filing window → that return is what's next due.
    quarter = prevQuarter;
    dueAt = prevDue;
  } else {
    // Previous quarter's window has closed → the current quarter is next due (after it ends).
    quarter = currentQuarter;
    dueAt = dueForQuarter(year, currentQuarter);
  }
  const daysUntilDue = Math.max(0, Math.ceil((dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  return { quarter: `Q${quarter}`, dueAt: dueAt.toISOString().slice(0, 10), daysUntilDue };
}
