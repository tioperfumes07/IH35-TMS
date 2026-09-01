import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { getLoadVoidTree } from "./void-tree.service.js";

const voidTreeQuerySchema = companyQuerySchema.extend({
  type: z.enum(["load"]),
  id: z.string().uuid(),
});

export async function registerVoidTreeRoutes(app: FastifyInstance) {
  // Cascade Void dependency-tree API (CC-1's half of the design in
  // docs/bus/CASCADE-VOID-DESIGN-FOR-OWNER-2026-09-01.md). Read-only; does not void anything. The
  // consuming Cascade Void dialog is gated on the owner's APPROVED/CHANGES ruling on that design --
  // this endpoint ships ahead of it, dormant until Cursor wires a caller.
  app.get("/api/v1/linkage/void-tree", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = voidTreeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);

    const tree = await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
      if (query.data.type === "load") return getLoadVoidTree(client, query.data.operating_company_id, query.data.id);
      return null;
    });

    if (!tree) return reply.code(404).send({ error: "void_tree_root_not_found" });
    return tree;
  });
}

export default fp(
  async (app) => {
    await registerVoidTreeRoutes(app);
  },
  { name: "accounting.registerVoidTreeRoutes" }
);
