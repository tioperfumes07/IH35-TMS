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

function claimSelectColumns() {
  return `
    id::text,
    tenant_id::text,
    claim_number,
    policy_id::text,
    asset_id::text,
    accident_date::text,
    reported_date::text,
    status,
    amount_claimed_cents::bigint,
    amount_paid_cents::bigint,
    adjuster_name,
    adjuster_email,
    notes,
    created_at::text
  `;
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
      const result = await client.query(
        `
          SELECT ${claimSelectColumns()}
          FROM insurance.claim
          WHERE ${filters.join(" AND ")}
          ORDER BY accident_date DESC, created_at DESC
        `,
        values
      );
      return result.rows;
    });

    return { claims: rows };
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

      const result = await client.query(
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
            notes
          )
          VALUES (
            $1::uuid, $2, $3::uuid, $4::uuid, $5::date, $6::date, $7, $8, $9, $10, $11, $12
          )
          RETURNING ${claimSelectColumns()}
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
        ]
      );
      return { kind: "ok" as const, row: result.rows[0] };
    });

    if (created.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (created.kind === "asset_not_found") return reply.code(404).send({ error: "asset_not_found" });
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

      const result = await client.query(
        `
          UPDATE insurance.claim
          SET ${assignments.join(", ")}
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING ${claimSelectColumns()}
        `,
        values
      );
      if (!result.rows[0]) return { kind: "claim_not_found" as const };
      return { kind: "ok" as const, row: result.rows[0] };
    });

    if (updated.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (updated.kind === "asset_not_found") return reply.code(404).send({ error: "asset_not_found" });
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
