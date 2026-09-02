// GO-21 dispatch defect register, section A1 (owner direct instruction 2026-09-02).
// "Attach an interchange trailer to a load, record receipt, record return, upload the signed
// agreement." Never mdata.units -- a non-owned trailer is NOT the owned fleet.
import { appendCrudAudit } from "../audit/crud-audit.js";

export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export class TrailerInterchangeError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "TrailerInterchangeError";
  }
}

export type CounterpartyType = "customer" | "vendor";

type CreateNonOwnedTrailerInput = {
  operating_company_id: string;
  trailer_number: string;
  trailer_type?: string | null;
  plate_number?: string | null;
  plate_state?: string | null;
  vin?: string | null;
  counterparty_type: CounterpartyType;
  counterparty_id: string;
  notes?: string | null;
  created_by_user_id: string;
};

export async function createNonOwnedTrailer(client: DbClient, input: CreateNonOwnedTrailerInput) {
  if (!input.trailer_number?.trim()) {
    throw new TrailerInterchangeError("trailer_number_required");
  }
  // Confirm the counterparty actually exists in the table the discriminator names — a polymorphic
  // FK cannot be enforced by Postgres itself, so this is the app-level equivalent.
  const table = input.counterparty_type === "customer" ? "mdata.customers" : "mdata.vendors";
  const counterpartyRes = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.counterparty_id, input.operating_company_id]
  );
  if (!counterpartyRes.rows[0]) {
    throw new TrailerInterchangeError(
      "counterparty_not_found",
      `No ${input.counterparty_type} ${input.counterparty_id} found for this entity.`
    );
  }

  const res = await client.query<{ id: string }>(
    `
      INSERT INTO dispatch.non_owned_trailers (
        operating_company_id, trailer_number, trailer_type, plate_number, plate_state, vin,
        counterparty_type, counterparty_id, notes, created_by_user_id
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid, $9, $10::uuid)
      RETURNING id
    `,
    [
      input.operating_company_id,
      input.trailer_number.trim(),
      input.trailer_type ?? null,
      input.plate_number ?? null,
      input.plate_state ?? null,
      input.vin ?? null,
      input.counterparty_type,
      input.counterparty_id,
      input.notes ?? null,
      input.created_by_user_id,
    ]
  );
  const id = res.rows[0]!.id;
  await appendCrudAudit(
    client,
    input.created_by_user_id,
    "dispatch.non_owned_trailer.created",
    { id, trailer_number: input.trailer_number, counterparty_type: input.counterparty_type, counterparty_id: input.counterparty_id },
    "info",
    "GO-21-A1"
  );
  return { id };
}

type AttachInterchangeInput = {
  operating_company_id: string;
  load_id: string;
  non_owned_trailer_id: string;
  created_by_user_id: string;
};

// Attach a non-owned trailer to a load — the interchange starts in 'pending_receipt'; it only
// becomes 'active' once recordReceipt is called. Nothing here touches mdata.units.
export async function attachInterchangeTrailerToLoad(client: DbClient, input: AttachInterchangeInput) {
  const loadRes = await client.query<{ id: string }>(
    `SELECT id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.load_id, input.operating_company_id]
  );
  if (!loadRes.rows[0]) throw new TrailerInterchangeError("load_not_found");

  const trailerRes = await client.query<{ id: string }>(
    `SELECT id FROM dispatch.non_owned_trailers WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL`,
    [input.non_owned_trailer_id, input.operating_company_id]
  );
  if (!trailerRes.rows[0]) throw new TrailerInterchangeError("non_owned_trailer_not_found");

  const res = await client.query<{ id: string }>(
    `
      INSERT INTO dispatch.trailer_interchanges (
        operating_company_id, load_id, non_owned_trailer_id, status, created_by_user_id
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending_receipt', $4::uuid)
      RETURNING id
    `,
    [input.operating_company_id, input.load_id, input.non_owned_trailer_id, input.created_by_user_id]
  );
  const id = res.rows[0]!.id;
  await appendCrudAudit(
    client,
    input.created_by_user_id,
    "dispatch.trailer_interchange.attached",
    { id, load_id: input.load_id, non_owned_trailer_id: input.non_owned_trailer_id },
    "info",
    "GO-21-A1"
  );
  return { id, status: "pending_receipt" as const };
}

type RecordReceiptInput = {
  operating_company_id: string;
  interchange_id: string;
  received_from: string;
  received_at?: string;
  condition_in?: string | null;
  actor_user_id: string;
};

export async function recordInterchangeReceipt(client: DbClient, input: RecordReceiptInput) {
  if (!input.received_from?.trim()) {
    throw new TrailerInterchangeError("received_from_required", "Who the trailer was received from is required.");
  }
  const existing = await client.query<{ id: string; status: string; voided_at: string | null }>(
    `SELECT id, status, voided_at::text FROM dispatch.trailer_interchanges WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.interchange_id, input.operating_company_id]
  );
  const row = existing.rows[0];
  if (!row) throw new TrailerInterchangeError("interchange_not_found");
  if (row.voided_at) throw new TrailerInterchangeError("interchange_voided");
  if (row.status !== "pending_receipt") {
    throw new TrailerInterchangeError("interchange_already_received", `Interchange is already ${row.status}.`);
  }

  await client.query(
    `
      UPDATE dispatch.trailer_interchanges
         SET received_from = $1, received_at = COALESCE($2::timestamptz, now()), condition_in = $3,
             status = 'active', updated_at = now()
       WHERE id = $4::uuid
    `,
    [input.received_from.trim(), input.received_at ?? null, input.condition_in ?? null, input.interchange_id]
  );
  await appendCrudAudit(
    client,
    input.actor_user_id,
    "dispatch.trailer_interchange.received",
    { id: input.interchange_id, received_from: input.received_from },
    "info",
    "GO-21-A1"
  );
  return { id: input.interchange_id, status: "active" as const };
}

type RecordReturnInput = {
  operating_company_id: string;
  interchange_id: string;
  returned_at?: string;
  condition_out?: string | null;
  actor_user_id: string;
};

export async function recordInterchangeReturn(client: DbClient, input: RecordReturnInput) {
  const existing = await client.query<{ id: string; status: string; voided_at: string | null }>(
    `SELECT id, status, voided_at::text FROM dispatch.trailer_interchanges WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.interchange_id, input.operating_company_id]
  );
  const row = existing.rows[0];
  if (!row) throw new TrailerInterchangeError("interchange_not_found");
  if (row.voided_at) throw new TrailerInterchangeError("interchange_voided");
  if (row.status !== "active") {
    throw new TrailerInterchangeError("interchange_not_active", `Interchange must be active before it can be returned (currently ${row.status}).`);
  }

  await client.query(
    `
      UPDATE dispatch.trailer_interchanges
         SET returned_at = COALESCE($1::timestamptz, now()), condition_out = $2,
             status = 'returned', updated_at = now()
       WHERE id = $3::uuid
    `,
    [input.returned_at ?? null, input.condition_out ?? null, input.interchange_id]
  );
  await appendCrudAudit(
    client,
    input.actor_user_id,
    "dispatch.trailer_interchange.returned",
    { id: input.interchange_id },
    "info",
    "GO-21-A1"
  );
  return { id: input.interchange_id, status: "returned" as const };
}

type AttachAgreementInput = {
  operating_company_id: string;
  interchange_id: string;
  agreement_document_id: string;
  actor_user_id: string;
};

// Upload of the signed agreement — the file itself is uploaded through the existing docs.files
// pipeline elsewhere; this just links the resulting file id onto the interchange record.
export async function attachInterchangeAgreement(client: DbClient, input: AttachAgreementInput) {
  const fileRes = await client.query<{ id: string }>(
    `SELECT id FROM docs.files WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.agreement_document_id, input.operating_company_id]
  );
  if (!fileRes.rows[0]) throw new TrailerInterchangeError("agreement_document_not_found");

  const existing = await client.query<{ id: string; voided_at: string | null }>(
    `SELECT id, voided_at::text FROM dispatch.trailer_interchanges WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.interchange_id, input.operating_company_id]
  );
  if (!existing.rows[0]) throw new TrailerInterchangeError("interchange_not_found");
  if (existing.rows[0].voided_at) throw new TrailerInterchangeError("interchange_voided");

  await client.query(
    `UPDATE dispatch.trailer_interchanges SET agreement_document_id = $1::uuid, updated_at = now() WHERE id = $2::uuid`,
    [input.agreement_document_id, input.interchange_id]
  );
  await appendCrudAudit(
    client,
    input.actor_user_id,
    "dispatch.trailer_interchange.agreement_attached",
    { id: input.interchange_id, agreement_document_id: input.agreement_document_id },
    "info",
    "GO-21-A1"
  );
  return { id: input.interchange_id };
}

type VoidInterchangeInput = {
  operating_company_id: string;
  interchange_id: string;
  reason: string;
  actor_user_id: string;
};

export async function voidTrailerInterchange(client: DbClient, input: VoidInterchangeInput) {
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new TrailerInterchangeError("void_reason_required");

  const existing = await client.query<{ id: string; voided_at: string | null }>(
    `SELECT id, voided_at::text FROM dispatch.trailer_interchanges WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.interchange_id, input.operating_company_id]
  );
  if (!existing.rows[0]) throw new TrailerInterchangeError("interchange_not_found");
  if (existing.rows[0].voided_at) throw new TrailerInterchangeError("interchange_already_voided");

  await client.query(
    `
      UPDATE dispatch.trailer_interchanges
         SET voided_at = now(), voided_by_user_id = $1::uuid, void_reason = $2, updated_at = now()
       WHERE id = $3::uuid
    `,
    [input.actor_user_id, reason, input.interchange_id]
  );
  await appendCrudAudit(
    client,
    input.actor_user_id,
    "dispatch.trailer_interchange.voided",
    { id: input.interchange_id, reason },
    "warning",
    "GO-21-A1"
  );
  return { id: input.interchange_id, voided: true };
}
