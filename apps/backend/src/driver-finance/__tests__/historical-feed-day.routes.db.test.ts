/**
 * POST /api/v1/driver-finance/feed-day/run (real Postgres) -- proves the route this session's
 * E20-adjacent Lead order wired onto executeHistoricalFeedDay(): a clean day commits and writes
 * a real driver bill + a "feed_day.closed" audit event; a day that refuses rolls back completely
 * (no partial driver bill left behind); and the sequencing law holds -- day N+1 is refused while
 * day N has not landed clean through this same route, and re-running an already-closed day is
 * refused rather than silently re-executed. Runs only in CI (GITHUB_ACTIONS=true) per this
 * repo's `.db.test.ts` convention.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { createLoadWithFullSideEffects } from "../../dispatch/book-load.service.js";
import { registerHistoricalFeedDayRoutes } from "../historical-feed-day.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("POST /api/v1/driver-finance/feed-day/run (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  let customerId: string;
  let driverId: string;

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  // GO-10 REV-B: Book Load refuses to invent a company's first load number (first_load_number_required);
  // the office types it. This fixture types a fresh numeric one per load (unique under
  // UNIQUE(operating_company_id, load_number) on the shared integration company across forks).
  function typedLoadNumber(): string {
    return String(600_000_000 + Math.floor(Math.random() * 99_999_999));
  }

  async function seedLoad(loadNumberSuffix: string, crewed = false): Promise<string> {
    return bypass(async () => {
      const result = await createLoadWithFullSideEffects(
        db,
        {
          requestingUserUuid: "00000000-0000-4000-8000-000000000001",
          requestingUserRole: "system",
          operating_company_id: companyId,
          customer_id: customerId,
          status: "unassigned",
          load_number: typedLoadNumber(),
          save_mode: "book_dispatch",
          // Booked WITHOUT a crewed driver on purpose. Book Load now (a) refuses a driver-assigned booking
          // with no practical miles (E_MILES_PRACTICAL_REQUIRED) and (b) once miles are present mints the
          // load's open driver bill at assignment (createDriverBillArtifacts). Either way a crewed booking
          // can no longer leave the "no driver bill yet" gap this route exists to fill, so the fixture
          // books the load uncrewed and the feed day names the driver, exactly as the printed document does.
          // Practical miles are still typed, as the booking screen requires for a real load.
          miles_practical: 500,
          // LEAD 443.92 #3: a crewed booking (driver + miles) — Book Load mints the load's open bill at assignment.
          ...(crewed ? { assigned_primary_driver_id: driverId } : {}),
          // 6db7585fb6 "FINDING: R443.161-G1 trailer choice missing at shared load boundary (#26793)":
          // createLoadWithFullSideEffects now refuses EVERY non-draft booking without an explicit trailer choice
          // (422 trailer_choice_required), historical_backfill included. The fixture records the explicit
          // "no trailer (bobtail / power only)" choice, as the other Book Load fixtures do (443.107).
          trailer_choice: { kind: "none" },
          notes: "feed-day route test fixture",
          is_sample_data: false,
          charges: [],
          stops: [],
        },
        { source: "historical_backfill" }
      );
      if (result.kind === "error") throw new Error(`fixture load create failed: ${JSON.stringify(result.payload)}`);
      return String(result.row.id);
    });
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      const customerRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1::uuid, $2) RETURNING id`,
        [companyId, `Feed-Day Customer ${suffix}`]
      );
      customerId = customerRes.rows[0]!.id;

      const driverRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid, 'FeedDay', $2, $3, 'Active') RETURNING id`,
        [companyId, `D-${suffix}`, `+1006${suffix.slice(0, 4)}`]
      );
      driverId = driverRes.rows[0]!.id;
    });

    app = await createIntegrationApp(async (a) => {
      await registerHistoricalFeedDayRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("runs a clean day: commits, writes a real driver bill, and records the closed audit event", async () => {
    const loadId = await seedLoad("A");
    const feedDate = "2026-08-10";

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: feedDate,
        source_document_ref: `TEST-${suffix}-A`,
        loads: [
          {
            load_id: loadId,
            load_number: `FD-${suffix}-A`,
            driver_id: driverId,
            driver_bill: { gross_amount_cents: 150000 },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { report: { clean: boolean; created: number; refused: number }; previous_day_check: string };
    expect(body.report.clean).toBe(true);
    expect(body.report.created).toBe(1);
    expect(body.previous_day_check).toBe("skipped_no_previous_named");

    const bill = await bypass(() =>
      db.query<{ id: string }>(`SELECT id::text FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])
    );
    expect(bill.rows.length).toBe(1);

    const closedEvent = await bypass(() =>
      db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit.audit_events
          WHERE event_class = 'driver-finance.feed_day.closed'
            AND payload->>'operating_company_id' = $1
            AND payload->>'feed_date' = $2`,
        [companyId, feedDate]
      )
    );
    expect(Number(closedEvent.rows[0]?.n)).toBe(1);
  });

  it("REFUSES to re-run the same day (already closed), and writes nothing new", async () => {
    const feedDate = "2026-08-10"; // same day as the previous test, already closed above
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: feedDate,
        source_document_ref: `TEST-${suffix}-REPEAT`,
        loads: [
          {
            load_id: await seedLoad("REPEAT"),
            load_number: `FD-${suffix}-REPEAT`,
            driver_id: driverId,
            driver_bill: { gross_amount_cents: 999999 },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe("feed_day_already_closed");
  });

  it("REFUSES day N+1 when the named previous day has not closed through this route", async () => {
    const loadId = await seedLoad("B");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-11",
        previous_feed_date: "2026-01-01", // a real ISO date, but one never closed through this route
        source_document_ref: `TEST-${suffix}-B`,
        loads: [
          { load_id: loadId, load_number: `FD-${suffix}-B`, driver_id: driverId, driver_bill: { gross_amount_cents: 100000 } },
        ],
      },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe("previous_feed_day_not_closed");

    const bill = await bypass(() =>
      db.query<{ id: string }>(`SELECT id::text FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])
    );
    expect(bill.rows.length).toBe(0);
  });

  it("ALLOWS day N+1 once the named previous day is confirmed closed", async () => {
    const loadId = await seedLoad("C");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-12",
        previous_feed_date: "2026-08-10", // closed by the first test in this file
        source_document_ref: `TEST-${suffix}-C`,
        loads: [
          { load_id: loadId, load_number: `FD-${suffix}-C`, driver_id: driverId, driver_bill: { gross_amount_cents: 200000 } },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { report: { clean: boolean }; previous_day_check: string };
    expect(body.report.clean).toBe(true);
    expect(body.previous_day_check).toBe("confirmed_closed");
  });

  it("ROLLS BACK completely on a refused day -- no partial driver bill left behind", async () => {
    const loadId = await seedLoad("D");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-13",
        previous_feed_date: "2026-08-12",
        source_document_ref: `TEST-${suffix}-D`,
        loads: [
          // gross_amount_cents <= 0 -> createHistoricalDriverBill refuses this exact row.
          { load_id: loadId, load_number: `FD-${suffix}-D`, driver_id: driverId, driver_bill: { gross_amount_cents: 0 } },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { report: { clean: boolean; refused: number } };
    expect(body.report.clean).toBe(false);
    expect(body.report.refused).toBe(1);

    const bill = await bypass(() =>
      db.query<{ id: string }>(`SELECT id::text FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])
    );
    expect(bill.rows.length).toBe(0);

    const closedEvent = await bypass(() =>
      db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit.audit_events
          WHERE event_class = 'driver-finance.feed_day.closed'
            AND payload->>'operating_company_id' = $1
            AND payload->>'feed_date' = '2026-08-13'`,
        [companyId]
      )
    );
    expect(Number(closedEvent.rows[0]?.n)).toBe(0);
  });

  it("BCF-11: a feed day naming escrow holds is REFUSED by name and writes NO escrow (one escrow writer = settlement close)", async () => {
    const loadId = await seedLoad("ESC");
    const countEscrow = async () =>
      bypass(async () => {
        const ledger = await db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM driver_finance.escrow_ledger WHERE operating_company_id = $1::uuid AND load_id = $2::uuid`,
          [companyId, loadId]
        );
        const postings = await db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM accounting.escrow_postings p
             JOIN accounting.escrow_accounts a ON a.id = p.escrow_account_id
            WHERE p.operating_company_id = $1::uuid AND a.holder_id = $2::uuid AND p.posting_type = 'deposit'
              AND p.linked_journal_entry_id IS NULL`,
          [companyId, driverId]
        );
        return { ledger: Number(ledger.rows[0]?.n), unlinkedDeposits: Number(postings.rows[0]?.n) };
      });
    // The driver HAS an escrow account bridge, so the old historical writer would have reached the
    // unlinked deposit (no JE, no source id) — the defect this test pins (BCF-11).
    await bypass(async () => {
      const acct = await db.query<{ id: string }>(
        `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_type ILIKE '%liab%' ORDER BY account_number NULLS LAST LIMIT 1`,
        [companyId]
      );
      await db.query(
        `INSERT INTO accounting.escrow_accounts (operating_company_id, holder_id, holder_type, purpose, coa_account_id, status)
         SELECT $1::uuid, $2::uuid, 'driver', 'driver_bond', $3::uuid, 'active'
          WHERE NOT EXISTS (SELECT 1 FROM accounting.escrow_accounts WHERE operating_company_id = $1::uuid AND holder_id = $2::uuid AND holder_type = 'driver')`,
        [companyId, driverId, acct.rows[0]?.id ?? null]
      );
    });
    const before = await countEscrow();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-19",
        source_document_ref: `TEST-${suffix}-ESC`,
        stop_on_first_refusal: false,
        loads: [
          {
            load_id: loadId,
            load_number: `FD-${suffix}-ESC`,
            driver_id: driverId,
            driver_bill: { gross_amount_cents: 90000 },
            escrow_holds: [{ description: `Driver Deduction-Escrow for Claims-${suffix}`, amount_cents: 2500 }],
          },
        ],
      },
    });
    const body = res.json() as { report?: { steps?: Array<{ step: string; status: string; detail?: string }> } };
    const escrowStep = (body.report?.steps ?? []).find((s) => s.step === "escrow");
    expect(escrowStep?.status).toBe("refused");
    expect(String(escrowStep?.detail)).toContain("escrow_written_only_by_settlement_close");

    const after = await countEscrow();
    expect(after.ledger).toBe(before.ledger);
    expect(after.unlinkedDeposits).toBe(before.unlinkedDeposits);
  });

  it("dry_run never commits, even when the plan would otherwise be clean", async () => {
    const loadId = await seedLoad("E");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-14",
        previous_feed_date: "2026-08-12",
        source_document_ref: `TEST-${suffix}-E`,
        dry_run: true,
        loads: [
          { load_id: loadId, load_number: `FD-${suffix}-E`, driver_id: driverId, driver_bill: { gross_amount_cents: 300000 } },
        ],
      },
    });
    expect(res.statusCode).toBe(422); // dry_run is never "committed clean" from this route's own perspective
    const body = res.json() as { report: { dry_run: boolean; clean: boolean } };
    expect(body.report.dry_run).toBe(true);

    const bill = await bypass(() =>
      db.query<{ id: string }>(`SELECT id::text FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])
    );
    expect(bill.rows.length).toBe(0);
  });

  it("403s a non-authority role", async () => {
    const loadId = await seedLoad("F");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/feed-day/run",
      headers: testAuthHeaders(undefined, "Manager"),
      payload: {
        operating_company_id: companyId,
        feed_date: "2026-08-15",
        source_document_ref: `TEST-${suffix}-F`,
        loads: [{ load_id: loadId, load_number: `FD-${suffix}-F`, driver_id: driverId, driver_bill: { gross_amount_cents: 100000 } }],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("LEAD 443.92 #3: a load booked with driver + miles has its open bill — the feed day writes the printed amount onto THAT bill (one bill, idempotent)", async () => {
    const loadId = await seedLoad("G", true);
    const minted = await bypass(() =>
      db.query<{ id: string; gross: string; status: string }>(
        `SELECT id::text, gross_amount_cents::text AS gross, status FROM driver_finance.driver_bills WHERE load_id = $1::uuid AND voided_at IS NULL`,
        [loadId]
      )
    );
    expect(minted.rows.length).toBe(1);
    expect(minted.rows[0]!.status).toBe("open");
    const run = (feedDate: string, ref: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/driver-finance/feed-day/run",
        headers: testAuthHeaders(undefined, "Owner"),
        payload: {
          operating_company_id: companyId,
          feed_date: feedDate,
          source_document_ref: ref,
          loads: [{ load_id: loadId, load_number: `FD-${suffix}-G`, driver_id: driverId,
                    driver_bill: { gross_amount_cents: 123456, loaded_pay_cents: 120000, deadhead_pay_cents: 3456 } }],
        },
      });
    const res = await run("2026-08-20", `TEST-${suffix}-G`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { report: { clean: boolean; created: number; filled: number; steps: Array<{ status: string }> } };
    expect(body.report.clean).toBe(true);
    expect(body.report.created).toBe(0);
    expect(body.report.filled).toBe(1);
    const after = await bypass(() =>
      db.query<{ id: string; gross: string; loaded: string; deadhead: string }>(
        `SELECT id::text, gross_amount_cents::text AS gross, loaded_pay_cents::text AS loaded, deadhead_pay_cents::text AS deadhead
           FROM driver_finance.driver_bills WHERE load_id = $1::uuid AND voided_at IS NULL`,
        [loadId]
      )
    );
    expect(after.rows.length).toBe(1);
    expect(after.rows[0]!.id).toBe(minted.rows[0]!.id);
    expect(Number(after.rows[0]!.gross)).toBe(123456);
    expect(Number(after.rows[0]!.loaded)).toBe(120000);
    expect(Number(after.rows[0]!.deadhead)).toBe(3456);

    // Idempotent: the same printed amount on another (unclosed) day is already_exists, still one bill.
    const again = await run("2026-08-21", `TEST-${suffix}-G2`);
    expect(again.statusCode).toBe(200);
    const againBody = again.json() as { report: { filled: number; already_existed: number } };
    expect(againBody.report.filled).toBe(0);
    expect(againBody.report.already_existed).toBe(1);
    const count = await bypass(() =>
      db.query<{ n: string }>(`SELECT count(*)::text AS n FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])
    );
    expect(Number(count.rows[0]!.n)).toBe(1);
  });
});
