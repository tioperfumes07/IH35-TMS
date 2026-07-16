import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  claimIdParamsSchema,
  createClaimBodySchema,
  INSURANCE_CLAIM_STATUSES,
  type InsuranceClaimStatus,
  listClaimsQuerySchema,
  operatingCompanySchema,
  updateClaimBodySchema,
} from "./claim.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

const CLAIM_STATUS_TRANSITIONS: Record<InsuranceClaimStatus, readonly InsuranceClaimStatus[]> = {
  open: ["investigating", "approved", "denied", "closed"],
  investigating: ["approved", "denied", "closed"],
  approved: ["paid", "closed"],
  denied: ["closed"],
  paid: ["closed"],
  closed: [],
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"].includes(role);
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function claimSelectColumns(alias = "c") {
  const a = alias ? `${alias}.` : "";
  return `
    ${a}id::text,
    ${a}tenant_id::text,
    ${a}claim_number,
    ${a}policy_id::text,
    ${a}asset_id::text,
    assets.unit_id::text AS unit_id,
    ${a}accident_date::text,
    ${a}reported_date::text,
    ${a}status,
    ${a}amount_claimed_cents::bigint,
    ${a}amount_paid_cents::bigint,
    ${a}adjuster_name,
    ${a}adjuster_email,
    ${a}notes,
    ${a}created_at::text,
    ${a}accident_report_id::text,
    ${a}load_id::text,
    ${a}driver_id::text
  `;
}

const CLAIM_FROM = `
  FROM insurance.claim c
  LEFT JOIN mdata.assets assets ON assets.id = c.asset_id
`;

async function assertOptionalHubExists(
  client: Queryable,
  operatingCompanyId: string,
  kind: "accident_report" | "load" | "driver",
  id: string | null | undefined
): Promise<"ok" | "not_found"> {
  if (id === undefined || id === null) return "ok";
  if (kind === "accident_report") {
    const res = await client.query(
      `
        SELECT id::text
        FROM safety.accident_reports
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [id, operatingCompanyId]
    );
    return res.rows[0] ? "ok" : "not_found";
  }
  if (kind === "load") {
    const res = await client.query(
      `
        SELECT id::text
        FROM mdata.loads
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [id, operatingCompanyId]
    );
    return res.rows[0] ? "ok" : "not_found";
  }
  const res = await client.query(
    `
      SELECT id::text
      FROM mdata.drivers
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  return res.rows[0] ? "ok" : "not_found";
}

function canTransitionClaimStatus(currentStatus: InsuranceClaimStatus, nextStatus: InsuranceClaimStatus) {
  if (currentStatus === nextStatus) return true;
  return CLAIM_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
}

export async function registerInsuranceClaimRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/claims", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = listClaimsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const values: unknown[] = [parsed.data.operating_company_id];
      const filters = ["tenant_id = $1::uuid"];
      if (parsed.data.policy_id) {
        values.push(parsed.data.policy_id);
        filters.push(`policy_id = $${values.length}::uuid`);
      }
      if (parsed.data.status) {
        values.push(parsed.data.status);
        filters.push(`status = $${values.length}`);
      }
      if (parsed.data.asset_id) {
        values.push(parsed.data.asset_id);
        filters.push(`asset_id = $${values.length}::uuid`);
      }
      const scopedFilters = filters.map((f) => f.replace(/^tenant_id/, "c.tenant_id").replace(/^policy_id/, "c.policy_id").replace(/^status/, "c.status").replace(/^asset_id/, "c.asset_id"));
      const result = await client.query(
        `
          SELECT ${claimSelectColumns("c")}
          ${CLAIM_FROM}
          WHERE ${scopedFilters.join(" AND ")}
          ORDER BY c.accident_date DESC, c.created_at DESC
        `,
        values
      );
      return result.rows;
    });

    return { claims: rows };
  });

  /** Read-only reverse fan-out: claim → accidents / lawsuits / matters / incidents already linked in. */
  app.get("/api/v1/insurance/claims/:id/graph", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = claimIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = operatingCompanySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const graph = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const claimRes = await client.query(
        `
          SELECT ${claimSelectColumns("c")}
          ${CLAIM_FROM}
          WHERE c.tenant_id = $1::uuid AND c.id = $2::uuid
          LIMIT 1
        `,
        [query.data.operating_company_id, params.data.id]
      );
      const claim = claimRes.rows[0];
      if (!claim) return null;

      const [accidents, lawsuits, matters, incidents, chains] = await Promise.all([
        client.query(
          `
            SELECT id::text, insurance_claim_id::text, driver_id::text, unit_id::text, accident_at::text
            FROM safety.accident_reports
            WHERE operating_company_id = $1::uuid
              AND insurance_claim_id = $2::uuid
            ORDER BY accident_at DESC NULLS LAST
            LIMIT 50
          `,
          [query.data.operating_company_id, params.data.id]
        ),
        client.query(
          `
            SELECT id::text, case_number, claim_id::text, status, filed_date::text
            FROM insurance.lawsuit
            WHERE tenant_id = $1::uuid
              AND claim_id = $2::uuid
            ORDER BY filed_date DESC NULLS LAST
            LIMIT 50
          `,
          [query.data.operating_company_id, params.data.id]
        ),
        client.query(
          `
            SELECT id::text, matter_number, insurance_claim_id::text, status, type
            FROM legal.matters
            WHERE operating_company_id = $1::uuid
              AND insurance_claim_id = $2::uuid
            ORDER BY matter_number ASC
            LIMIT 50
          `,
          [query.data.operating_company_id, params.data.id]
        ),
        client.query(
          `
            SELECT id::text, auto_created_claim_id::text, incident_type, incident_at::text
            FROM safety.incidents
            WHERE operating_company_id = $1::uuid
              AND auto_created_claim_id = $2::uuid
            ORDER BY incident_at DESC NULLS LAST
            LIMIT 50
          `,
          [query.data.operating_company_id, params.data.id]
        ),
        client.query(
          `
            SELECT uuid::text AS id, insurance_claim_id::text, final_resolution_status
            FROM safety.damage_continuity_chains
            WHERE operating_company_id = $1::uuid
              AND insurance_claim_id = $2::uuid
            LIMIT 50
          `,
          [query.data.operating_company_id, params.data.id]
        ),
      ]);

      return {
        claim,
        reverse: {
          accidents: accidents.rows,
          lawsuits: lawsuits.rows,
          matters: matters.rows,
          incidents: incidents.rows,
          damage_continuity_chains: chains.rows,
        },
        // Honest gap: no expense/WO/settlement FK to insurance.claim exists on prod — do not invent.
        gaps: {
          expense: "no accounting.expenses.claim_id (or equivalent) on prod",
          work_order: "no maintenance.work_orders.claim_id on prod",
          settlement_deduction: "no driver_finance.driver_settlement_deductions.source claim FK on prod",
        },
      };
    });

    if (!graph) return reply.code(404).send({ error: "claim_not_found" });
    return graph;
  });

  app.post("/api/v1/insurance/claims", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = createClaimBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const body = parsed.data;

    const created = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
      const policy = await client.query(
        `
          SELECT id::text
          FROM insurance.policy
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          LIMIT 1
        `,
        [body.operating_company_id, body.policy_id]
      );
      if (!policy.rows[0]) return { kind: "policy_not_found" as const };

      if (body.asset_id) {
        const asset = await client.query(
          `
            SELECT id::text
            FROM mdata.assets
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
          `,
          [body.operating_company_id, body.asset_id]
        );
        if (!asset.rows[0]) return { kind: "asset_not_found" as const };
      }

      for (const [kind, id] of [
        ["accident_report", body.accident_report_id],
        ["load", body.load_id],
        ["driver", body.driver_id],
      ] as const) {
        if ((await assertOptionalHubExists(client, body.operating_company_id, kind, id)) === "not_found") {
          return { kind: `${kind}_not_found` as const };
        }
      }

      const insert = await client.query<{ id: string }>(
        `
          INSERT INTO insurance.claim (
            tenant_id,
            claim_number,
            policy_id,
            asset_id,
            accident_date,
            reported_date,
            status,
            amount_claimed_cents,
            amount_paid_cents,
            adjuster_name,
            adjuster_email,
            notes,
            accident_report_id,
            load_id,
            driver_id
          )
          VALUES (
            $1::uuid, $2, $3::uuid, $4::uuid, $5::date, $6::date, $7, $8, $9, $10, $11, $12,
            $13::uuid, $14::uuid, $15::uuid
          )
          RETURNING id::text
        `,
        [
          body.operating_company_id,
          body.claim_number,
          body.policy_id,
          body.asset_id ?? null,
          body.accident_date,
          body.reported_date,
          body.status ?? "open",
          body.amount_claimed_cents,
          body.amount_paid_cents,
          body.adjuster_name ?? null,
          body.adjuster_email ?? null,
          body.notes ?? null,
          body.accident_report_id ?? null,
          body.load_id ?? null,
          body.driver_id ?? null,
        ]
      );
      const createdId = insert.rows[0]?.id;
      if (!createdId) return { kind: "claim_not_found" as const };
      const result = await client.query(
        `
          SELECT ${claimSelectColumns("c")}
          ${CLAIM_FROM}
          WHERE c.tenant_id = $1::uuid AND c.id = $2::uuid
          LIMIT 1
        `,
        [body.operating_company_id, createdId]
      );
      return { kind: "ok" as const, row: result.rows[0] };
    });

    if (created.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (created.kind === "asset_not_found") return reply.code(404).send({ error: "asset_not_found" });
    if (created.kind === "accident_report_not_found") return reply.code(404).send({ error: "accident_report_not_found" });
    if (created.kind === "load_not_found") return reply.code(404).send({ error: "load_not_found" });
    if (created.kind === "driver_not_found") return reply.code(404).send({ error: "driver_not_found" });
    if (created.kind === "claim_not_found") return reply.code(500).send({ error: "claim_create_failed" });
    return reply.code(201).send(created.row);
  });

  app.patch("/api/v1/insurance/claims/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = claimIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = operatingCompanySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const bodyParsed = updateClaimBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return reply.code(400).send({ error: "validation_error", details: bodyParsed.error.flatten() });
    const body = bodyParsed.data;

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (body.policy_id !== undefined) {
        const policy = await client.query(
          `
            SELECT id::text
            FROM insurance.policy
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
          `,
          [query.data.operating_company_id, body.policy_id]
        );
        if (!policy.rows[0]) return { kind: "policy_not_found" as const };
      }

      if (body.asset_id !== undefined && body.asset_id !== null) {
        const asset = await client.query(
          `
            SELECT id::text
            FROM mdata.assets
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
          `,
          [query.data.operating_company_id, body.asset_id]
        );
        if (!asset.rows[0]) return { kind: "asset_not_found" as const };
      }

      for (const [kind, id] of [
        ["accident_report", body.accident_report_id],
        ["load", body.load_id],
        ["driver", body.driver_id],
      ] as const) {
        if ((await assertOptionalHubExists(client, query.data.operating_company_id, kind, id)) === "not_found") {
          return { kind: `${kind}_not_found` as const };
        }
      }

      if (body.status) {
        const currentClaim = await client.query<{ status: InsuranceClaimStatus }>(
          `
            SELECT status
            FROM insurance.claim
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
          `,
          [query.data.operating_company_id, params.data.id]
        );
        const currentStatus = currentClaim.rows[0]?.status;
        if (!currentStatus) return { kind: "claim_not_found" as const };
        if (!INSURANCE_CLAIM_STATUSES.includes(currentStatus)) return { kind: "claim_not_found" as const };
        if (!canTransitionClaimStatus(currentStatus, body.status)) {
          return { kind: "invalid_status_transition" as const, from: currentStatus, to: body.status };
        }
      }

      const assignments: string[] = [];
      const values: unknown[] = [query.data.operating_company_id, params.data.id];
      const setField = (column: string, value: unknown, cast = "") => {
        values.push(value);
        assignments.push(`${column} = $${values.length}${cast}`);
      };

      if (body.claim_number !== undefined) setField("claim_number", body.claim_number);
      if (body.policy_id !== undefined) setField("policy_id", body.policy_id, "::uuid");
      if (body.asset_id !== undefined) setField("asset_id", body.asset_id, "::uuid");
      if (body.accident_date !== undefined) setField("accident_date", body.accident_date, "::date");
      if (body.reported_date !== undefined) setField("reported_date", body.reported_date, "::date");
      if (body.status !== undefined) setField("status", body.status);
      if (body.amount_claimed_cents !== undefined) setField("amount_claimed_cents", body.amount_claimed_cents);
      if (body.amount_paid_cents !== undefined) setField("amount_paid_cents", body.amount_paid_cents);
      if (body.adjuster_name !== undefined) setField("adjuster_name", body.adjuster_name);
      if (body.adjuster_email !== undefined) setField("adjuster_email", body.adjuster_email);
      if (body.notes !== undefined) setField("notes", body.notes);
      if (body.accident_report_id !== undefined) setField("accident_report_id", body.accident_report_id, "::uuid");
      if (body.load_id !== undefined) setField("load_id", body.load_id, "::uuid");
      if (body.driver_id !== undefined) setField("driver_id", body.driver_id, "::uuid");

      if (assignments.length === 0) return { kind: "claim_not_found" as const };

      const upd = await client.query<{ id: string }>(
        `
          UPDATE insurance.claim
          SET ${assignments.join(", ")}
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING id::text
        `,
        values
      );
      if (!upd.rows[0]) return { kind: "claim_not_found" as const };
      const result = await client.query(
        `
          SELECT ${claimSelectColumns("c")}
          ${CLAIM_FROM}
          WHERE c.tenant_id = $1::uuid AND c.id = $2::uuid
          LIMIT 1
        `,
        [query.data.operating_company_id, params.data.id]
      );
      return { kind: "ok" as const, row: result.rows[0] };
    });

    if (updated.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (updated.kind === "asset_not_found") return reply.code(404).send({ error: "asset_not_found" });
    if (updated.kind === "accident_report_not_found") return reply.code(404).send({ error: "accident_report_not_found" });
    if (updated.kind === "load_not_found") return reply.code(404).send({ error: "load_not_found" });
    if (updated.kind === "driver_not_found") return reply.code(404).send({ error: "driver_not_found" });
    if (updated.kind === "claim_not_found") return reply.code(404).send({ error: "claim_not_found" });
    if (updated.kind === "invalid_status_transition") {
      return reply.code(400).send({
        error: "invalid_status_transition",
        from: updated.from,
        to: updated.to,
      });
    }
    return updated.row;
  });
}
