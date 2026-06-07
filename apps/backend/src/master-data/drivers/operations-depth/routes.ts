import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import { assertDriverScope, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";
import { getDriverDebtHistory } from "./debt-history.service.js";
import { getDriverPayrollHistory } from "./payroll-history.service.js";
import { getDriverEscrowHistory } from "./escrow-history.service.js";
import { getDriverPermitHistory } from "./permit-history.service.js";
import { getDriverAccidentHistory } from "./accident-history.service.js";
import { getDriverSettlementHistory } from "./settlement-history.service.js";
import { getDriverFuelHistory } from "./fuel-history.service.js";
import { getDriverMaintenanceAssignments } from "./maintenance-assignments.service.js";
import { getDriverSafetyEvents } from "./safety-events.service.js";
import { getDriverCommunicationsLog } from "./communications-log.service.js";
import { getDriverPwaEngagement } from "./pwa-engagement.service.js";
import { getDriverDocumentsVault } from "./documents-vault.service.js";

const driverParamsSchema = z.object({ uuid: z.string().uuid() });
const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().max(200).optional(),
});

type SubViewLoader = (
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts
) => Promise<OperationsResult>;

/** Canonical registry of the 12 driver operations-depth sub-views. */
export const OPERATIONS_DEPTH_SUBVIEWS: ReadonlyArray<{ slug: string; loader: SubViewLoader }> = [
  { slug: "debt-history", loader: getDriverDebtHistory },
  { slug: "payroll-history", loader: getDriverPayrollHistory },
  { slug: "escrow-history", loader: getDriverEscrowHistory },
  { slug: "permit-history", loader: getDriverPermitHistory },
  { slug: "accident-history", loader: getDriverAccidentHistory },
  { slug: "settlement-history", loader: getDriverSettlementHistory },
  { slug: "fuel-history", loader: getDriverFuelHistory },
  { slug: "maintenance-assignments", loader: getDriverMaintenanceAssignments },
  { slug: "safety-events", loader: getDriverSafetyEvents },
  { slug: "communications-log", loader: getDriverCommunicationsLog },
  { slug: "pwa-engagement", loader: getDriverPwaEngagement },
  { slug: "documents-vault", loader: getDriverDocumentsVault },
];

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverOperationsDepthRoutes(app: FastifyInstance) {
  for (const subView of OPERATIONS_DEPTH_SUBVIEWS) {
    app.get(`/api/drivers/:uuid/operations/${subView.slug}`, async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const params = driverParamsSchema.safeParse(req.params ?? {});
      const query = querySchema.safeParse(req.query ?? {});
      if (!params.success || !query.success) {
        return reply.code(400).send({ error: "validation_error" });
      }

      const result = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [
          query.data.operating_company_id,
        ]);
        const driverId = await assertDriverScope(client, params.data.uuid, query.data.operating_company_id);
        if (!driverId) return null;
        return subView.loader(client, params.data.uuid, query.data.operating_company_id, {
          page: query.data.page,
          page_size: query.data.page_size,
        });
      });

      if (!result) return reply.code(404).send({ error: "driver_not_found" });
      return { sub_view: subView.slug, ...result };
    });
  }
}
