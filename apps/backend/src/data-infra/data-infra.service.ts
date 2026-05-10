import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";

type SqlClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

async function setCompanyScope(client: SqlClient, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
}

async function ensureQboVendorExists(client: SqlClient, operatingCompanyId: string, vendorId: string) {
  const res = await client.query<{ id: string }>(
    `
      SELECT qbo_entity_id AS id
      FROM qbo_archive.entities_snapshot
      WHERE operating_company_id = $1
        AND qbo_entity_type = 'Vendor'
        AND qbo_entity_id = $2
      LIMIT 1
    `,
    [operatingCompanyId, vendorId]
  );
  return Boolean(res.rows[0]?.id);
}

export async function createDriverVendorMerge(
  userId: string,
  input: {
    operatingCompanyId: string;
    driverId: string;
    fromQboVendorId: string;
    toQboVendorId: string;
    reason: string;
    applyToDriver: boolean;
  }
) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, input.operatingCompanyId);
    if (!(await ensureQboVendorExists(client, input.operatingCompanyId, input.fromQboVendorId))) {
      throw new Error("qbo_vendor_from_not_found");
    }
    if (!(await ensureQboVendorExists(client, input.operatingCompanyId, input.toQboVendorId))) {
      throw new Error("qbo_vendor_to_not_found");
    }
    const driverRes = await client.query<{ id: string; qbo_vendor_id: string | null }>(
      `
        SELECT id, qbo_vendor_id
        FROM mdata.drivers
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [input.driverId, input.operatingCompanyId]
    );
    const driver = driverRes.rows[0];
    if (!driver) throw new Error("driver_not_found");

    const mergeRes = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.driver_vendor_merges (
          operating_company_id,
          driver_id,
          from_qbo_vendor_id,
          to_qbo_vendor_id,
          merge_reason,
          merged_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (operating_company_id, driver_id, from_qbo_vendor_id, to_qbo_vendor_id)
        DO UPDATE
          SET merge_reason = EXCLUDED.merge_reason,
              merged_by_user_id = EXCLUDED.merged_by_user_id,
              merged_at = now(),
              updated_at = now()
        RETURNING id
      `,
      [
        input.operatingCompanyId,
        input.driverId,
        input.fromQboVendorId,
        input.toQboVendorId,
        input.reason,
        userId,
      ]
    );

    if (input.applyToDriver && driver.qbo_vendor_id === input.fromQboVendorId) {
      await client.query(
        `
          UPDATE mdata.drivers
          SET qbo_vendor_id = $2,
              qbo_vendor_linked_at = now(),
              qbo_vendor_linked_by_user_id = $3,
              updated_at = now()
          WHERE id = $1
        `,
        [input.driverId, input.toQboVendorId, userId]
      );
    }

    await appendCrudAudit(
      client,
      userId,
      "integrations.qbo.vendor_merge.executed",
      {
        resource_type: "mdata.driver_vendor_merges",
        resource_id: mergeRes.rows[0]?.id ?? null,
        operating_company_id: input.operatingCompanyId,
        driver_id: input.driverId,
        from_qbo_vendor_id: input.fromQboVendorId,
        to_qbo_vendor_id: input.toQboVendorId,
        apply_to_driver: input.applyToDriver,
        reason: input.reason,
      },
      "warning",
      "P5-G-COMBINED"
    );

    return { id: mergeRes.rows[0]?.id ?? null };
  });
}

export async function listDriverVendorMerges(userId: string, operatingCompanyId: string, limit = 200) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, operatingCompanyId);
    const res = await client.query(
      `
        SELECT *
        FROM mdata.driver_vendor_merges
        WHERE operating_company_id = $1
        ORDER BY merged_at DESC
        LIMIT $2
      `,
      [operatingCompanyId, limit]
    );
    return res.rows;
  });
}

export async function upsertFaroDailyImport(
  userId: string,
  input: {
    operatingCompanyId: string;
    statementDate: string;
    statementReference: string;
    sourceFilename?: string | null;
    notes?: string | null;
    lines: Array<{
      invoice_number: string;
      customer_name?: string | null;
      load_id?: string | null;
      gross_amount_cents?: number;
      advance_amount_cents?: number;
      reserve_amount_cents?: number;
      fee_amount_cents?: number;
      chargeback_amount_cents?: number;
      net_amount_cents?: number;
      due_on?: string | null;
    }>;
  }
) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, input.operatingCompanyId);

    const totals = input.lines.reduce(
      (acc, row) => {
        acc.gross += Number(row.gross_amount_cents ?? 0);
        acc.advance += Number(row.advance_amount_cents ?? 0);
        acc.reserve += Number(row.reserve_amount_cents ?? 0);
        acc.fee += Number(row.fee_amount_cents ?? 0);
        acc.chargeback += Number(row.chargeback_amount_cents ?? 0);
        return acc;
      },
      { gross: 0, advance: 0, reserve: 0, fee: 0, chargeback: 0 }
    );

    const importRes = await client.query<{ id: string }>(
      `
        INSERT INTO factor.faro_daily_imports (
          operating_company_id,
          statement_date,
          statement_reference,
          source_filename,
          imported_by_user_id,
          gross_total_cents,
          advance_total_cents,
          reserve_total_cents,
          fee_total_cents,
          chargeback_total_cents,
          notes,
          raw_payload
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
        ON CONFLICT (operating_company_id, statement_date, statement_reference)
        DO UPDATE
          SET source_filename = EXCLUDED.source_filename,
              imported_by_user_id = EXCLUDED.imported_by_user_id,
              gross_total_cents = EXCLUDED.gross_total_cents,
              advance_total_cents = EXCLUDED.advance_total_cents,
              reserve_total_cents = EXCLUDED.reserve_total_cents,
              fee_total_cents = EXCLUDED.fee_total_cents,
              chargeback_total_cents = EXCLUDED.chargeback_total_cents,
              notes = EXCLUDED.notes,
              raw_payload = EXCLUDED.raw_payload,
              imported_at = now(),
              updated_at = now()
        RETURNING id
      `,
      [
        input.operatingCompanyId,
        input.statementDate,
        input.statementReference,
        input.sourceFilename ?? null,
        userId,
        totals.gross,
        totals.advance,
        totals.reserve,
        totals.fee,
        totals.chargeback,
        input.notes ?? null,
        JSON.stringify({ lines: input.lines }),
      ]
    );
    const importId = String(importRes.rows[0]?.id ?? "");
    if (!importId) throw new Error("faro_daily_import_upsert_failed");

    await client.query(`DELETE FROM factor.faro_invoice_lines WHERE daily_import_id = $1`, [importId]);
    for (const row of input.lines) {
      await client.query(
        `
          INSERT INTO factor.faro_invoice_lines (
            operating_company_id,
            daily_import_id,
            invoice_number,
            customer_name,
            load_id,
            gross_amount_cents,
            advance_amount_cents,
            reserve_amount_cents,
            fee_amount_cents,
            chargeback_amount_cents,
            net_amount_cents,
            due_on
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          input.operatingCompanyId,
          importId,
          row.invoice_number,
          row.customer_name ?? null,
          row.load_id ?? null,
          Number(row.gross_amount_cents ?? 0),
          Number(row.advance_amount_cents ?? 0),
          Number(row.reserve_amount_cents ?? 0),
          Number(row.fee_amount_cents ?? 0),
          Number(row.chargeback_amount_cents ?? 0),
          Number(row.net_amount_cents ?? 0),
          row.due_on ?? null,
        ]
      );
    }

    await appendCrudAudit(
      client,
      userId,
      "factoring.faro_import.batch_upserted",
      {
        resource_type: "factor.faro_daily_imports",
        resource_id: importId,
        operating_company_id: input.operatingCompanyId,
        statement_date: input.statementDate,
        statement_reference: input.statementReference,
        line_count: input.lines.length,
      },
      "info",
      "P5-G-COMBINED"
    );

    return { id: importId };
  });
}

export async function listFaroDailyImports(userId: string, operatingCompanyId: string, limit = 90) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, operatingCompanyId);
    const res = await client.query(
      `
        SELECT *
        FROM factor.faro_daily_imports
        WHERE operating_company_id = $1
        ORDER BY statement_date DESC, created_at DESC
        LIMIT $2
      `,
      [operatingCompanyId, limit]
    );
    return res.rows;
  });
}

export async function getFaroDailyImportDetail(userId: string, operatingCompanyId: string, importId: string) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, operatingCompanyId);
    const importRes = await client.query(
      `
        SELECT *
        FROM factor.faro_daily_imports
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [importId, operatingCompanyId]
    );
    if (!importRes.rows[0]) throw new Error("faro_import_not_found");
    const linesRes = await client.query(
      `
        SELECT *
        FROM factor.faro_invoice_lines
        WHERE daily_import_id = $1
          AND operating_company_id = $2
        ORDER BY invoice_number ASC
      `,
      [importId, operatingCompanyId]
    );
    return { import: importRes.rows[0], lines: linesRes.rows };
  });
}

export async function listEquipmentLoans(userId: string, operatingCompanyId: string, status?: string) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, operatingCompanyId);
    const values: unknown[] = [operatingCompanyId];
    let whereSql = `WHERE l.operating_company_id = $1`;
    if (status) {
      values.push(status);
      whereSql += ` AND l.status = $${values.length}`;
    }
    const res = await client.query(
      `
        SELECT
          l.*,
          e.equipment_number,
          v.vendor_name AS lender_vendor_name
        FROM banking.equipment_loans l
        JOIN mdata.equipment e ON e.id = l.equipment_id
        JOIN mdata.vendors v ON v.id = l.lender_vendor_id
        ${whereSql}
        ORDER BY l.started_on DESC, l.created_at DESC
        LIMIT 300
      `,
      values
    );
    return res.rows;
  });
}

export async function createEquipmentLoan(
  userId: string,
  input: {
    operatingCompanyId: string;
    equipmentId: string;
    lenderVendorId: string;
    principalCents: number;
    aprPercent: number;
    startedOn: string;
    maturityOn?: string | null;
    memo?: string | null;
  }
) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, input.operatingCompanyId);
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO banking.equipment_loans (
          operating_company_id,
          equipment_id,
          lender_vendor_id,
          principal_cents,
          apr_percent,
          started_on,
          maturity_on,
          memo,
          created_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id
      `,
      [
        input.operatingCompanyId,
        input.equipmentId,
        input.lenderVendorId,
        input.principalCents,
        input.aprPercent,
        input.startedOn,
        input.maturityOn ?? null,
        input.memo ?? null,
        userId,
      ]
    );
    const loanId = String(res.rows[0]?.id ?? "");
    if (!loanId) throw new Error("equipment_loan_create_failed");
    await appendCrudAudit(
      client,
      userId,
      "banking.equipment_loan.created",
      {
        resource_type: "banking.equipment_loans",
        resource_id: loanId,
        operating_company_id: input.operatingCompanyId,
        equipment_id: input.equipmentId,
        lender_vendor_id: input.lenderVendorId,
        principal_cents: input.principalCents,
      },
      "info",
      "P5-G-COMBINED"
    );
    return { id: loanId };
  });
}

export async function createEquipmentLoanAttribution(
  userId: string,
  input: {
    operatingCompanyId: string;
    loanId: string;
    loadId: string;
    attributionDate: string;
    amountCents: number;
    memo?: string | null;
  }
) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, input.operatingCompanyId);
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO banking.equipment_loan_attributions (
          operating_company_id,
          loan_id,
          load_id,
          attribution_date,
          amount_cents,
          memo,
          created_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
      `,
      [
        input.operatingCompanyId,
        input.loanId,
        input.loadId,
        input.attributionDate,
        input.amountCents,
        input.memo ?? null,
        userId,
      ]
    );
    const id = String(res.rows[0]?.id ?? "");
    if (!id) throw new Error("equipment_loan_attribution_create_failed");
    await appendCrudAudit(
      client,
      userId,
      "banking.equipment_loan.attribution_created",
      {
        resource_type: "banking.equipment_loan_attributions",
        resource_id: id,
        operating_company_id: input.operatingCompanyId,
        loan_id: input.loanId,
        load_id: input.loadId,
        amount_cents: input.amountCents,
      },
      "info",
      "P5-G-COMBINED"
    );
    return { id };
  });
}

export async function createEquipmentLoanPayment(
  userId: string,
  input: {
    operatingCompanyId: string;
    loanId: string;
    paidOn: string;
    amountCents: number;
    principalCents: number;
    interestCents: number;
    feeCents: number;
    referenceNumber?: string | null;
    memo?: string | null;
  }
) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, input.operatingCompanyId);
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO banking.equipment_loan_payments (
          operating_company_id,
          loan_id,
          paid_on,
          amount_cents,
          principal_cents,
          interest_cents,
          fee_cents,
          reference_number,
          memo,
          created_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `,
      [
        input.operatingCompanyId,
        input.loanId,
        input.paidOn,
        input.amountCents,
        input.principalCents,
        input.interestCents,
        input.feeCents,
        input.referenceNumber ?? null,
        input.memo ?? null,
        userId,
      ]
    );
    const id = String(res.rows[0]?.id ?? "");
    if (!id) throw new Error("equipment_loan_payment_create_failed");
    await appendCrudAudit(
      client,
      userId,
      "banking.equipment_loan.payment_recorded",
      {
        resource_type: "banking.equipment_loan_payments",
        resource_id: id,
        operating_company_id: input.operatingCompanyId,
        loan_id: input.loanId,
        amount_cents: input.amountCents,
        principal_cents: input.principalCents,
        interest_cents: input.interestCents,
      },
      "info",
      "P5-G-COMBINED"
    );
    return { id };
  });
}

export async function getEquipmentLoanLedger(userId: string, operatingCompanyId: string, loanId: string) {
  return withCurrentUser(userId, async (client) => {
    await setCompanyScope(client, operatingCompanyId);
    const loanRes = await client.query(
      `
        SELECT *
        FROM banking.equipment_loans
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [loanId, operatingCompanyId]
    );
    if (!loanRes.rows[0]) throw new Error("equipment_loan_not_found");
    const attributionsRes = await client.query(
      `
        SELECT *
        FROM banking.equipment_loan_attributions
        WHERE loan_id = $1
          AND operating_company_id = $2
        ORDER BY attribution_date DESC, created_at DESC
      `,
      [loanId, operatingCompanyId]
    );
    const paymentsRes = await client.query(
      `
        SELECT *
        FROM banking.equipment_loan_payments
        WHERE loan_id = $1
          AND operating_company_id = $2
        ORDER BY paid_on DESC, created_at DESC
      `,
      [loanId, operatingCompanyId]
    );
    return {
      loan: loanRes.rows[0],
      attributions: attributionsRes.rows,
      payments: paymentsRes.rows,
    };
  });
}
