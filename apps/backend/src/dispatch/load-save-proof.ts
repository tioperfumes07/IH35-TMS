/**
 * GO-17 Part 1 — English proof of what Book Load Save actually did.
 * Reads journal_entry_postings + audit.row_changes only. No parallel truth log.
 */
export type ProofLink =
  | { state: "linked"; id: string; label: string }
  | { state: "not_set"; reason: string };

export type LoadSaveProof = {
  created: {
    load_id: string;
    load_number: string | null;
    status: string | null;
    audit_insert: boolean;
    audit_changed_at: string | null;
    trace_no: string | null;
  };
  linked: {
    customer: ProofLink;
    driver: ProofLink;
    truck: ProofLink;
    trailer: ProofLink;
  };
  ledger: {
    postings: Array<{
      journal_entry_id: string;
      debit_or_credit: string;
      amount_cents: number;
      source_transaction_type: string | null;
      source_trace_key: string | null;
    }>;
    empty_english: string | null;
  };
  did_not: string[];
};

export function proofLink(id: unknown, label: unknown, emptyReason: string): ProofLink {
  const sid = id == null ? "" : String(id).trim();
  if (!sid) return { state: "not_set", reason: emptyReason };
  const lab = label == null ? "" : String(label).trim();
  return { state: "linked", id: sid, label: lab || sid };
}

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export async function buildLoadSaveProof(
  client: Queryable,
  args: {
    operatingCompanyId: string;
    load: Record<string, unknown>;
    trailerId?: string | null;
    trailerLabel?: string | null;
    driverBillMint?: { outcome?: string; missing?: string[] } | null;
  }
): Promise<LoadSaveProof> {
  const loadId = String(args.load.id ?? "");
  const opco = args.operatingCompanyId;
  const customerId = args.load.customer_id ?? args.load.customerId;
  const driverId = args.load.assigned_primary_driver_id ?? args.load.assignedPrimaryDriverId;
  const teamId = args.load.team_id ?? args.load.teamId;
  const unitId = args.load.assigned_unit_id ?? args.load.assignedUnitId;

  const [names, audit, postings] = await Promise.all([
    client.query<{
      customer_name: string | null;
      driver_name: string | null;
      unit_number: string | null;
      trailer_number: string | null;
    }>(
      `
        SELECT
          CASE WHEN $2::uuid IS NULL THEN NULL
               ELSE mdata.resolve_customer_label_same_company($2::uuid, $1::uuid) END AS customer_name,
          CASE WHEN $3::uuid IS NULL THEN NULL
               ELSE mdata.resolve_driver_label_same_company($3::uuid, $1::uuid) END AS driver_name,
          (SELECT u.unit_number FROM mdata.units u WHERE u.id = $4::uuid LIMIT 1) AS unit_number,
          COALESCE(
            (SELECT u.unit_number FROM mdata.units u WHERE u.id = $5::uuid LIMIT 1),
            (SELECT e.equipment_number FROM mdata.equipment e WHERE e.id = $5::uuid LIMIT 1)
          ) AS trailer_number
      `,
      [opco, customerId || null, driverId || null, unitId || null, args.trailerId || null]
    ),
    client.query<{ changed_at: string }>(
      `
        SELECT changed_at::text
        FROM audit.row_changes
        WHERE schema_name = 'mdata'
          AND table_name = 'loads'
          AND row_pk = $1
          AND op = 'INSERT'
        ORDER BY changed_at DESC
        LIMIT 1
      `,
      [loadId]
    ),
    client.query<{
      journal_entry_uuid: string;
      debit_or_credit: string;
      amount_cents: string;
      source_transaction_type: string | null;
      source_trace_key: string | null;
    }>(
      `
        SELECT journal_entry_uuid::text, debit_or_credit, amount_cents::text,
               source_transaction_type, source_trace_key
        FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid
          AND source_transaction_id = $2
        ORDER BY created_at
        LIMIT 20
      `,
      [opco, loadId]
    ),
  ]);

  const nm = names.rows[0];
  const customer = proofLink(customerId, nm?.customer_name, "Customer is required to book — this should not be empty.");
  // HARD: a missing driver is Never "Linked". Team-only counts as linked via team id.
  const driver = driverId
    ? proofLink(driverId, nm?.driver_name, "Driver is not set.")
    : teamId
      ? proofLink(teamId, "Team assignment", "Driver is not set.")
      : proofLink(null, null, "Driver is not set.");
  const truck = proofLink(unitId, nm?.unit_number, "Truck is not set.");
  const trailer = proofLink(args.trailerId, args.trailerLabel ?? nm?.trailer_number, "Trailer is not set.");

  const ledgerRows = postings.rows.map((p) => ({
    journal_entry_id: String(p.journal_entry_uuid),
    debit_or_credit: String(p.debit_or_credit),
    amount_cents: Number(p.amount_cents),
    source_transaction_type: p.source_transaction_type,
    source_trace_key: p.source_trace_key,
  }));

  const did_not: string[] = [];
  if (driver.state === "not_set") did_not.push("Did not link a driver. Driver is not set.");
  if (truck.state === "not_set") did_not.push("Did not link a truck. Truck is not set.");
  if (trailer.state === "not_set") did_not.push("Did not link a trailer. Trailer is not set.");
  if (ledgerRows.length === 0) {
    did_not.push("Did not post a journal entry on book. Revenue is recognized at delivery, not at booking.");
  }
  const mint = args.driverBillMint?.outcome ?? null;
  if (mint === "skipped_no_pay_rate") {
    did_not.push(
      `Did not mint a driver bill — missing ${(args.driverBillMint?.missing ?? []).join(", ") || "pay rate"}.`
    );
  } else if (mint !== "minted" && mint !== "already_exists") {
    did_not.push("Did not mint a driver bill on this save.");
  }

  const trace =
    ledgerRows.find((r) => r.source_trace_key)?.source_trace_key ??
    (audit.rows[0] ? `audit.row_changes INSERT ${loadId}` : null);

  return {
    created: {
      load_id: loadId,
      load_number: args.load.load_number == null ? null : String(args.load.load_number),
      status: args.load.status == null ? null : String(args.load.status),
      audit_insert: audit.rows.length > 0,
      audit_changed_at: audit.rows[0]?.changed_at ?? null,
      trace_no: trace,
    },
    linked: { customer, driver, truck, trailer },
    ledger: {
      postings: ledgerRows,
      empty_english:
        ledgerRows.length === 0
          ? "No journal_entry_postings rows with this load as source_transaction_id."
          : null,
    },
    did_not,
  };
}
