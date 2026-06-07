import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("GAP-19 detention approval gate", () => {
  const routesPath = resolve(import.meta.dirname, "../detention-approval.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../detention-approval.service.ts");
  const indexPath = resolve(import.meta.dirname, "../../index.ts");
  const routes = readFileSync(routesPath, "utf8");
  const service = readFileSync(servicePath, "utf8");
  const index = readFileSync(indexPath, "utf8");

  it("registers approval queue, kpis, approve, and reject endpoints", () => {
    expect(routes).toContain("/api/v1/dispatch/detention/requests");
    expect(routes).toContain("/api/v1/dispatch/detention/requests/kpis");
    expect(routes).toContain("/api/v1/dispatch/detention/requests/:id/approve");
    expect(routes).toContain("/api/v1/dispatch/detention/requests/:id/reject");
    expect(index).toContain("registerDispatchDetentionApprovalRoutes");
  });

  it("enforces Manager+ RBAC on approve and reject mutations only", () => {
    expect(routes).toContain("isDetentionApprover");
    expect(routes).toContain('r === "Manager"');
    expect(routes).toContain('reply.code(403).send({ error: "forbidden" })');
    // RBAC guard appears on the two PATCH mutations.
    expect((routes.match(/isDetentionApprover\(user\.role\)/g) ?? []).length).toBe(2);
  });

  it("reuses bridgeDetentionToBilling then buildInvoiceFromLoad on approval", () => {
    expect(service).toContain("bridgeDetentionToBilling");
    expect(service).toContain("buildInvoiceFromLoad");
    // bridge must run before invoice build in the approve flow.
    expect(service.indexOf("bridgeDetentionToBilling(userId")).toBeLessThan(
      service.indexOf("buildInvoiceFromLoad(client")
    );
  });

  it("records dwell evidence derived from stop timestamps with Samsara projection join", () => {
    expect(service).toContain("dispatch.detention_evidence");
    expect(service).toContain("derived_from_stop_timestamps");
    expect(service).toContain("dispatch.stop_arrivals");
    expect(service).toContain("ls.actual_departure_at");
    expect(service).toContain("integrations.samsara_vehicles");
    expect(service).toContain("sv.local_unit_id = de.unit_id");
  });

  it("approval marks request invoiced and reject requires a reason", () => {
    expect(service).toContain("status = 'invoiced'");
    expect(service).toContain("status = 'rejected'");
    expect(service).toContain("rejection_reason");
    expect(routes).toContain("reason: z.string().trim().min(3)");
    expect(service).toContain("request_approved");
    expect(service).toContain("request_rejected");
  });
});

describe("Block H detention approval → customer notification", () => {
  const servicePath = resolve(import.meta.dirname, "../detention-approval.service.ts");
  const service = readFileSync(servicePath, "utf8");
  const migrationsDir = resolve(import.meta.dirname, "../../../../../db/migrations");
  const migrationFile = readdirSync(migrationsDir).find((f) =>
    f.includes("dispatch_detention_customer_notify")
  );
  const migration = migrationFile ? readFileSync(resolve(migrationsDir, migrationFile), "utf8") : "";

  it("gates the email behind the default-OFF feature flag", () => {
    expect(service).toContain("detention_customer_notify_email");
    expect(service).toContain("isEnabled(");
    expect(service).toContain('reason: "flag_disabled"');
  });

  it("sends via the existing dispatch email service", () => {
    expect(service).toContain('from "../notifications/email.service.js"');
    expect(service).toContain("sendEmail(");
    expect(service).toContain('sender: "dispatch"');
    expect(service).toContain("Detention charge — Load #");
  });

  it("labels the charge as derived from stop timestamps (not Samsara/GPS)", () => {
    expect(service).toContain("Charge derived from stop timestamps.");
    expect(service).not.toContain("GPS-tracked");
    expect(service).not.toContain("Samsara dwell record");
  });

  it("is idempotent on customer_notified_at and sends after the approval tx", () => {
    expect(service).toContain("customer_notified_at IS NULL");
    expect(service).toContain("SET customer_notified_at = now()");
    // The notification helper runs after the approval withCompany block resolves.
    expect(service.indexOf("status = 'invoiced'")).toBeLessThan(
      service.indexOf("notifyCustomerOfApprovedDetention(userId")
    );
  });

  it("never lets a notification failure roll back the approval", () => {
    expect(service).toContain('reason: "send_failed"');
  });

  it("ships the additive migration: notify column + seeded default-OFF flag", () => {
    expect(migrationFile).toBeTruthy();
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS customer_notified_at timestamptz");
    expect(migration).toContain("INSERT INTO lib.feature_flags");
    expect(migration).toContain("'detention_customer_notify_email'");
    expect(migration).toMatch(/false/);
    expect(migration).toContain("GRANT USAGE ON SCHEMA dispatch TO ih35_app");
  });
});
