/**
 * LEGAL-SEED-01 — per-entity provisioning isolation (real Postgres).
 *
 * Runs only in CI (GITHUB_ACTIONS=true), against a freshly-migrated Postgres, so the provision
 * path executes against the REAL schema (RLS, grants, the operating_company_id FK, the partial
 * unique active-code index). Mirrors the harness in legal-template-library-handoff.db.test.ts.
 *
 * Proves the LEGAL-SEED-01 acceptance criteria:
 *  - provisionLegalTemplateLibraryForCompany() for a FRESH entity yields count>0 active templates
 *    scoped to THAT entity, and 0 for a SECOND, independent entity (full per-entity isolation —
 *    no cross-entity bleed). Two throwaway companies are created so the assertion is deterministic
 *    regardless of parallel test forks or other entities' seed state.
 *  - re-running is idempotent (inserted=0), never duplicating or mutating rows.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { LEGAL_TEMPLATE_LIBRARY } from "../templates/legal-template-library.generated.js";
import { provisionLegalTemplateLibraryForCompany } from "../template-library-provision.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

const LIBRARY_SIZE = LEGAL_TEMPLATE_LIBRARY.length;
const LIBRARY_CODES = LEGAL_TEMPLATE_LIBRARY.map((t) => t.template_code);

describeIntegration("legal template library — per-entity provisioning isolation (real Postgres)", () => {
  let db: pg.Client;
  const actorId = TEST_OWNER_USER_ID; // pre-seeded by ensureIntegrationPrerequisites (FK to identity.users)
  // Two brand-new throwaway entities so the isolation assertion is independent of any other test.
  const entityA = { id: "", code: `LEGALSEED-A-${randomUUID().slice(0, 8)}` };
  const entityB = { id: "", code: `LEGALSEED-B-${randomUUID().slice(0, 8)}` };

  async function withBypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  async function createEntity(entity: { id: string; code: string }): Promise<void> {
    const res = await db.query<{ id: string }>(
      `INSERT INTO org.companies (code, legal_name, company_type, is_active)
       VALUES ($1, $2, 'operating_carrier', true)
       RETURNING id::text AS id`,
      [entity.code, `${entity.code} LLC`]
    );
    entity.id = res.rows[0]!.id;
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    // Create the throwaway companies as the OWNER role (the connection role), BEFORE SET ROLE
    // ih35_app. Inserting into org.companies fires trg_org_companies_safety_settings, which inserts
    // into safety.safety_settings — a table that has only SELECT/UPDATE RLS policies (no INSERT/ALL
    // policy) and is NOT FORCE RLS. ih35_app would be denied that trigger-insert (no permissive
    // INSERT policy), but the table owner bypasses non-forced RLS. org.companies IS force-RLS, so we
    // still set app.bypass_rls='lucia' inside withBypass to satisfy its policy. Provisioning under
    // test then runs as ih35_app (production fidelity).
    await withBypass(async () => {
      await createEntity(entityA);
      await createEntity(entityB);
    });
    await db.query("SET ROLE ih35_app");
  });

  afterAll(async () => {
    if (db) await db.end();
  });

  it("provisions the full library for entity A and leaves entity B at zero (per-entity isolation)", async () => {
    await withBypass(async () => {
      const seed = await provisionLegalTemplateLibraryForCompany(db, {
        operatingCompanyId: entityA.id,
        actorUserId: actorId,
      });
      expect(seed.total).toBe(LIBRARY_SIZE);
      expect(seed.inserted).toBe(LIBRARY_SIZE);

      const aActive = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM legal.contract_templates
         WHERE operating_company_id = $1 AND status = 'active' AND template_code = ANY($2)`,
        [entityA.id, LIBRARY_CODES]
      );
      expect(aActive.rows[0].n).toBe(LIBRARY_SIZE);

      // Entity B was never provisioned — it must have ZERO of these templates (no cross-entity bleed).
      const bAny = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM legal.contract_templates WHERE operating_company_id = $1`,
        [entityB.id]
      );
      expect(bAny.rows[0].n).toBe(0);
    });
  });

  it("is idempotent — a second provision for entity A inserts zero and does not touch entity B", async () => {
    await withBypass(async () => {
      const second = await provisionLegalTemplateLibraryForCompany(db, {
        operatingCompanyId: entityA.id,
        actorUserId: actorId,
      });
      expect(second.inserted).toBe(0);
      expect(second.already_present).toBe(LIBRARY_SIZE);

      const bAny = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM legal.contract_templates WHERE operating_company_id = $1`,
        [entityB.id]
      );
      expect(bAny.rows[0].n).toBe(0);
    });
  });
});
