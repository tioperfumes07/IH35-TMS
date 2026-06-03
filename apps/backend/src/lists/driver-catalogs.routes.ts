import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "../catalogs/driver/factory.js";
import { DRIVER_SUBCATALOG_CODE_REGEX, DRIVER_SUBCATALOG_CONFIGS } from "../catalogs/driver/subcatalog-config.js";

/**
 * PR #403 catalogs.* driver sub-catalog factory routes (deprecated A17.2).
 * Canonical read/write: /api/v1/lists/drivers/* on reference.* tables.
 */
export async function registerDriverCatalogDeprecatedRoutes(app: FastifyInstance) {
  for (const config of DRIVER_SUBCATALOG_CONFIGS) {
    createCatalogRoutes(app, {
      tableName: config.tableName,
      urlSegment: config.urlSegment,
      routePrefix: "/api/v1/catalogs/driver",
      displayName: config.displayName,
      codeRegex: DRIVER_SUBCATALOG_CODE_REGEX,
      deprecation: {
        navSegment: config.urlSegment,
        successorListsSegment: config.successorListsSegment,
      },
    });
  }
}
