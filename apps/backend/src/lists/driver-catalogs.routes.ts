import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "../catalogs/driver/factory.js";
import { DRIVER_SUBCATALOG_CODE_REGEX, DRIVER_SUBCATALOG_CONFIGS } from "../catalogs/driver/subcatalog-config.js";

/**
 * PR #403 catalogs.* driver sub-catalog factory routes (deprecated A17.2).
 * Canonical read/write: /api/v1/lists/drivers/* on reference.* tables.
 *
 * SWEEP-C11 split-brain fix (2026-07-25): these 5 catalogs.* tables are a CONFIRMED split-brain
 * LOSER vs their reference.* counterpart — both surfaces accepted live writes, so a row created
 * on this (catalogs.*) surface was invisible on the canonical /lists/drivers/* (reference.*)
 * surface. Neon prod lucia-bypass read (2026-07-25) showed catalogs.* = 0 rows on all 5 tables
 * vs reference.* holding the live canonical data (9/6/7/9/11 rows) — no backfill required.
 * `writesBlocked: true` makes POST/PATCH/DELETE return 410 (factory.ts) so this surface can never
 * diverge again; GET stays live as a read-only archive (Rule 07 never-delete). DB-level
 * defense-in-depth: db/migrations/202609040000_sweep_c11_driver_subcatalog_split_brain_lock.sql.
 * Guard: scripts/verify-sweep-c11-no-entity-split-brain.mjs.
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
        writesBlocked: true,
      },
    });
  }
}
