import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "./factory.js";
import { INSURANCE_CLAIM_RECOVERY_RAIL_VALUES } from "../../insurance/claim.shared.js";

export async function registerDriverCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, {
    tableName: "pay_rate_templates",
    urlSegment: "pay-rate-templates",
    routePrefix: "/api/v1/catalogs/driver",
    displayName: "Pay Rate Templates",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "driver_deduction_types",
    urlSegment: "deduction-types",
    routePrefix: "/api/v1/catalogs/driver",
    displayName: "Driver Deduction Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
    // Owner ruling 2026-07-27: driver_deduction_types is the CANONICAL recovery-reason catalog.
    // escrow_types defines escrow BUCKETS (its seed carries a funding target) and structurally
    // cannot express "settlement first", which is 00_LOCKED_DECISIONS 9.3's primary rule.
    optionalBooleans: ["may_draw_escrow", "survives_separation"],
    // The rail vocabulary is IMPORTED, never re-declared. It is owner lock #1 (2026-07-22), already
    // enforced on prod as insurance.claim.recovery_rail's CHECK. Typing the four words again here
    // would create a second dialect that drifts the first time the lock changes.
    optionalEnums: [{ column: "default_recovery_rail", values: INSURANCE_CLAIM_RECOVERY_RAIL_VALUES }],
  });

  createCatalogRoutes(app, {
    tableName: "driver_pay_types",
    urlSegment: "pay-types",
    routePrefix: "/api/v1/catalogs/driver",
    displayName: "Driver Pay Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "escrow_types",
    urlSegment: "escrow-types",
    routePrefix: "/api/v1/catalogs/driver",
    displayName: "Escrow Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });
}
