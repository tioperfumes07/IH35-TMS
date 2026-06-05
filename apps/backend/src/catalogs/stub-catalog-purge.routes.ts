import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

type StubCatalogSpec = {
  tableName: string;
  /** Literal catalogs.{table} reference for factory coverage + CI guards. */
  catalogTable: `catalogs.${string}`;
  routeSegment: string;
  companyScoped: boolean;
  selectSql: string;
  orderBy: string;
  activeFilter?: string;
};

/** Catalog tables already registered in mdata routes — refs only for factory coverage guards. */
const ALREADY_WIRED_STUB_TABLES: Pick<StubCatalogSpec, "tableName" | "catalogTable">[] = [
  {
    tableName: "customer_quality_event_reasons",
    catalogTable: "catalogs.customer_quality_event_reasons",
  },
  {
    tableName: "dispatcher_error_reasons",
    catalogTable: "catalogs.dispatcher_error_reasons",
  },
  {
    tableName: "driver_termination_reasons",
    catalogTable: "catalogs.driver_termination_reasons",
  },
];

/** Remaining catalog tables wired with read-only list routes (CATALOG-3 stub purge). */
const STUB_CATALOG_SPECS: StubCatalogSpec[] = [
  {
    tableName: "audit_event_types",
    catalogTable: "catalogs.audit_event_types",
    routeSegment: "audit-event-types",
    companyScoped: false,
    selectSql: "code, description, severity_default, created_at",
    orderBy: "code",
  },
  {
    tableName: "cancellation_reasons",
    catalogTable: "catalogs.cancellation_reasons",
    routeSegment: "cancellation-reasons",
    companyScoped: false,
    selectSql: "reason_code, reason_label, billable_to_customer_default, requires_owner_approval, is_active, sort_order",
    orderBy: "sort_order, reason_code",
    activeFilter: "is_active = true",
  },
  {
    tableName: "complaint_types",
    catalogTable: "catalogs.complaint_types",
    routeSegment: "complaint-types",
    companyScoped: true,
    selectSql: "id, operating_company_id, type_code, type_name, default_severity, is_active",
    orderBy: "type_code",
    activeFilter: "is_active = true",
  },
  {
    tableName: "driver_leave_balances",
    catalogTable: "catalogs.driver_leave_balances",
    routeSegment: "driver-leave-balances",
    companyScoped: true,
    selectSql:
      "id, operating_company_id, driver_id, plan_year, vacation_allocated, vacation_used, sick_allocated, sick_used, personal_allocated, personal_used",
    orderBy: "plan_year DESC, driver_id",
  },
  {
    tableName: "labor_rates",
    catalogTable: "catalogs.labor_rates",
    routeSegment: "labor-rates",
    companyScoped: true,
    selectSql: "id, operating_company_id, rate_code, rate_name, rate_per_hour, is_internal, is_active",
    orderBy: "rate_code",
    activeFilter: "is_active = true",
  },
  {
    tableName: "leave_policies",
    catalogTable: "catalogs.leave_policies",
    routeSegment: "leave-policies",
    companyScoped: true,
    selectSql:
      "id, operating_company_id, vacation_days_per_year, sick_days_per_year, personal_days_per_year, vacation_advance_notice_days, personal_advance_notice_days",
    orderBy: "operating_company_id",
  },
  {
    tableName: "maintenance_part_locations",
    catalogTable: "catalogs.maintenance_part_locations",
    routeSegment: "maintenance-part-locations",
    companyScoped: true,
    selectSql: "id, operating_company_id, location_code, location_name, applies_to, category, display_order, is_active",
    orderBy: "display_order, location_code",
    activeFilter: "is_active = true",
  },
  {
    tableName: "parts",
    catalogTable: "catalogs.parts",
    routeSegment: "parts",
    companyScoped: true,
    selectSql: "id, operating_company_id, part_number, part_name, default_cost, applies_to_unit_class, is_active",
    orderBy: "part_number",
    activeFilter: "is_active = true",
  },
];

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function buildListQuery(spec: StubCatalogSpec, operatingCompanyId?: string): { sql: string; values: string[] } {
  const filters: string[] = [];
  if (spec.activeFilter) filters.push(spec.activeFilter);
  if (spec.companyScoped) {
    if (!operatingCompanyId) {
      throw new Error("operating_company_id_required");
    }
    filters.push("operating_company_id = $1");
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const sql = `
    SELECT ${spec.selectSql}
    FROM ${spec.catalogTable}
    ${where}
    ORDER BY ${spec.orderBy}
  `;
  return { sql, values: spec.companyScoped && operatingCompanyId ? [operatingCompanyId] : [] };
}

export async function registerStubCatalogPurgeRoutes(app: FastifyInstance) {
  for (const spec of STUB_CATALOG_SPECS) {
    app.get(`/api/v1/catalogs/${spec.routeSegment}`, async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

      if (spec.companyScoped && !parsedQuery.data.operating_company_id) {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }

      return withCurrentUser(user.uuid, async (client) => {
        const { sql, values } = buildListQuery(spec, parsedQuery.data.operating_company_id);
        const res = await client.query(sql, values);
        return { table: spec.catalogTable, rows: res.rows };
      });
    });
  }
}

export const STUB_CATALOG_TABLES = [
  ...STUB_CATALOG_SPECS.map((spec) => spec.tableName),
  ...ALREADY_WIRED_STUB_TABLES.map((spec) => spec.tableName),
];
