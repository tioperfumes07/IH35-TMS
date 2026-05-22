import { afterEach, describe, expect, it, vi } from "vitest";
import { routeFindingAlert, type ReconciliationAlertFinding } from "./alert-routing.service.js";

type Call = { sql: string; values?: unknown[] };

function createClient(config?: { phone?: string | null; code?: string | null }) {
  const calls: Call[] = [];
  const outboxPayloads: Array<Record<string, unknown>> = [];
  const audits: Array<unknown[]> = [];

  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("FROM org.companies")) {
        return { rows: [{ phone: config?.phone ?? null, code: config?.code ?? "TRK" }] };
      }
      if (sql.includes("INSERT INTO outbox.events")) {
        outboxPayloads.push(JSON.parse(String(values?.[1] ?? "{}")) as Record<string, unknown>);
        return { rows: [{ id: "event-id-1" }] };
      }
      if (sql.includes("audit.append_event")) {
        audits.push(values ?? []);
        return { rows: [{ uuid: "audit-id" }] };
      }
      return { rows: [] };
    },
  };

  return { client, calls, outboxPayloads, audits };
}

const baseFinding: ReconciliationAlertFinding = {
  id: "11111111-2222-3333-4444-555555555555",
  operating_company_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  integration: "qbo",
  mirror_category: "transactional",
  finding_type: "count_drift",
  severity: "critical",
  status: "open",
  detected_at: "2026-05-22T10:00:00.000Z",
};

describe("alert-routing.service", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enqueues on critical insert", async () => {
    const { client, outboxPayloads, audits } = createClient({ phone: "+19565550123" });
    await routeFindingAlert({ client, finding: baseFinding, isNew: true, severityEscalated: false });
    expect(outboxPayloads).toHaveLength(1);
    expect(outboxPayloads[0]).toMatchObject({
      to: "+19565550123",
      source: "reconciliation.alert_router",
      severity: "critical",
      severity_escalated: false,
      finding_id: baseFinding.id,
    });
    expect(String(outboxPayloads[0]?.body ?? "")).toContain("IH35 ALERT [critical]");
    expect(audits.some((v) => v[0] === "alert_enqueued")).toBe(true);
  });

  it("does not enqueue important insert", async () => {
    const { client, outboxPayloads } = createClient({ phone: "+19565550123" });
    await routeFindingAlert({
      client,
      finding: { ...baseFinding, severity: "important" },
      isNew: true,
      severityEscalated: false,
    });
    expect(outboxPayloads).toHaveLength(0);
  });

  it("enqueues once when severity escalates to critical", async () => {
    const { client, outboxPayloads } = createClient({ phone: "+19565550123" });
    await routeFindingAlert({
      client,
      finding: baseFinding,
      isNew: false,
      severityEscalated: true,
    });
    expect(outboxPayloads).toHaveLength(1);
    expect(outboxPayloads[0]?.severity_escalated).toBe(true);
    expect(String(outboxPayloads[0]?.body ?? "")).toContain("IH35 ESCALATED->Critical");
  });

  it("does not enqueue on unchanged critical update", async () => {
    const { client, outboxPayloads } = createClient({ phone: "+19565550123" });
    await routeFindingAlert({
      client,
      finding: baseFinding,
      isNew: false,
      severityEscalated: false,
    });
    expect(outboxPayloads).toHaveLength(0);
  });

  it("does not enqueue for resolved status", async () => {
    const { client, outboxPayloads } = createClient({ phone: "+19565550123" });
    await routeFindingAlert({
      client,
      finding: { ...baseFinding, status: "resolved" },
      isNew: false,
      severityEscalated: true,
    });
    expect(outboxPayloads).toHaveLength(0);
  });

  it("does not enqueue cleanup insert", async () => {
    const { client, outboxPayloads } = createClient({ phone: "+19565550123" });
    await routeFindingAlert({
      client,
      finding: { ...baseFinding, severity: "cleanup" },
      isNew: true,
      severityEscalated: false,
    });
    expect(outboxPayloads).toHaveLength(0);
  });

  it("fires alert_recipient_missing audit when no recipient found", async () => {
    const { client, outboxPayloads, audits } = createClient({ phone: null, code: "TRK" });
    vi.stubEnv("ALERT_PHONE_TRK", "");
    await routeFindingAlert({
      client,
      finding: baseFinding,
      isNew: true,
      severityEscalated: false,
    });
    expect(outboxPayloads).toHaveLength(0);
    expect(audits.some((values) => values[0] === "alert_recipient_missing")).toBe(true);
  });
});
