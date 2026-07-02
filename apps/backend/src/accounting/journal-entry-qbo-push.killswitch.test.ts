// IMPORT-P0 proof harness — the JE→QBO push kill-switch must make ZERO network calls when it should not
// push, and must NEVER let a QBO-origin / imported entry round-trip. A recorded fetch = test failure.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const mockClient = { query: vi.fn() };
const mockPoolClient = { query: vi.fn(), release: vi.fn() };

vi.mock("../auth/db.js", () => ({
  pool: { connect: vi.fn(async () => mockPoolClient) },
  withLuciaBypass: vi.fn(async (cb: (c: typeof mockClient) => unknown) => cb(mockClient)),
}));

const isEnabledMock = vi.fn();
vi.mock("../lib/feature-flags/service.js", () => ({ isEnabled: (...a: unknown[]) => isEnabledMock(...a) }));

const getTokenMock = vi.fn();
vi.mock("../integrations/qbo/qbo-oauth.service.js", () => ({ getValidAccessToken: (...a: unknown[]) => getTokenMock(...a) }));

vi.mock("../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

const loadMock = vi.fn();
vi.mock("../integrations/qbo/journal-entry-qbo-mapping.js", () => ({
  loadJournalEntryForSync: (...a: unknown[]) => loadMock(...a),
  mapJournalEntryToQboPayload: () => ({ Line: [], TxnDate: "2024-01-01" }),
}));

import {
  pushJournalEntryToQuickBooksFromQueue,
  pushJournalEntryToQuickBooksImmediateBestEffort,
  QBO_PUSH_REFUSED_IMPORT_SOURCE,
} from "./journal-entry-qbo-push.service.js";

const OC = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const JE = "11111111-1111-4111-8111-111111111111";

type Probe = {
  qbo_journal_entry_id: string | null;
  qbo_sync_pending: boolean;
  status: string;
  source_system: string | null;
};
let currentProbe: Probe;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  currentProbe = { qbo_journal_entry_id: null, qbo_sync_pending: false, status: "posted", source_system: "tms" };
  mockClient.query.mockImplementation((sql: string) => {
    if (/FROM accounting\.journal_entries/.test(sql)) return Promise.resolve({ rows: [currentProbe] });
    return Promise.resolve({ rows: [] });
  });
  mockPoolClient.query.mockImplementation((sql: string) => {
    if (/to_regclass/.test(sql)) return Promise.resolve({ rows: [{ ok: true }] });
    return Promise.resolve({ rows: [] });
  });
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

function syncAlertInserts() {
  return mockPoolClient.query.mock.calls.filter((c) => /INSERT INTO qbo\.sync_alerts/.test(String(c[0])));
}

describe("IMPORT-P0 — JE→QBO push kill-switch (zero-call proof)", () => {
  it("(a) refuses an import/QBO-origin JE even when the flag is ON — zero fetch, no token, non-replayable alert", async () => {
    currentProbe.source_system = "qbo";
    isEnabledMock.mockResolvedValue(true);
    await expect(
      pushJournalEntryToQuickBooksFromQueue({ operating_company_id: OC, entity_id: JE })
    ).rejects.toThrow(QBO_PUSH_REFUSED_IMPORT_SOURCE);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getTokenMock).not.toHaveBeenCalled();
    const alerts = syncAlertInserts();
    expect(alerts).toHaveLength(1);
    // values: [...,10]=severity, [...,11]=replay_hint — must be error + NULL (never replayable)
    const params = alerts[0][1] as unknown[];
    expect(params[10]).toBe("error");
    expect(params[11]).toBeNull();
  });

  it("(a2) refuses a future source_system='qbo_import' the same way", async () => {
    currentProbe.source_system = "qbo_import";
    isEnabledMock.mockResolvedValue(true);
    await expect(
      pushJournalEntryToQuickBooksFromQueue({ operating_company_id: OC, entity_id: JE })
    ).rejects.toThrow(QBO_PUSH_REFUSED_IMPORT_SOURCE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("(b) skips a normal TMS JE when the flag is OFF — zero fetch, no token, breadcrumb only", async () => {
    currentProbe.source_system = "tms";
    isEnabledMock.mockResolvedValue(false);
    const res = await pushJournalEntryToQuickBooksFromQueue({ operating_company_id: OC, entity_id: JE });
    expect(res.qboId).toBeNull();
    expect((res as { skipped?: string }).skipped).toBe("qbo_je_push_disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("(c) immediate-best-effort on an import JE (flag ON) — zero fetch, no outbox, no replayable alert", async () => {
    currentProbe.source_system = "qbo";
    isEnabledMock.mockResolvedValue(true);
    await pushJournalEntryToQuickBooksImmediateBestEffort({ operatingCompanyId: OC, journalEntryId: JE });
    expect(fetchSpy).not.toHaveBeenCalled();
    // no outbox mirror
    expect(mockPoolClient.query.mock.calls.some((c) => /INSERT INTO outbox\.events/.test(String(c[0])))).toBe(false);
    // exactly one alert, and it is the NON-replayable refusal (replay_hint NULL) — best-effort must not add a replayable one
    const alerts = syncAlertInserts();
    expect(alerts).toHaveLength(1);
    expect((alerts[0][1] as unknown[])[11]).toBeNull();
  });

  it("(c2) immediate-best-effort on a normal JE with flag OFF — zero fetch, no outbox", async () => {
    currentProbe.source_system = "tms";
    isEnabledMock.mockResolvedValue(false);
    await pushJournalEntryToQuickBooksImmediateBestEffort({ operatingCompanyId: OC, journalEntryId: JE });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockPoolClient.query.mock.calls.some((c) => /INSERT INTO outbox\.events/.test(String(c[0])))).toBe(false);
  });

  it("(f) still pushes a normal TMS JE when the flag is ON for the entity — exactly one fetch (gate does not over-block)", async () => {
    currentProbe.source_system = "tms";
    isEnabledMock.mockResolvedValue(true);
    getTokenMock.mockResolvedValue({ access_token: "tok", realm_id: "R1" });
    loadMock.mockResolvedValue({ header: { id: JE, status: "posted" } });
    fetchSpy.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ JournalEntry: { Id: "QBO-9" } }),
    } as unknown as Response);
    const res = await pushJournalEntryToQuickBooksFromQueue({ operating_company_id: OC, entity_id: JE });
    expect(res.qboId).toBe("QBO-9");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getTokenMock).toHaveBeenCalledTimes(1);
  });
});

describe("IMPORT-P0 — LAYER 3 masterdata echo guard (accounts pusher only pushes TMS-origin rows)", () => {
  it("the accounts push claim SQL excludes inbound-synced rows (qbo_id IS NULL), so QBO-origin accounts never echo back", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.resolve(here, "../sync/qbo-accounts-push.ts"), "utf8");
    // Both root and child claim queries gate on qbo_id IS NULL: a row that came FROM QBO (qbo_id set) can
    // never be claimed for a TMS→QBO push. Proven, not duplicated (per the block).
    const qboIdNullGuards = (src.match(/qbo_id IS NULL/g) || []).length;
    expect(qboIdNullGuards).toBeGreaterThanOrEqual(2);
    expect(/sync_status IN \('unsynced', 'failed'\)/.test(src)).toBe(true);
  });
});
