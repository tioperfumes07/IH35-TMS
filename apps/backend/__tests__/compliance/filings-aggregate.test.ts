import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { daysUntil, statusFor } from "../../src/compliance/filings-aggregate.service.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("compliance & filings aggregator", () => {
  it("classifies status by days-until-due at the boundaries", () => {
    const future = (days: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    assert.equal(statusFor(null), "not_yet_tracked");
    assert.equal(statusFor(future(-1)), "overdue");
    assert.equal(statusFor(future(0)), "due");
    assert.equal(statusFor(future(14)), "due");
    assert.equal(statusFor(future(15)), "upcoming");
    assert.equal(statusFor(future(90)), "upcoming");
  });

  it("computes days-until for a known future date", () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 10);
    const iso = d.toISOString().slice(0, 10);
    const days = daysUntil(iso);
    assert.ok(days !== null && days >= 9 && days <= 11);
  });

  it("aggregates every real source including the now-built business-property-tax rendition", () => {
    const src = fs.readFileSync(path.join(here, "../../src/compliance/filings-aggregate.service.ts"), "utf8");
    // Real sources — each program stays in its own module, this file only reads it.
    assert.match(src, /reports\.ifta_filings/);
    assert.match(src, /compliance\.form_2290_filings/);
    assert.match(src, /safety\.permits/);
    assert.match(src, /buildComplianceCredentials/); // IRP + driver CDL/medical/drug-test
    assert.match(src, /safety\.clearinghouse_query/);
    assert.match(src, /safety\.driver_documents/); // MVR
    // Business-property tax is now a REAL source reading the rendition tables (no more placeholder).
    assert.match(src, /compliance\.property_tax_renditions/);
    assert.match(src, /loadPropertyTaxItems/);
    assert.doesNotMatch(src, /businessPropertyTaxPlaceholder/);
  });

  it("registers the aggregator route additively inside the compliance route group", () => {
    const src = fs.readFileSync(path.join(here, "../../src/compliance/compliance.routes.ts"), "utf8");
    assert.match(src, /registerFilingsAggregateRoutes/);
  });
});
