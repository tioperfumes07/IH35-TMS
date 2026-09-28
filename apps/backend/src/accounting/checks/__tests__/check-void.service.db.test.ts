// Real Postgres proof for check-void.service.ts -- CI-gated (GITHUB_ACTIONS), same disposable
// rehearsal Neon branch as PR 3/5's db tests (br-empty-rice-akqh08we), never prod.
import { describe, it, expect } from "vitest";
import { withLuciaBypass } from "../../../auth/db.js";
import { createCheck } from "../check-create.service.js";
import { voidCheck, reissueCheck, CheckVoidError } from "../check-void.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_BOA_CHECKING = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const REAL_VENDOR_ID = "a94a93d2-37b4-4179-82c3-9e155eb33af7";
// stampDocumentVoided() (void-document-stamp.service.ts) validates voidedByUserId against a real
// identity.users row -- a synthetic uuid is refused. Live-verified 2026-09-25 (bypass_rls,
// tiny-field-89581227): a real, active, non-deactivated user.
const ACTOR_USER_ID = "d62f82f6-b5ce-47a5-bd4e-a97a90cc6775";

function uniqueCheckNumber(): string {
  return `VOID-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function seedCheck(): Promise<string> {
  const result = await createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
    bank_account_id: USMCA_BOA_CHECKING,
    payee_kind: "vendor",
    payee_id: REAL_VENDOR_ID,
    check_date: "2026-09-25",
    print_later: false,
    check_number: uniqueCheckNumber(),
    lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 999 }],
  });
  return result.id;
}

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("check-void.service (real Postgres, rehearsal branch only)", () => {
  it(
    // ROUND 144 fix: this used to hardcode "nothing was posted" -- true only while
    // EXPENSE_GL_POSTING_ENABLED was off for USMCA. AGENTS.md H1 (owner law) has that flag ON for
    // all 3 entities, so createCheck() posts this check for real; voiding it correctly produces a
    // real reversal JE. The honest assertion is "the reversal JE exists iff the check was actually
    // posted" -- never a hardcoded assumption about the flag's current value.
    "voids a check: reversal JE exists iff it was actually posted, status flips to void, registry flips to voided",
    async () => {
      const checkId = await seedCheck();

      const beforeVoid = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT posting_status, journal_entry_id::text FROM accounting.expenses WHERE id = $1::uuid`, [checkId]);
        return res.rows[0] as { posting_status: string; journal_entry_id: string | null };
      });

      const result = await voidCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, checkId, "test void -- rehearsal");
      if (beforeVoid.posting_status === "posted") {
        expect(result.reversal_journal_entry_id).not.toBeNull();
        expect(result.reversal_journal_entry_id).not.toBe(beforeVoid.journal_entry_id); // a NEW reversing JE, not the original
      } else {
        expect(result.reversal_journal_entry_id).toBeNull();
      }

      const row = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT status, memo, voided_at, void_reason FROM accounting.expenses WHERE id = $1::uuid`, [checkId]);
        return res.rows[0] as { status: string; memo: string; voided_at: string | null; void_reason: string };
      });
      expect(row.status).toBe("void");
      expect(row.voided_at).not.toBeNull();
      expect(row.memo.startsWith("VOID:")).toBe(true);
      expect(row.void_reason).toBe("test void -- rehearsal");

      const registryStatus = await withLuciaBypass(async (client) => {
        const res = await client.query(
          `SELECT status FROM banking.check_number_registry WHERE operating_company_id = $1::uuid AND source_kind = 'check' AND source_id = $2::uuid`,
          [USMCA_COMPANY_ID, checkId]
        );
        return res.rows[0]?.status as string | undefined;
      });
      expect(registryStatus).toBe("voided");
    },
    30_000
  );

  it(
    "refuses to void an already-void check with CHECK_ALREADY_VOID",
    async () => {
      const checkId = await seedCheck();
      await voidCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, checkId, "first void");
      await expect(voidCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, checkId, "second void")).rejects.toMatchObject({
        code: "CHECK_ALREADY_VOID",
      });
    },
    30_000
  );

  it(
    "reissue voids the original and creates a genuinely new check id + number",
    async () => {
      const originalId = await seedCheck();
      const result = await reissueCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, originalId, "printer jam, reissuing", {
        operating_company_id: USMCA_COMPANY_ID,
        bank_account_id: USMCA_BOA_CHECKING,
        payee_kind: "vendor",
        payee_id: REAL_VENDOR_ID,
        check_date: "2026-09-25",
        print_later: false,
        check_number: uniqueCheckNumber(),
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 999 }],
      });
      expect(result.reissued.id).not.toBe(originalId);
      // ROUND 144 fix (same as the sibling void test above): a reversal JE exists iff the
      // original was actually posted -- H1 posting flags are ON for USMCA, so it was.
      expect(result.voided.reversal_journal_entry_id).not.toBeNull();

      const originalStatus = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT status FROM accounting.expenses WHERE id = $1::uuid`, [originalId]);
        return res.rows[0]?.status as string;
      });
      expect(originalStatus).toBe("void");
    },
    30_000
  );

  it(
    "reissue without explicit lines refuses REISSUE_LINES_REQUIRED rather than guessing a category",
    async () => {
      const originalId = await seedCheck();
      await expect(
        reissueCheck(
          USMCA_COMPANY_ID,
          ACTOR_USER_ID,
          originalId,
          "reissue, no lines given",
          {
            operating_company_id: USMCA_COMPANY_ID,
            bank_account_id: USMCA_BOA_CHECKING,
            payee_kind: "vendor",
            payee_id: REAL_VENDOR_ID,
            check_date: "2026-09-25",
            print_later: true,
          } as never
        )
      ).rejects.toBeInstanceOf(CheckVoidError);
    },
    30_000
  );
});
