import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import { REPORT_CATEGORIES } from "./category-catalog.js";

export async function registerReportCategoryCatalogRoutes(app: FastifyInstance) {
  app.get("/api/reports/categories/catalog", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return { categories: REPORT_CATEGORIES };
  });
}
