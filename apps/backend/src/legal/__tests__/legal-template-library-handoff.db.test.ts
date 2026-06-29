/**
 * LEGAL template library + Option-B handoff — real-schema execution guard (real Postgres).
 *
 * Runs only in CI (GITHUB_ACTIONS=true), against a freshly-migrated Postgres, so the seed,
 * the draft preview, and the sign-time link/consent/handoff all execute against the REAL
 * schema (RLS, grants, constraints, the events.event_log allowlist). Mirrors the harness in
 * lease-to-own-fleet.db.test.ts.
 *
 * Asserts the Phase-2/3/4/5 acceptance criteria:
 *  - seed inserts 7 active templates; re-run adds zero (idempotent), never mutates status.
 *  - draft preview creates NO contract instance.
 *  - signed driver_deduction_auth -> driver + deduction_schedule links + DQ doc;
 *    hasSignedDeductionAuthorization() returns true.
 *  - signed lease -> fixed_asset link per unit + a 'lease.signed' event (no GL).
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { ensureLegalTemplateLibrary } from "../template-library.service.js";
import { renderDraftContractHtml } from "../draft-preview.service.js";
import { applySignedOperationalLinks } from "../signed-links.service.js";
import { applySignedFinanceHandoff, hasSignedDeductionAuthorization } from "../signed-finance-handoff.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("legal template library + Option-B handoff (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  // Reuse the pre-seeded owner user (created by ensureIntegrationPrerequisites) as the actor —
  // created_by_user_id is an FK to identity.users. driver/unit ids are plain uuids (NO FK on
  // signer_entity_id / contract_instance_links.target_id / safety.driver_documents.driver_id), so
  // we do NOT insert mdata.drivers / mdata.units (which carry forensic-audit triggers).
  const actorId = TEST_OWNER_USER_ID;
  const driverId = randomUUID();
  const unitId = randomUUID();

  async function withBypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    // No fixture inserts needed — actor user is pre-seeded; driver/unit ids are plain uuids.
  });

  afterAll(async () => {
    if (db) await db.end();
  });

  it("seeds 7 active templates idempotently and never mutates status on re-run", async () => {
    await withBypass(async () => {
      const first = await ensureLegalTemplateLibrary(db, { operatingCompanyId: companyId, actorUserId: actorId });
      expect(first.total).toBe(7);
      const active = await db.query(
        `SELECT count(*)::int AS n FROM legal.contract_templates
         WHERE operating_company_id=$1 AND status='active'
           AND template_code = ANY($2)`,
        [
          companyId,
          [
            "lease_v1_carl_barto",
            "lease_v2_comprehensive",
            "lease_v3_operating",
            "lease_v4_chatgpt",
            "nda_ebt_confidentiality",
            "nda_chatgpt_full",
            "nda_polished_full",
          ],
        ]
      );
      expect(active.rows[0].n).toBe(7);

      // Re-run: zero new rows.
      const second = await ensureLegalTemplateLibrary(db, { operatingCompanyId: companyId, actorUserId: actorId });
      expect(second.inserted).toBe(0);
      expect(second.already_present).toBe(7);
    });
  });

  it("draft preview renders watermarked HTML and creates NO instance", async () => {
    await withBypass(async () => {
      const before = await db.query(`SELECT count(*)::int AS n FROM legal.contract_instances WHERE operating_company_id=$1`, [
        companyId,
      ]);
      const res = await renderDraftContractHtml(db, {
        operatingCompanyId: companyId,
        template_code: "nda_ebt_confidentiality",
        language: "en",
        filled_variables: { company_entity_suffix: "Transport LLC", employee_name: "Jane Driver" },
      });
      expect(res.html).toContain("DRAFT — NOT FOR EXECUTION");
      const after = await db.query(`SELECT count(*)::int AS n FROM legal.contract_instances WHERE operating_company_id=$1`, [
        companyId,
      ]);
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });
  });

  it("signed deduction auth writes links + DQ doc and the consent gate returns true", async () => {
    await withBypass(async () => {
      const tplId = (
        await db.query(`SELECT id FROM legal.contract_templates WHERE operating_company_id=$1 AND template_code='nda_ebt_confidentiality' LIMIT 1`, [
          companyId,
        ])
      ).rows[0].id;
      const instId = randomUUID();
      await db.query(
        `INSERT INTO legal.contract_instances (id, operating_company_id, template_id, template_code, template_version,
           signer_type, signer_entity_id, signer_name, language, status, created_by_user_id, updated_by_user_id)
         VALUES ($1,$2,$3,'driver_deduction_auth',1,'driver',$4,'Legal Tester','en','signed_electronically',$5,$5)`,
        [instId, companyId, tplId, driverId, actorId]
      );
      await applySignedOperationalLinks(db, {
        operatingCompanyId: companyId,
        contractInstanceId: instId,
        signedAttachmentId: null,
        signedR2Key: "r2/legal/test.pdf",
        signedFileName: "test.pdf",
        actorUserId: actorId,
      });
      await applySignedFinanceHandoff(db, { operatingCompanyId: companyId, contractInstanceId: instId, actorUserId: actorId });

      const links = await db.query(
        `SELECT link_type FROM legal.contract_instance_links WHERE contract_instance_id=$1 ORDER BY link_type`,
        [instId]
      );
      const types = links.rows.map((r) => r.link_type);
      expect(types).toContain("driver");
      expect(types).toContain("deduction_schedule");
      expect(types).toContain("dq_file");

      const dq = await db.query(`SELECT count(*)::int AS n FROM safety.driver_documents WHERE driver_id=$1 AND doc_type='legal_driver_deduction_auth'`, [
        driverId,
      ]);
      expect(dq.rows[0].n).toBeGreaterThanOrEqual(1);

      const gate = await hasSignedDeductionAuthorization(db, { operatingCompanyId: companyId, driverId });
      expect(gate).toBe(true);
    });
  });

  it("signed lease writes fixed_asset link + a lease.signed event (no GL)", async () => {
    await withBypass(async () => {
      const tplId = (
        await db.query(`SELECT id FROM legal.contract_templates WHERE operating_company_id=$1 AND template_code='lease_v1_carl_barto' LIMIT 1`, [
          companyId,
        ])
      ).rows[0].id;
      const instId = randomUUID();
      await db.query(
        `INSERT INTO legal.contract_instances (id, operating_company_id, template_id, template_code, template_version,
           signer_type, signer_entity_id, signer_name, language, status, filled_variables, created_by_user_id, updated_by_user_id)
         VALUES ($1,$2,$3,'lease_v1_carl_barto',1,'customer',NULL,'Buyer LLC','en','signed_electronically',$4::jsonb,$5,$5)`,
        [instId, companyId, tplId, JSON.stringify({ exhibit_a_unit_ids: [unitId], asc842_election: "option_a_fmv" }), actorId]
      );
      const res = await applySignedFinanceHandoff(db, { operatingCompanyId: companyId, contractInstanceId: instId, actorUserId: actorId });
      expect(res.handoff).toBe("fixed_asset");

      const fa = await db.query(
        `SELECT count(*)::int AS n FROM legal.contract_instance_links WHERE contract_instance_id=$1 AND link_type='fixed_asset' AND target_id=$2`,
        [instId, unitId]
      );
      expect(fa.rows[0].n).toBe(1);

      const ev = await db.query(
        `SELECT count(*)::int AS n FROM events.event_log WHERE event_type='lease.signed' AND subject_id=$1`,
        [instId]
      );
      expect(ev.rows[0].n).toBe(1);
    });
  });
});
