/**
 * Real Postgres integration: concurrent dedupe against ux_outbox_events_dedupe_key,
 * terminal→re-enqueue same identity, same-txn rollback.
 * Runs in CI (GITHUB_ACTIONS=true) or when IH35_RUN_DB_TESTS=1 with DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import {
  buildFmcsaLookupFingerprint,
  enqueueFmcsaCustomerVerifyRequested,
  FMCSA_CUSTOMER_VERIFY_EVENT_TYPE,
} from "../fmcsa-customer-verify-chain.service.js";

const runDb =
  process.env.GITHUB_ACTIONS === "true" || process.env.IH35_RUN_DB_TESTS === "1";
const describeDb = describe.skipIf(!runDb);

describeDb("FMCSA outbox dedupe (real Postgres partial unique index)", () => {
  let db: pg.Client;
  let dbB: pg.Client;
  const opco = randomUUID();
  const customer = randomUUID();
  const actor = randomUUID();
  const fingerprint = buildFmcsaLookupFingerprint("MC-4242", "9876543");
  let cs: string;

  beforeAll(async () => {
    cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? "";
    if (!cs) throw new Error("DATABASE_URL required for FMCSA outbox db tests");
    db = new pg.Client(buildPgClientConfig(cs));
    dbB = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await dbB.connect();
    // Ensure partial unique index from migration 0212 exists (migrated CI DB).
    const idx = await db.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname='outbox' AND indexname='ux_outbox_events_dedupe_key'`
    );
    if (idx.rowCount === 0) {
      throw new Error("ux_outbox_events_dedupe_key missing — migrate DB before this suite");
    }
  });

  afterAll(async () => {
    await db.query(
      `DELETE FROM outbox.events WHERE event_type = $1 AND (
         payload->>'customer_id' = $2 OR payload->>'operating_company_id' = $3
       )`,
      [FMCSA_CUSTOMER_VERIFY_EVENT_TYPE, customer, opco]
    );
    await db.end();
    await dbB.end();
  });

  it("concurrent enqueue collapses to one pending row via ON CONFLICT", async () => {
    const results = await Promise.all([
      enqueueFmcsaCustomerVerifyRequested(db as never, {
        operating_company_id: opco,
        customer_id: customer,
        actor_user_id: actor,
        trigger: "create",
        lookup_fingerprint: fingerprint,
      }),
      enqueueFmcsaCustomerVerifyRequested(dbB as never, {
        operating_company_id: opco,
        customer_id: customer,
        actor_user_id: actor,
        trigger: "create",
        lookup_fingerprint: fingerprint,
      }),
    ]);
    const enqueued = results.filter((r) => r.enqueued);
    const deduped = results.filter((r) => r.deduped);
    expect(enqueued.length).toBe(1);
    expect(deduped.length).toBe(1);

    const count = await db.query(
      `
        SELECT count(*)::int AS n
        FROM outbox.events
        WHERE event_type = $1
          AND delivered_at IS NULL
          AND failed_at IS NULL
          AND payload->>'customer_id' = $2
          AND payload->>'lookup_fingerprint' = $3
      `,
      [FMCSA_CUSTOMER_VERIFY_EVENT_TYPE, customer, fingerprint]
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  it("terminal deliver releases dedupe_key so same identity can re-enqueue", async () => {
    await db.query("BEGIN");
    try {
      const first = await enqueueFmcsaCustomerVerifyRequested(db as never, {
        operating_company_id: opco,
        customer_id: customer,
        actor_user_id: actor,
        trigger: "update",
        lookup_fingerprint: fingerprint,
      });
      // May dedupe against prior test row still pending — force terminal on all pending for this identity.
      await db.query(
        `
          UPDATE outbox.events
          SET delivered_at = now(),
              dedupe_key = NULL,
              locked_at = NULL,
              locked_by = NULL
          WHERE event_type = $1
            AND payload->>'customer_id' = $2
            AND payload->>'lookup_fingerprint' = $3
            AND delivered_at IS NULL
            AND failed_at IS NULL
        `,
        [FMCSA_CUSTOMER_VERIFY_EVENT_TYPE, customer, fingerprint]
      );

      const second = await enqueueFmcsaCustomerVerifyRequested(db as never, {
        operating_company_id: opco,
        customer_id: customer,
        actor_user_id: actor,
        trigger: "update",
        lookup_fingerprint: fingerprint,
      });
      expect(second.enqueued).toBe(true);
      expect(second.outbox_event_id).not.toBe(first.outbox_event_id);
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  });

  it("same-txn rollback removes enqueued outbox row", async () => {
    const rollCustomer = randomUUID();
    await db.query("BEGIN");
    const enq = await enqueueFmcsaCustomerVerifyRequested(db as never, {
      operating_company_id: opco,
      customer_id: rollCustomer,
      actor_user_id: actor,
      trigger: "create",
      lookup_fingerprint: "mc=roll|dot=",
    });
    expect(enq.enqueued).toBe(true);
    await db.query("ROLLBACK");

    const leftover = await db.query(
      `SELECT count(*)::int AS n FROM outbox.events WHERE id = $1::uuid`,
      [enq.outbox_event_id]
    );
    expect(leftover.rows[0]?.n).toBe(0);
  });
});
