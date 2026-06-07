import { describe, expect, it, vi } from "vitest";
import {
  appendDamage,
  closeChain,
  getChain,
  startChain,
} from "../continuity.service.js";
import {
  AUTO_CLAIM_THRESHOLD_CENTS,
  autoCreateClaimFromDamage,
  linkClaimToChain,
} from "../insurance-link.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DAMAGE_ID = "22222222-2222-4222-8222-222222222222";
const CHAIN_ID = "33333333-3333-4333-8333-333333333333";
const CLAIM_ID = "44444444-4444-4444-8444-444444444444";
const POLICY_ID = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

/**
 * Builds a mocked tenant-scoped client. `handlers` is an ordered list of
 * [matcher, rows] tuples; the first matcher whose substring/regex matches the
 * SQL wins. This mirrors the repository's existing mocked-DB test style.
 */
function mockClient(handlers: Array<[string | RegExp, Row[]]>) {
  const query = vi.fn(async (sql: string) => {
    for (const [matcher, rows] of handlers) {
      const matched =
        matcher instanceof RegExp ? matcher.test(sql) : sql.includes(matcher);
      if (matched) return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  return { client: { query }, query };
}

describe("damage continuity service (GAP-38)", () => {
  it("startChain creates a chain and links the initial damage", async () => {
    const { client, query } = mockClient([
      ["SELECT id::text, continuity_chain_id::text, damage_amount_cents", [
        { id: DAMAGE_ID, continuity_chain_id: null, damage_amount_cents: 250000 },
      ]],
      ["INSERT INTO safety.damage_continuity_chains", [
        { uuid: CHAIN_ID, operating_company_id: COMPANY, initial_damage_id: DAMAGE_ID },
      ]],
      ["UPDATE safety.incidents", []],
    ]);

    const result = await startChain(client, {
      operatingCompanyId: COMPANY,
      initialDamageId: DAMAGE_ID,
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.chain.uuid).toBe(CHAIN_ID);
    // RLS: the damage lookup is tenant-scoped via app.operating_company_id.
    const damageLookup = query.mock.calls.find((c) =>
      String(c[0]).includes("FROM safety.incidents")
    );
    expect(String(damageLookup?.[0])).toContain("current_setting('app.operating_company_id', true)");
  });

  it("startChain returns damage_not_found when the incident is missing", async () => {
    const { client } = mockClient([
      ["SELECT id::text, continuity_chain_id::text, damage_amount_cents", []],
    ]);
    const result = await startChain(client, {
      operatingCompanyId: COMPANY,
      initialDamageId: DAMAGE_ID,
    });
    expect(result.kind).toBe("damage_not_found");
  });

  it("startChain refuses to re-open a chain for an already-chained damage", async () => {
    const { client } = mockClient([
      ["SELECT id::text, continuity_chain_id::text, damage_amount_cents", [
        { id: DAMAGE_ID, continuity_chain_id: CHAIN_ID, damage_amount_cents: 250000 },
      ]],
    ]);
    const result = await startChain(client, {
      operatingCompanyId: COMPANY,
      initialDamageId: DAMAGE_ID,
    });
    expect(result.kind).toBe("already_in_chain");
  });

  it("appendDamage attaches a related damage and recomputes totals", async () => {
    const { client } = mockClient([
      ["FROM safety.damage_continuity_chains", [
        { uuid: CHAIN_ID, initial_damage_id: DAMAGE_ID },
      ]],
      ["SELECT id::text, continuity_chain_id::text\n", [
        { id: "99999999-9999-4999-8999-999999999999", continuity_chain_id: null },
      ]],
      ["UPDATE safety.damage_continuity_chains", [
        { uuid: CHAIN_ID, total_estimated_cost_cents: 500000 },
      ]],
    ]);
    const result = await appendDamage(client, {
      operatingCompanyId: COMPANY,
      chainId: CHAIN_ID,
      relatedDamageId: "99999999-9999-4999-8999-999999999999",
    });
    expect(result.kind).toBe("ok");
  });

  it("closeChain stamps resolution status onto the chain and its damages", async () => {
    const { client, query } = mockClient([
      ["UPDATE safety.damage_continuity_chains", [
        { uuid: CHAIN_ID, final_resolution_status: "self_paid" },
      ]],
      ["UPDATE safety.incidents", []],
    ]);
    const result = await closeChain(client, {
      operatingCompanyId: COMPANY,
      chainId: CHAIN_ID,
      finalResolutionStatus: "self_paid",
      totalActualCostCents: 123456,
    });
    expect(result.kind).toBe("ok");
    const incidentUpdate = query.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE safety.incidents")
    );
    expect(incidentUpdate).toBeDefined();
  });

  it("getChain returns the chain, damages and linked claim", async () => {
    const { client } = mockClient([
      ["FROM safety.damage_continuity_chains", [
        { uuid: CHAIN_ID, insurance_claim_id: CLAIM_ID },
      ]],
      ["FROM safety.incidents", [
        { id: DAMAGE_ID, incident_type: "damage_report", damage_amount_cents: 250000 },
      ]],
      ["FROM insurance.claim", [
        { id: CLAIM_ID, claim_number: "AUTO-XYZ", status: "open" },
      ]],
    ]);
    const result = await getChain(client, { operatingCompanyId: COMPANY, chainId: CHAIN_ID });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.damages).toHaveLength(1);
      expect(result.claim?.id).toBe(CLAIM_ID);
    }
  });
});

describe("insurance auto-claim linkage (GAP-38 / WF-027)", () => {
  it("does not create a claim below the $1000 threshold", async () => {
    const { client } = mockClient([
      ["FROM safety.incidents", [
        {
          id: DAMAGE_ID,
          damage_amount_cents: AUTO_CLAIM_THRESHOLD_CENTS, // exactly at threshold -> not above
          incident_at: "2026-01-01T00:00:00.000Z",
          auto_created_claim_id: null,
        },
      ]],
    ]);
    const result = await autoCreateClaimFromDamage(client, {
      operatingCompanyId: COMPANY,
      damageIncidentId: DAMAGE_ID,
    });
    expect(result.kind).toBe("below_threshold");
  });

  it("creates a draft claim when above threshold and an active policy exists", async () => {
    const { client, query } = mockClient([
      ["FROM safety.incidents\n", [
        {
          id: DAMAGE_ID,
          damage_amount_cents: 500000,
          incident_at: "2026-01-01T00:00:00.000Z",
          auto_created_claim_id: null,
        },
      ]],
      ["FROM insurance.policy", [{ id: POLICY_ID }]],
      ["INSERT INTO insurance.claim", [
        {
          id: CLAIM_ID,
          claim_number: "AUTO-22222222-20260101",
          policy_id: POLICY_ID,
          status: "open",
          amount_claimed_cents: 500000,
        },
      ]],
      ["UPDATE safety.incidents", []],
    ]);
    const result = await autoCreateClaimFromDamage(client, {
      operatingCompanyId: COMPANY,
      damageIncidentId: DAMAGE_ID,
    });
    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.claim.amount_claimed_cents).toBe(500000);
    }
    // The damage incident is back-linked to the auto-created claim.
    const backlink = query.mock.calls.find((c) =>
      String(c[0]).includes("SET auto_created_claim_id")
    );
    expect(backlink).toBeDefined();
  });

  it("skips creation (no false positives) when the tenant has no active policy", async () => {
    const { client } = mockClient([
      ["FROM safety.incidents", [
        {
          id: DAMAGE_ID,
          damage_amount_cents: 500000,
          incident_at: "2026-01-01T00:00:00.000Z",
          auto_created_claim_id: null,
        },
      ]],
      ["FROM insurance.policy", []],
    ]);
    const result = await autoCreateClaimFromDamage(client, {
      operatingCompanyId: COMPANY,
      damageIncidentId: DAMAGE_ID,
    });
    expect(result.kind).toBe("no_active_policy");
  });

  it("is idempotent when a claim is already linked", async () => {
    const { client } = mockClient([
      ["FROM safety.incidents", [
        {
          id: DAMAGE_ID,
          damage_amount_cents: 500000,
          incident_at: "2026-01-01T00:00:00.000Z",
          auto_created_claim_id: CLAIM_ID,
        },
      ]],
    ]);
    const result = await autoCreateClaimFromDamage(client, {
      operatingCompanyId: COMPANY,
      damageIncidentId: DAMAGE_ID,
    });
    expect(result.kind).toBe("already_linked");
  });

  it("linkClaimToChain updates the chain", async () => {
    const { client } = mockClient([
      ["UPDATE safety.damage_continuity_chains", [{ uuid: CHAIN_ID }]],
    ]);
    const result = await linkClaimToChain(client, {
      operatingCompanyId: COMPANY,
      chainId: CHAIN_ID,
      claimId: CLAIM_ID,
    });
    expect(result.kind).toBe("ok");
  });
});
