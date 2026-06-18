import { describe, expect, it, vi } from "vitest";
import { reassignDraftAttachments } from "./attachments.service.js";

function makeClient(updateRowCount = 2) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (/UPDATE documents\.attachments/.test(sql)) return { rows: [], rowCount: updateRowCount };
    return { rows: [], rowCount: 0 };
  });
  return { client: { query }, calls };
}

const OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const DRAFT = "11111111-1111-1111-1111-111111111111";
const REAL = "22222222-2222-2222-2222-222222222222";

describe("reassignDraftAttachments (Option B)", () => {
  it("re-keys draft attachments onto the real record id within the caller's client", async () => {
    const { client, calls } = makeClient(3);
    const moved = await reassignDraftAttachments(client, {
      operatingCompanyId: OCI,
      entityType: "expense",
      draftId: DRAFT,
      newId: REAL,
    });
    expect(moved).toBe(3);
    // Company scope set first (per-entity RLS), then the scoped UPDATE.
    expect(calls[0]?.sql).toMatch(/set_config\('app.operating_company_id'/);
    const update = calls.find((c) => /UPDATE documents\.attachments/.test(c.sql));
    expect(update).toBeTruthy();
    // Scoped by operating_company_id + entity_type + draft entity_id; targets the new id.
    expect(update?.sql).toMatch(/operating_company_id = \$1/);
    expect(update?.sql).toMatch(/entity_type = \$2/);
    expect(update?.sql).toMatch(/entity_id = \$3/);
    expect(update?.sql).toMatch(/SET entity_id = \$4/);
    expect(update?.values).toEqual([OCI, "expense", DRAFT, REAL]);
  });

  it("is a no-op when no draft id is supplied", async () => {
    const { client, calls } = makeClient();
    expect(await reassignDraftAttachments(client, { operatingCompanyId: OCI, entityType: "expense", draftId: null, newId: REAL })).toBe(0);
    expect(await reassignDraftAttachments(client, { operatingCompanyId: OCI, entityType: "expense", draftId: undefined, newId: REAL })).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("is a no-op when the draft id already equals the record id", async () => {
    const { client, calls } = makeClient();
    expect(await reassignDraftAttachments(client, { operatingCompanyId: OCI, entityType: "expense", draftId: REAL, newId: REAL })).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("rejects entity types that don't use the create-time draft pattern", async () => {
    const { client } = makeClient();
    await expect(
      reassignDraftAttachments(client, { operatingCompanyId: OCI, entityType: "load", draftId: DRAFT, newId: REAL })
    ).rejects.toThrow("unsupported_reconcile_entity_type");
  });
});
