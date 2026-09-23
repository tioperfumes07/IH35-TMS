import { describe, expect, it, vi } from "vitest";
import { stampDocumentVoided, VoidDocumentStampError, type QueryableClient } from "../void-document-stamp.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DOC_ID = "11111111-1111-1111-1111-111111111111";

/**
 * A minimal fake QueryableClient that answers the three queries stampDocumentVoided() always
 * runs, in order: the identity.users actor check, the SELECT ... FOR UPDATE existing-row check,
 * then the UPDATE. Captures every UPDATE's SQL + params so tests can assert the EXACT status
 * value written per family -- this is the shape of test that would have caught ROUND 122's bug
 * (every family writing the literal 'voided' regardless of what its own CHECK constraint allows).
 */
function makeFakeClient(opts: { existingVoidedAt?: string | null; existingVoidReason?: string | null; existingVoidedBy?: string | null } = {}) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client: QueryableClient = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("FROM identity.users")) {
        return { rows: [{ id: ACTOR }] };
      }
      if (sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: DOC_ID,
              operating_company_id: OPCO,
              voided_at: opts.existingVoidedAt ?? null,
              void_reason: opts.existingVoidReason ?? null,
              voided_by_user_id: opts.existingVoidedBy ?? null,
            },
          ],
        };
      }
      if (sql.trim().startsWith("UPDATE")) {
        return { rows: [{ voided_at: "2026-09-23T00:00:00.000Z" }] };
      }
      throw new Error(`unexpected query in fake client: ${sql}`);
    }) as QueryableClient["query"],
  };
  return { client, calls };
}

function lastUpdateCall(calls: Array<{ sql: string; values?: unknown[] }>) {
  const update = [...calls].reverse().find((c) => c.sql.trim().startsWith("UPDATE"));
  if (!update) throw new Error("no UPDATE call captured");
  return update;
}

describe("stampDocumentVoided — ROUND 122 P0: per-family status value, never one shared literal", () => {
  // Each of these six status-column families' UPDATE must write the EXACT value that family's
  // own live CHECK constraint / enum accepts -- verified against production, 2026-09-23 15:25Z
  // (see void-document-stamp.service.ts's own FamilyTableSpec comment for the constraint names).
  const casesThatFlipStatus: Array<{ family: Parameters<typeof stampDocumentVoided>[1]["family"]; expectedStatus: string }> = [
    { family: "invoice", expectedStatus: "void" },
    { family: "expense", expectedStatus: "void" },
    { family: "driver_reimbursement", expectedStatus: "void" },
    { family: "factoring_advance", expectedStatus: "voided" },
    { family: "load", expectedStatus: "voided" },
  ];

  for (const { family, expectedStatus } of casesThatFlipStatus) {
    it(`${family} -> writes status='${expectedStatus}' in the SAME UPDATE as voided_at/void_reason/voided_by_user_id`, async () => {
      const { client, calls } = makeFakeClient();
      const result = await stampDocumentVoided(client, {
        operatingCompanyId: OPCO,
        family,
        documentId: DOC_ID,
        voidReason: "test reason",
        voidedByUserId: ACTOR,
      });
      expect(result.status_flip_applied).toBe(true);
      const update = lastUpdateCall(calls);
      expect(update.sql).toContain("voided_at = $2");
      expect(update.sql).toContain("void_reason = $3");
      expect(update.sql).toContain("voided_by_user_id = $4::uuid");
      expect(update.sql).toMatch(/status = \$\d+/);
      // The status value must be a bound PARAMETER (never a literal baked into the SQL string) --
      // this is what makes the value correctly per-family instead of copy-pasted.
      expect(update.sql).not.toContain(`status = '${expectedStatus}'`);
      expect(update.values).toContain(expectedStatus);
      // Never the OTHER family's spelling landing on the wrong table.
      const otherSpelling = expectedStatus === "void" ? "voided" : "void";
      expect(update.values).not.toContain(otherSpelling);
    });
  }

  it("journal_entry -> status is NEVER flipped, even though journal_entries_status_check allows 'voided' (the documented GL-total-reader exception)", async () => {
    const { client, calls } = makeFakeClient();
    const result = await stampDocumentVoided(client, {
      operatingCompanyId: OPCO,
      family: "journal_entry",
      documentId: DOC_ID,
      voidReason: "test reason",
      voidedByUserId: ACTOR,
    });
    expect(result.status_flip_applied).toBe(false);
    const update = lastUpdateCall(calls);
    expect(update.sql).not.toMatch(/status\s*=/);
  });

  it("fuel_transaction -> status is never flipped (no status column exists on fuel.fuel_transactions at all)", async () => {
    const { client, calls } = makeFakeClient();
    const result = await stampDocumentVoided(client, {
      operatingCompanyId: OPCO,
      family: "fuel_transaction",
      documentId: DOC_ID,
      voidReason: "test reason",
      voidedByUserId: ACTOR,
    });
    expect(result.status_flip_applied).toBe(false);
    const update = lastUpdateCall(calls);
    expect(update.sql).not.toMatch(/status\s*=/);
  });

  it("idempotent: an identical (document, reason, actor) returns already_voided:true, never re-writes", async () => {
    const { client, calls } = makeFakeClient({
      existingVoidedAt: "2026-09-20T00:00:00.000Z",
      existingVoidReason: "test reason",
      existingVoidedBy: ACTOR,
    });
    const result = await stampDocumentVoided(client, {
      operatingCompanyId: OPCO,
      family: "invoice",
      documentId: DOC_ID,
      voidReason: "test reason",
      voidedByUserId: ACTOR,
    });
    expect(result.already_voided).toBe(true);
    expect(calls.some((c) => c.sql.trim().startsWith("UPDATE"))).toBe(false);
  });

  it("refuses a different reason on an already-voided document, never silently overwrites", async () => {
    const { client } = makeFakeClient({
      existingVoidedAt: "2026-09-20T00:00:00.000Z",
      existingVoidReason: "original reason",
      existingVoidedBy: ACTOR,
    });
    await expect(
      stampDocumentVoided(client, {
        operatingCompanyId: OPCO,
        family: "invoice",
        documentId: DOC_ID,
        voidReason: "a different reason",
        voidedByUserId: ACTOR,
      })
    ).rejects.toMatchObject({ code: "already_voided_different_reason" });
  });

  it("refuses a voidedByUserId that is not a real identity.users row", async () => {
    const client: QueryableClient = {
      query: vi.fn(async () => ({ rows: [] })) as QueryableClient["query"],
    };
    await expect(
      stampDocumentVoided(client, {
        operatingCompanyId: OPCO,
        family: "invoice",
        documentId: DOC_ID,
        voidReason: "test reason",
        voidedByUserId: "99999999-9999-9999-9999-999999999999",
      })
    ).rejects.toBeInstanceOf(VoidDocumentStampError);
  });

  it("refuses an empty/whitespace void_reason", async () => {
    const { client } = makeFakeClient();
    await expect(
      stampDocumentVoided(client, {
        operatingCompanyId: OPCO,
        family: "invoice",
        documentId: DOC_ID,
        voidReason: "   ",
        voidedByUserId: ACTOR,
      })
    ).rejects.toMatchObject({ code: "void_reason_required" });
  });

  it("refuses a family not in VOID_DOCUMENT_FAMILIES", async () => {
    const { client } = makeFakeClient();
    await expect(
      stampDocumentVoided(client, {
        operatingCompanyId: OPCO,
        // @ts-expect-error -- deliberately invalid family for the refusal test
        family: "settlement",
        documentId: DOC_ID,
        voidReason: "test reason",
        voidedByUserId: ACTOR,
      })
    ).rejects.toMatchObject({ code: "invalid_void_family" });
  });
});
