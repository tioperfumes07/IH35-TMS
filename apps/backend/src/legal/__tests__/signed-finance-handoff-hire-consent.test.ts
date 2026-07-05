/**
 * Deduction-consent gate — the signed HIRE CONTRACT authorizes payroll/settlement deductions
 * (owner-LOCKED 2026-07-04/05: no separate driver e-sign; the hire contract carries the
 * authorization). Portable unit test (fake pg client, no Postgres) proving the gate + the
 * finance handoff. Complements the CI-only real-schema test in legal-template-library-handoff.db.test.ts.
 *
 * Acceptance:
 *  - driver WITH a signed hire contract -> gate TRUE (deductions may post)
 *  - driver with NO signed contract    -> gate FALSE (fail-closed; still blocked)
 *  - driver with only a signed NDA      -> gate FALSE (an NDA must never authorize deductions)
 *  - legacy standalone deduction-auth   -> gate TRUE (backward compatible)
 *  - signed hire contract handoff writes the driver->deduction_schedule link (both directions)
 */

import { describe, expect, it } from "vitest";
import {
  applySignedFinanceHandoff,
  hasSignedDeductionAuthorization,
} from "../signed-finance-handoff.service.js";

type Row = Record<string, unknown>;
type Captured = { sql: string; values?: unknown[] };

// Minimal fake pg client. `signedDriverContracts` are the rows the gate query would return
// (already filtered by the SQL to signed_electronically + not voided + this driver).
// `instance` is the row loadHandoffInstance would read. All INSERTs are captured, not executed.
function fakeClient(opts: {
  signedDriverContracts?: Array<{ template_code: string }>;
  instance?: Row | null;
}) {
  const captured: Captured[] = [];
  const client = {
    captured,
    async query(sql: string, values?: unknown[]) {
      // Gate read.
      if (sql.includes("SELECT ci.template_code")) {
        return { rows: (opts.signedDriverContracts ?? []) as Row[] };
      }
      // Instance load for the handoff.
      if (sql.includes("SELECT id, template_code") && sql.includes("legal.contract_instances")) {
        return { rows: opts.instance ? [opts.instance] : [] };
      }
      // Link/audit/event writes — capture only.
      captured.push({ sql, values });
      if (sql.includes("INSERT INTO legal.contract_instance_links")) {
        return { rows: [{ id: "link-1" }] };
      }
      return { rows: [] };
    },
  };
  return client;
}

const OPCO = "11111111-1111-1111-1111-111111111111";
const DRIVER = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";

describe("hasSignedDeductionAuthorization — hire contract satisfies consent", () => {
  it("driver WITH a signed hire contract -> gate TRUE", async () => {
    const client = fakeClient({ signedDriverContracts: [{ template_code: "driver_hire_contract" }] });
    const ok = await hasSignedDeductionAuthorization(client as never, {
      operatingCompanyId: OPCO,
      driverId: DRIVER,
    });
    expect(ok).toBe(true);
  });

  it("driver with a `driver_hire_*` convention code -> gate TRUE (prefix honored)", async () => {
    const client = fakeClient({ signedDriverContracts: [{ template_code: "driver_hire_2026_bilingual" }] });
    const ok = await hasSignedDeductionAuthorization(client as never, {
      operatingCompanyId: OPCO,
      driverId: DRIVER,
    });
    expect(ok).toBe(true);
  });

  it("driver with NO signed contract -> gate FALSE (fail-closed, still blocked)", async () => {
    const client = fakeClient({ signedDriverContracts: [] });
    const ok = await hasSignedDeductionAuthorization(client as never, {
      operatingCompanyId: OPCO,
      driverId: DRIVER,
    });
    expect(ok).toBe(false);
  });

  it("driver with ONLY a signed NDA -> gate FALSE (NDA must not authorize deductions)", async () => {
    const client = fakeClient({ signedDriverContracts: [{ template_code: "nda_ebt_confidentiality" }] });
    const ok = await hasSignedDeductionAuthorization(client as never, {
      operatingCompanyId: OPCO,
      driverId: DRIVER,
    });
    expect(ok).toBe(false);
  });

  it("legacy standalone deduction-auth instance -> gate TRUE (backward compatible)", async () => {
    const client = fakeClient({ signedDriverContracts: [{ template_code: "driver_deduction_auth" }] });
    const ok = await hasSignedDeductionAuthorization(client as never, {
      operatingCompanyId: OPCO,
      driverId: DRIVER,
    });
    expect(ok).toBe(true);
  });
});

describe("applySignedFinanceHandoff — signed hire contract wires the deduction authorization", () => {
  it("writes the driver->deduction_schedule link + via_hire_contract audit", async () => {
    const client = fakeClient({
      instance: {
        id: "inst-1",
        template_code: "driver_hire_contract",
        signer_type: "driver",
        signer_entity_id: DRIVER,
        filled_variables: {},
        created_by_user_id: ACTOR,
      },
    });
    const res = await applySignedFinanceHandoff(client as never, {
      operatingCompanyId: OPCO,
      contractInstanceId: "inst-1",
      actorUserId: ACTOR,
    });
    expect(res.handoff).toBe("deduction_schedule");

    const link = client.captured.find((c) => c.sql.includes("INSERT INTO legal.contract_instance_links"));
    expect(link).toBeTruthy();
    // link_type='deduction_schedule', target = the driver (both-direction wiring).
    expect(link?.values).toContain("deduction_schedule");
    expect(link?.values).toContain(DRIVER);

    const audit = client.captured.find(
      (c) => c.sql.includes("legal.contract_audit_log") && String(c.values?.[3]) === "contract_deduction_consent_recorded"
    );
    expect(audit).toBeTruthy();
    expect(String(audit?.values?.[4])).toContain("\"via_hire_contract\":true");
  });
});
