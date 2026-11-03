// 25-TASK #4 (owner instructions 2026-09-02) — "Wire the company settlement to close alongside
// the driver settlement when the tour closes at the yard. One close, two settlements."
//
// Called from inside driver-pwa/tour-close.service.ts's closeTourForDriver, in the SAME
// transaction as the driver settlement's own close (stampTripClosedForBookendedSettlement) — if
// this throws, the whole tour-close rolls back, so the two settlements genuinely close together
// or not at all, never one without the other.
//
// CANONICAL-CHECK: no new money data. Finds-or-creates the accounting.company_settlements header
// row for this driver settlement's own period (via the #20033 generator, advisory-lock
// protected), links the driver settlement into it via the
// accounting.company_settlement_driver_settlements junction (idempotent — a driver settlement can
// belong to at most one company settlement, enforced by that table's own unique constraint), then
// closes the company settlement. Company settlement period = the driver settlement's own
// period_start/period_end exactly (the "per-PERIOD grain mirroring driver settlement" design from
// #20033/#20040) — this deliberately does NOT try to merge multiple drivers' settlements whose
// periods merely overlap into one company settlement; only an exact period match reuses an
// existing row, which is the safe, non-inventing behavior when no broader batching spec exists.

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type CloseCompanySettlementResult = {
  company_settlement_id: string;
  display_id: string;
  status: string;
  already_closed: boolean;
};

export async function closeCompanySettlementAlongsideDriverSettlement(
  client: DbClient,
  input: { operatingCompanyId: string; driverSettlementId: string; actorUserId: string }
): Promise<CloseCompanySettlementResult> {
  const dsRes = await client.query<{ period_start: string; period_end: string; status: string }>(
    `
      SELECT period_start::text, period_end::text, status
      FROM driver_finance.driver_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.driverSettlementId, input.operatingCompanyId]
  );
  const ds = dsRes.rows[0];
  if (!ds) {
    throw Object.assign(new Error("driver_settlement_not_found"), { code: "driver_settlement_not_found" });
  }

  // Already linked (idempotent re-entry, e.g. a retried request) — reuse the existing company
  // settlement rather than creating a second one for the same driver settlement (the junction's
  // own uq_driver_settlement_one_company_settlement would refuse a second link anyway).
  const existingLinkRes = await client.query<{ company_settlement_id: string }>(
    `SELECT company_settlement_id::text FROM accounting.company_settlement_driver_settlements WHERE driver_settlement_id = $1::uuid`,
    [input.driverSettlementId]
  );
  let companySettlementId = existingLinkRes.rows[0]?.company_settlement_id ?? null;

  if (!companySettlementId) {
    // R-200 (owner, 2026-09-25): "AlwaysTrack is the source of truth ... deactivate it from creating numbers."
    // AlwaysTrack issues ONE Company Settlement per driver settlement, under the SAME number (Company 5769 =
    // Driver 5769). The old find-or-create-by-exact-period merged different drivers' settlements that shared
    // dates into one header and minted "CS-YYYY-NNNN" numbers AlwaysTrack never issued. Now: one header per
    // driver settlement, numbered by that driver settlement (its AlwaysTrack number, or its P-number while
    // the tour is open). No number -> refuse. accounting.next_company_settlement_display_id is never called.
    const numRes = await client.query<{ n: string | null }>(
      `SELECT COALESCE(source_document_ref, display_id) AS n FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.driverSettlementId, input.operatingCompanyId]
    );
    const displayId = numRes.rows[0]?.n ?? null;
    if (!displayId) {
      throw Object.assign(new Error("driver_settlement_has_no_number"), { code: "driver_settlement_has_no_number" });
    }
    // Find-or-create BY THAT NUMBER: a team tour's second driver settlement that carries the same AlwaysTrack
    // company-settlement number joins the existing header instead of creating a duplicate.
    const byNumber = await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.company_settlements
        WHERE operating_company_id = $1::uuid AND display_id = $2 AND voided_at IS NULL
        ORDER BY created_at LIMIT 1`,
      [input.operatingCompanyId, displayId]
    );
    if (byNumber.rows[0]) {
      companySettlementId = byNumber.rows[0].id;
    } else {
      const insertRes = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.company_settlements
            (operating_company_id, display_id, period_start, period_end, status, created_by_user_id)
          VALUES ($1::uuid, $2, $3::date, $4::date, 'open', $5::uuid)
          RETURNING id::text
        `,
        [input.operatingCompanyId, displayId, ds.period_start, ds.period_end, input.actorUserId]
      );
      companySettlementId = insertRes.rows[0].id;
    }

    await client.query(
      `
        INSERT INTO accounting.company_settlement_driver_settlements (company_settlement_id, driver_settlement_id)
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT DO NOTHING
      `,
      [companySettlementId, input.driverSettlementId]
    );
  }

  // Rows 98 (R86) — a header born while its driver settlement was an OPEN tour carries that tour's P-number (R-200: "its
  // P-number while the tour is open"). The pay-run close then assigns the AlwaysTrack number (443.292-A) and calls here,
  // but this function only ever reused the existing link — the header kept "P-0119" while its driver settlement became
  // 5854 (prod 11-03: company settlement a188e47a). Owner ROUND 167/224: a closed settlement never shows a P-series id.
  // At close the header takes its driver settlement's number; a number already held by another live header is refused
  // by name, never merged or duplicated (uq_company_settlements_display_id).
  await renumberCompanySettlementToDriverNumber(client, {
    operatingCompanyId: input.operatingCompanyId,
    companySettlementId,
    driverSettlementId: input.driverSettlementId,
  });

  const beforeRes = await client.query<{ status: string; voided_at: string | null }>(
    `SELECT status, voided_at::text FROM accounting.company_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [companySettlementId, input.operatingCompanyId]
  );
  if (beforeRes.rows[0]?.voided_at) {
    // void-not-delete: never silently resurrect a voided company settlement back to closed.
    throw Object.assign(new Error("company_settlement_voided"), { code: "company_settlement_voided" });
  }
  const wasAlreadyClosed = beforeRes.rows[0]?.status === "closed";

  const closeRes = await client.query<{ id: string; display_id: string; status: string }>(
    `
      WITH linked_period AS (
        SELECT MIN(ds.period_start) AS period_start, MAX(ds.period_end) AS period_end,
          BOOL_AND(ds.status IN ('closed', 'locked', 'final', 'paid', 'approved', 'ready')
            AND (ds.settlement_model IS DISTINCT FROM 'load_bookended' OR ds.trip_closed_at IS NOT NULL)) AS all_closed
        FROM accounting.company_settlement_driver_settlements link
        JOIN driver_finance.driver_settlements ds ON ds.id = link.driver_settlement_id
        WHERE link.company_settlement_id = $1::uuid AND ds.operating_company_id = $3::uuid
          AND ds.voided_at IS NULL
      )
      UPDATE accounting.company_settlements
      SET status = CASE WHEN (SELECT all_closed FROM linked_period) THEN 'closed' ELSE 'open' END,
          period_start = COALESCE((SELECT period_start FROM linked_period), period_start),
          period_end = COALESCE((SELECT period_end FROM linked_period), period_end),
          closed_at = CASE WHEN (SELECT all_closed FROM linked_period) THEN COALESCE(closed_at, now()) ELSE NULL END,
          closed_by_user_id = CASE WHEN (SELECT all_closed FROM linked_period) THEN COALESCE(closed_by_user_id, $2::uuid) ELSE NULL END,
          updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $3::uuid AND voided_at IS NULL
      RETURNING id::text, display_id, status
    `,
    [companySettlementId, input.actorUserId, input.operatingCompanyId]
  );
  const closed = closeRes.rows[0];
  return {
    company_settlement_id: closed.id,
    display_id: closed.display_id,
    status: closed.status,
    already_closed: wasAlreadyClosed,
  };
}

export type RenumberCompanySettlementResult = { renumbered: boolean; from: string | null; to: string | null };

/**
 * Rows 98 (R86): the company settlement header carries its driver settlement's number. Renumbers ONLY a header that
 * still carries THIS driver settlement's P-number (display_id = the driver settlement's display_id) once the driver
 * settlement holds its real number (source_document_ref). Never touches a header named by any other number.
 */
export async function renumberCompanySettlementToDriverNumber(
  client: DbClient,
  input: { operatingCompanyId: string; companySettlementId: string; driverSettlementId: string }
): Promise<RenumberCompanySettlementResult> {
  const row = (
    await client.query<{ header_number: string | null; p_number: string | null; real_number: string | null; voided: boolean }>(
      `SELECT cs.display_id AS header_number, ds.display_id AS p_number, ds.source_document_ref AS real_number,
              (cs.voided_at IS NOT NULL) AS voided
         FROM accounting.company_settlements cs
         JOIN accounting.company_settlement_driver_settlements link ON link.company_settlement_id = cs.id
         JOIN driver_finance.driver_settlements ds ON ds.id = link.driver_settlement_id AND ds.operating_company_id = cs.operating_company_id
        WHERE cs.id = $1::uuid AND cs.operating_company_id = $2::uuid AND ds.id = $3::uuid
        LIMIT 1`,
      [input.companySettlementId, input.operatingCompanyId, input.driverSettlementId]
    )
  ).rows[0];
  if (!row || row.voided || !row.real_number || !row.p_number) return { renumbered: false, from: row?.header_number ?? null, to: null };
  if (row.header_number !== row.p_number || row.header_number === row.real_number) {
    return { renumbered: false, from: row.header_number, to: null };
  }
  const taken = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.company_settlements
      WHERE operating_company_id = $1::uuid AND display_id = $2 AND id <> $3::uuid LIMIT 1`,
    [input.operatingCompanyId, row.real_number, input.companySettlementId]
  );
  if (taken.rows[0]) {
    throw Object.assign(new Error("company_settlement_number_taken"), {
      code: "company_settlement_number_taken",
      message_for_user: `Company settlement ${row.header_number} cannot take number ${row.real_number}: another company settlement already carries it.`,
    });
  }
  await client.query(
    `UPDATE accounting.company_settlements SET display_id = $3, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND display_id = $4 AND voided_at IS NULL`,
    [input.companySettlementId, input.operatingCompanyId, row.real_number, row.header_number]
  );
  return { renumbered: true, from: row.header_number, to: row.real_number };
}
