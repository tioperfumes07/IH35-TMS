// LEASE-02 routes — the wiring that makes the lease tables reachable (§10a linkage law).
// Read-only: creating/amending a lease is an owner action in Legal, and posting needs a per-deal
// ASC 842 election plus owner-designated accounts. Entity-scoped via withCompanyScope; the tables are
// FORCE RLS with a bilateral header policy so lessor and lessee each see what they are party to.
import fp from "fastify-plugin";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import {
  getAssetLeaseParties,
  getLeaseContractLines,
  listLeaseContracts,
} from "./lease-contracts.service.js";

const idParams = z.object({ id: z.string().uuid() });

export async function registerLeaseContractRoutes(app: FastifyInstance) {
  app.get("/api/v1/fleet/lease-contracts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listLeaseContracts(client, query.data.operating_company_id)
    );
    return { rows };
  });

  app.get("/api/v1/fleet/lease-contracts/:id/lines", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParams.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      getLeaseContractLines(client, query.data.operating_company_id, params.data.id)
    );
    return { rows };
  });

  // Reverse linkage: one asset -> EVERY lessee it is leased to. The old single column could only ever
  // name one; Trucking leases the same truck to Transportation AND USMCA, so two rows is correct.
  app.get("/api/v1/fleet/assets/:id/lease-parties", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParams.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      getAssetLeaseParties(client, query.data.operating_company_id, params.data.id)
    );
    return { rows };
  });
}

export default fp(async (app: FastifyInstance) => {
  await registerLeaseContractRoutes(app);
}, { name: "fleet.registerLeaseContractRoutes" });
