import { describe, it, expect } from "vitest";
import {
  AccountMergeError,
  CONFIG_REMOUNT_TARGETS,
  HISTORY_POINTERS_NEVER_MOVED,
  assertMergeCompatible,
  assertMergeReason,
  mergeAccountsOnClient,
  type MergeClient,
} from "./account-merge.service.js";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "22222222-2222-4222-8222-222222222222";
const COMPANY_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const REASON = "Consolidating the duplicate fuel expense accounts from the 2024 import";

type Recorded = { sql: string; values: unknown[] };

/**
 * Minimal fake pg client. It answers the shapes the service asks for and records every statement so
 * the test can assert WHAT the merge did — the point of ACCT-R-03 is that "it archived the row" is
 * not a merge.
 */
function makeClient(overrides: { sourceType?: string; sourceLocked?: boolean } = {}) {
  const statements: Recorded[] = [];
  const client: MergeClient = {
    async query(sql: string, values: unknown[] = []) {
      statements.push({ sql, values });

      if (sql.includes("to_regclass")) {
        // KR-03 fail-closed probe — table present in these unit tests.
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("information_schema.columns")) {
        // Pretend every declared config pointer exists on this database.
        return { rows: [{ exists: 1 }] };
      }
      if (sql.includes("FROM catalogs.accounts WHERE id = $1")) {
        const id = values[0];
        if (id === TARGET_ID) {
          return {
            rows: [
              {
                id: TARGET_ID,
                account_number: "5210",
                account_name: "Fuel Expense",
                account_type: "Expense",
                currency_code: "USD",
                is_locked: false,
                deactivated_at: null,
              },
            ],
          };
        }
        return {
          rows: [
            {
              id: SOURCE_ID,
              account_number: "5211",
              account_name: "Fuel Expense - Old",
              account_type: overrides.sourceType ?? "Expense",
              currency_code: "USD",
              is_locked: overrides.sourceLocked ?? false,
              deactivated_at: null,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO catalogs.account_merge_records")) {
        return { rows: [{ id: "55555555-5555-4555-8555-555555555555", merged_at: "2026-07-25T00:00:00Z" }] };
      }
      if (sql.includes("UPDATE catalogs.accounts") && sql.includes("deactivated_at = COALESCE")) {
        return { rows: [{ deactivated_at: "2026-07-25T00:00:00Z" }] };
      }
      if (sql.trim().startsWith("UPDATE")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    },
  };
  return { client, statements };
}

const input = {
  targetAccountId: TARGET_ID,
  sourceAccountIds: [SOURCE_ID],
  operatingCompanyId: COMPANY_ID,
  reason: REASON,
};

describe("ACCT-R-03 — catalogs account merge is a real merge, not a deactivate", () => {
  it("remounts every declared config pointer, entity-scoped", async () => {
    const { client, statements } = makeClient();
    const result = await mergeAccountsOnClient(client, input, ACTOR_ID);

    for (const target of CONFIG_REMOUNT_TARGETS) {
      const stmt = statements.find(
        (s) => s.sql.includes(`UPDATE ${target.schema}.${target.table}`) && s.sql.includes(`SET ${target.column} =`)
      );
      expect(stmt, `${target.schema}.${target.table}.${target.column} was never remounted`).toBeTruthy();
      // $1 = surviving account, $2 = merged account, $3 = the entity. Without $3 a merge in one
      // entity could rewrite another entity's configuration.
      expect(stmt?.sql).toContain("operating_company_id = $3");
      expect(stmt?.values).toEqual([TARGET_ID, SOURCE_ID, COMPANY_ID]);
    }

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0]?.merge_record_id).toBeTruthy();
  });

  it("writes the append-only merge record and archives (never deletes) the source", async () => {
    const { client, statements } = makeClient();
    await mergeAccountsOnClient(client, input, ACTOR_ID);

    const record = statements.find((s) => s.sql.includes("INSERT INTO catalogs.account_merge_records"));
    expect(record).toBeTruthy();
    expect(record?.values).toContain(REASON);
    expect(record?.values).toContain(COMPANY_ID);

    const archive = statements.find((s) => s.sql.includes("deactivated_at = COALESCE(deactivated_at, now())"));
    expect(archive).toBeTruthy();
    expect(archive?.sql).toContain("is_postable = false");
    expect(statements.some((s) => /DELETE\s+FROM/i.test(s.sql))).toBe(false);
  });

  it("emits the critical merge audit event and the WF-064 owner-notification workflow event", async () => {
    const { client, statements } = makeClient();
    await mergeAccountsOnClient(client, input, ACTOR_ID);

    const auditCalls = statements.filter((s) => s.sql.includes("audit.append_event"));
    const classes = auditCalls.map((s) => s.values[0]);
    expect(classes).toContain("catalogs.account_merged");
    expect(classes).toContain("workflow.requested");
    expect(auditCalls.every((s) => s.values[1] === "critical")).toBe(true);
  });

  it("refuses migrate_historical_postings=true — posted history is immutable (MUST 3.18.7.1)", async () => {
    const { client, statements } = makeClient();
    await expect(
      mergeAccountsOnClient(client, { ...input, migrateHistoricalPostings: true }, ACTOR_ID)
    ).rejects.toMatchObject({ code: "E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN" });
    // Refused BEFORE anything was written.
    expect(statements).toHaveLength(0);
  });

  it("never touches a posted-history pointer", async () => {
    const { client, statements } = makeClient();
    await mergeAccountsOnClient(client, input, ACTOR_ID);

    for (const pointer of HISTORY_POINTERS_NEVER_MOVED) {
      const [schema, table] = pointer.split(".");
      expect(
        statements.some((s) => s.sql.includes(`UPDATE ${schema}.${table}`)),
        `${pointer} must not be rewritten by a merge`
      ).toBe(false);
    }
  });

  it("rejects a cross-type merge with E_MERGE_ACCOUNT_TYPE_MISMATCH", async () => {
    const { client } = makeClient({ sourceType: "Asset" });
    await expect(mergeAccountsOnClient(client, input, ACTOR_ID)).rejects.toMatchObject({
      code: "E_MERGE_ACCOUNT_TYPE_MISMATCH",
    });
  });

  it("rejects a locked source account", async () => {
    const { client } = makeClient({ sourceLocked: true });
    await expect(mergeAccountsOnClient(client, input, ACTOR_ID)).rejects.toMatchObject({
      code: "E_MERGE_SOURCE_LOCKED",
      httpStatus: 423,
    });
  });

  it("requires a reason of at least 20 characters", () => {
    expect(() => assertMergeReason("dupe")).toThrow(AccountMergeError);
    expect(() => assertMergeReason(REASON)).not.toThrow();
  });

  it("refuses to merge an account into itself", () => {
    const account = {
      id: TARGET_ID,
      account_number: "5210",
      account_name: "Fuel Expense",
      account_type: "Expense",
      currency_code: "USD",
      is_locked: false,
      deactivated_at: null,
    };
    expect(() => assertMergeCompatible(account, account)).toThrow(AccountMergeError);
  });

  it("fails closed with E_MERGE_SCHEMA_NOT_APPLIED when account_merge_records is missing", async () => {
    const { client } = makeClient();
    const orig = client.query.bind(client);
    client.query = async (sql: string, values: unknown[] = []) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: false }] };
      return orig(sql, values);
    };
    await expect(
      mergeAccountsOnClient(
        client,
        {
          operatingCompanyId: COMPANY_ID,
          targetAccountId: TARGET_ID,
          sourceAccountIds: [SOURCE_ID],
          reason: REASON,
          migrateHistoricalPostings: false,
        },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: "E_MERGE_SCHEMA_NOT_APPLIED", httpStatus: 503 });
  });

});
