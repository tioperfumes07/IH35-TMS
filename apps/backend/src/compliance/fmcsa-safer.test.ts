import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveSaferFieldsFromCarrier,
  parseSaferOperatingStatus,
  type SaferVerificationResult,
} from "./fmcsa-safer-verifier.js";
import type { CarrierResult } from "../lib/fmcsa-client.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("fmcsa-safer-verifier", () => {
  it("parses in-service and out-of-service SAFER HTML variants", () => {
    const inService = parseSaferOperatingStatus(
      "Operating Status: AUTHORIZED FOR Property Out of Service Date: None"
    );
    expect(inService).toBe("in_service");

    const oos = parseSaferOperatingStatus(
      "Operating Status: NOT AUTHORIZED Out of Service Date: 01/15/2024"
    );
    expect(oos).toBe("out_of_service");
  });

  it("derives verified status for active in-service carriers", () => {
    const carrier: CarrierResult = {
      legal_name: "TQL Logistics",
      dba_name: null,
      usdot_number: "123456",
      mc_number: "915563",
      address: { line1: null, city: null, state: null, zip: null },
      phone: null,
      authority_status: "ACTIVE",
      insurance_status: "YES",
      safety_rating: "NONE",
      raw: { html: "Operating Status: AUTHORIZED Out of Service Date: None" },
    };
    const derived = deriveSaferFieldsFromCarrier(carrier, "Operating Status: AUTHORIZED Out of Service Date: None");
    expect(derived.safer_status).toBe("verified");
    expect(derived.safer_authority_status).toBe("ACTIVE");
    expect(derived.safer_oos_status).toBe("in_service");
    expect(derived.safer_verified_at).not.toBeNull();
  });

  it("marks revoked authority as failed verification", () => {
    const carrier: CarrierResult = {
      legal_name: "Inactive Carrier",
      dba_name: null,
      usdot_number: "999999",
      mc_number: "100",
      address: { line1: null, city: null, state: null, zip: null },
      phone: null,
      authority_status: "REVOKED",
      insurance_status: null,
      safety_rating: null,
      raw: {},
    };
    const derived = deriveSaferFieldsFromCarrier(carrier);
    expect(derived.safer_status).toBe("failed");
    expect(derived.safer_oos_status).toBe("out_of_service");
  });

  it("wires routes from form-425c bootstrap", () => {
    const form425c = fs.readFileSync(path.join(here, "form-425c.routes.ts"), "utf8");
    expect(form425c).toContain("registerFmcsaSaferRoutes");
  });

  it("exports cron initializer", () => {
    const cronSource = fs.readFileSync(path.join(here, "fmcsa-safer-cron.ts"), "utf8");
    expect(cronSource).toContain("initializeFmcsaSaferVerificationCron");
    expect(cronSource).toContain("compliance.fmcsa_safer_verification_cron");
  });

  it("types safer verification result", () => {
    const sample: SaferVerificationResult = {
      entity_type: "customer",
      entity_id: "00000000-0000-4000-8000-000000000001",
      operating_company_id: "00000000-0000-4000-8000-000000000002",
      lookup_type: "mc",
      lookup_value: "915563",
      safer_status: "verified",
      safer_authority_status: "ACTIVE",
      safer_oos_status: "in_service",
      safer_verified_at: new Date().toISOString(),
      legal_name: "TQL Logistics",
      insurance_status: "YES",
      source: "fmcsa_safer",
    };
    expect(sample.safer_status).toBe("verified");
  });
});
