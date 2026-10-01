/**
 * D-H1 (ORDERS-2026-10-01 / ROUND 312) — Load History aggregate.
 * Read-only timeline: audit events, assignment history, stop arrival/departure stamps
 * (+ fence event ids when known), and linked money/docs (invoice, Faro advance, settlement
 * line, expenses, work orders). Newest first. Nothing invented — gaps surface as "not recorded".
 */
type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type LoadHistoryLink = {
  kind:
    | "load"
    | "driver"
    | "unit"
    | "trailer"
    | "customer"
    | "invoice"
    | "factoring_advance"
    | "settlement"
    | "expense"
    | "work_order"
    | "geofence_event"
    | "stop"
    | "user";
  id: string;
  label: string | null;
};

export type LoadHistoryRow = {
  id: string;
  occurred_at: string;
  kind:
    | "status_transition"
    | "field_edit"
    | "assignment"
    | "stop_stamp"
    | "lock_override"
    | "audit"
    | "linked_document"
    | "gap";
  summary: string;
  field: string | null;
  before_value: string | null;
  after_value: string | null;
  actor_user_id: string | null;
  actor_label: string | null;
  source: string | null;
  links: LoadHistoryLink[];
};

export type LoadHistoryLinkedDocument = {
  kind: "invoice" | "factoring_advance" | "settlement_line" | "expense" | "work_order";
  id: string;
  display_id: string | null;
  status: string | null;
  amount_cents: number | null;
  occurred_at: string | null;
};

export type LoadHistoryResult = {
  load_id: string;
  load_number: string | null;
  operating_company_id: string;
  rows: LoadHistoryRow[];
  linked_documents: LoadHistoryLinkedDocument[];
};

function asIso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length ? s : null;
}

export async function getLoadHistory(
  client: DbClient,
  input: { loadId: string; operatingCompanyId: string }
): Promise<LoadHistoryResult | null> {
  const loadRes = await client.query<{
    id: string;
    load_number: string | null;
    operating_company_id: string;
  }>(
    `
      SELECT id::text, load_number::text, operating_company_id::text
      FROM mdata.loads
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [input.loadId, input.operatingCompanyId]
  );
  const load = loadRes.rows[0];
  if (!load) return null;

  const rows: LoadHistoryRow[] = [];

  // 1) Audit events scoped to this load
  const audit = await client.query<{
    uuid: string;
    created_at: string;
    event_class: string;
    payload: Record<string, unknown> | null;
    actor_user_uuid: string | null;
    source: string | null;
  }>(
    `
      SELECT uuid::text, created_at, event_class, payload, actor_user_uuid::text, source
      FROM audit.audit_events
      WHERE
        (
          payload->>'entity_type' = 'load'
          AND payload->>'entity_id' = $1
        )
        OR (
          payload->>'resource_type' = 'mdata.loads'
          AND payload->>'resource_id' = $1
        )
        OR (payload->>'load_id' = $1)
      ORDER BY created_at DESC
      LIMIT 500
    `,
    [input.loadId]
  );

  for (const ev of audit.rows) {
    const payload = ev.payload ?? {};
    const beforeAfter = (payload.before_after ?? payload.diff ?? null) as
      | Record<string, { before?: unknown; after?: unknown }>
      | null;
    const isOverride = ev.event_class.includes("lock_overrid") || ev.event_class.includes("owner_override");
    const isStatus =
      ev.event_class.includes("status") ||
      payload.from_status != null ||
      payload.to_status != null ||
      payload.new_status != null;

    if (beforeAfter && typeof beforeAfter === "object") {
      for (const [field, change] of Object.entries(beforeAfter)) {
        rows.push({
          id: `${ev.uuid}:${field}`,
          occurred_at: asIso(ev.created_at) ?? String(ev.created_at),
          kind: isOverride ? "lock_override" : "field_edit",
          summary: isOverride
            ? `Owner lock override — ${field}`
            : `Edited ${field.replace(/_/g, " ")}`,
          field,
          before_value: change?.before != null ? JSON.stringify(change.before) : null,
          after_value: change?.after != null ? JSON.stringify(change.after) : null,
          actor_user_id: ev.actor_user_uuid,
          actor_label: null,
          source: ev.source ?? ev.event_class,
          links: [
            { kind: "load", id: input.loadId, label: load.load_number },
            ...(ev.actor_user_uuid
              ? [{ kind: "user" as const, id: ev.actor_user_uuid, label: null }]
              : []),
          ],
        });
      }
      continue;
    }

    rows.push({
      id: ev.uuid,
      occurred_at: asIso(ev.created_at) ?? String(ev.created_at),
      kind: isOverride ? "lock_override" : isStatus ? "status_transition" : "audit",
      summary: ev.event_class.replace(/\./g, " · ").replace(/_/g, " "),
      field: isStatus ? "status" : null,
      before_value: str(payload.from_status ?? payload.before_status ?? null),
      after_value: str(payload.to_status ?? payload.new_status ?? payload.after_status ?? null),
      actor_user_id: ev.actor_user_uuid,
      actor_label: null,
      source: ev.source ?? ev.event_class,
      links: [
        { kind: "load", id: input.loadId, label: load.load_number },
        ...(ev.actor_user_uuid ? [{ kind: "user" as const, id: ev.actor_user_uuid, label: null }] : []),
      ],
    });
  }

  // 2) Assignment history
  const assigns = await client.query<{
    id: string;
    assigned_at: string;
    assignment_method: string | null;
    previous_driver_id: string | null;
    new_driver_id: string | null;
    previous_unit_id: string | null;
    new_unit_id: string | null;
    previous_trailer_id: string | null;
    new_trailer_id: string | null;
    assigned_by_user_id: string | null;
    reason_code: string | null;
    notes: string | null;
  }>(
    `
      SELECT id::text, assigned_at, assignment_method,
             previous_driver_id::text, new_driver_id::text,
             previous_unit_id::text, new_unit_id::text,
             previous_trailer_id::text, new_trailer_id::text,
             assigned_by_user_id::text, reason_code, notes
      FROM dispatch.load_assignment_history
      WHERE load_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY assigned_at DESC
      LIMIT 200
    `,
    [input.loadId, input.operatingCompanyId]
  );

  for (const a of assigns.rows) {
    const links: LoadHistoryLink[] = [{ kind: "load", id: input.loadId, label: load.load_number }];
    if (a.new_driver_id) links.push({ kind: "driver", id: a.new_driver_id, label: null });
    if (a.previous_driver_id) links.push({ kind: "driver", id: a.previous_driver_id, label: null });
    if (a.new_unit_id) links.push({ kind: "unit", id: a.new_unit_id, label: null });
    if (a.previous_unit_id) links.push({ kind: "unit", id: a.previous_unit_id, label: null });
    if (a.new_trailer_id) links.push({ kind: "trailer", id: a.new_trailer_id, label: null });
    if (a.previous_trailer_id) links.push({ kind: "trailer", id: a.previous_trailer_id, label: null });
    if (a.assigned_by_user_id) links.push({ kind: "user", id: a.assigned_by_user_id, label: null });

    rows.push({
      id: `assign:${a.id}`,
      occurred_at: asIso(a.assigned_at) ?? String(a.assigned_at),
      kind: "assignment",
      summary: `Assignment (${(a.assignment_method ?? "unknown").replace(/_/g, " ")})${
        a.reason_code ? ` — ${a.reason_code}` : ""
      }${a.notes ? `: ${a.notes}` : ""}`,
      field: "assignment",
      before_value: [a.previous_driver_id, a.previous_unit_id, a.previous_trailer_id].filter(Boolean).join(" / ") || null,
      after_value: [a.new_driver_id, a.new_unit_id, a.new_trailer_id].filter(Boolean).join(" / ") || null,
      actor_user_id: a.assigned_by_user_id,
      actor_label: null,
      source: "dispatch.load_assignment_history",
      links,
    });
  }

  // 3) Stop stamps + matching fence events (label = load-stop fence convention)
  const stops = await client.query<{
    id: string;
    sequence_number: number;
    stop_type: string | null;
    actual_arrival_at: string | null;
    actual_departure_at: string | null;
    actual_arrival_source: string | null;
    actual_departure_source: string | null;
    city: string | null;
    state: string | null;
  }>(
    `
      SELECT ls.id::text, ls.sequence_number, ls.stop_type::text,
             ls.actual_arrival_at, ls.actual_departure_at,
             ls.actual_arrival_source, ls.actual_departure_source,
             ls.city, ls.state
      FROM mdata.load_stops ls
      JOIN mdata.loads l ON l.id = ls.load_id AND l.operating_company_id = $2::uuid
      WHERE ls.load_id = $1::uuid
        AND (ls.status IS NULL OR ls.status::text <> 'cancelled')
      ORDER BY ls.sequence_number ASC
    `,
    [input.loadId, input.operatingCompanyId]
  );

  const fenceEvents = await client.query<{
    id: string;
    event_kind: string;
    occurred_at: string;
    geofence_label: string | null;
  }>(
    `
      SELECT ge.id::text, ge.event_kind, ge.occurred_at, g.label AS geofence_label
      FROM geo.geofence_events ge
      JOIN geo.geofences g ON g.id = ge.geofence_id
      WHERE ge.operating_company_id = $1::uuid
        AND g.operating_company_id = $1::uuid
        AND g.label LIKE $2
      ORDER BY ge.occurred_at DESC
      LIMIT 200
    `,
    [input.operatingCompanyId, `%${input.loadId}%`]
  );

  for (const s of stops.rows) {
    const place = [s.city, s.state].filter(Boolean).join(", ") || `stop ${s.sequence_number}`;
    if (s.actual_arrival_at) {
      const fence = fenceEvents.rows.find(
        (f) =>
          f.event_kind === "entered" &&
          f.geofence_label?.includes(String(s.sequence_number))
      );
      rows.push({
        id: `stop-arrive:${s.id}`,
        occurred_at: asIso(s.actual_arrival_at) ?? String(s.actual_arrival_at),
        kind: "stop_stamp",
        summary: `Arrived stop ${s.sequence_number} (${s.stop_type ?? "stop"}) — ${place}`,
        field: "actual_arrival_at",
        before_value: null,
        after_value: asIso(s.actual_arrival_at),
        actor_user_id: null,
        actor_label: null,
        source: s.actual_arrival_source ?? "not recorded",
        links: [
          { kind: "stop", id: s.id, label: `Stop ${s.sequence_number}` },
          { kind: "load", id: input.loadId, label: load.load_number },
          ...(fence
            ? [{ kind: "geofence_event" as const, id: fence.id, label: fence.event_kind }]
            : []),
        ],
      });
    } else {
      rows.push({
        id: `stop-arrive-gap:${s.id}`,
        occurred_at: asIso(new Date(0).toISOString())!,
        kind: "gap",
        summary: `Arrival stamp for stop ${s.sequence_number} — not recorded`,
        field: "actual_arrival_at",
        before_value: null,
        after_value: null,
        actor_user_id: null,
        actor_label: null,
        source: "not recorded",
        links: [
          { kind: "stop", id: s.id, label: `Stop ${s.sequence_number}` },
          { kind: "load", id: input.loadId, label: load.load_number },
        ],
      });
    }
    if (s.actual_departure_at) {
      const fence = fenceEvents.rows.find(
        (f) =>
          f.event_kind === "exited" &&
          f.geofence_label?.includes(String(s.sequence_number))
      );
      rows.push({
        id: `stop-depart:${s.id}`,
        occurred_at: asIso(s.actual_departure_at) ?? String(s.actual_departure_at),
        kind: "stop_stamp",
        summary: `Departed stop ${s.sequence_number} (${s.stop_type ?? "stop"}) — ${place}`,
        field: "actual_departure_at",
        before_value: null,
        after_value: asIso(s.actual_departure_at),
        actor_user_id: null,
        actor_label: null,
        source: s.actual_departure_source ?? "not recorded",
        links: [
          { kind: "stop", id: s.id, label: `Stop ${s.sequence_number}` },
          { kind: "load", id: input.loadId, label: load.load_number },
          ...(fence
            ? [{ kind: "geofence_event" as const, id: fence.id, label: fence.event_kind }]
            : []),
        ],
      });
    }
  }

  // 4) Linked documents (current linkage — also emitted as timeline rows when dated)
  const linked_documents: LoadHistoryLinkedDocument[] = [];

  const invoices = await client.query<{
    id: string;
    display_id: string | null;
    status: string | null;
    total_cents: string | null;
    issued_at: string | null;
    created_at: string;
  }>(
    `
      SELECT id::text, display_id, status::text,
             total_cents::text, NULL::timestamptz AS issued_at, created_at
      FROM accounting.invoices
      WHERE operating_company_id = $1::uuid
        AND source_load_id = $2::uuid
        AND voided_at IS NULL
      ORDER BY created_at DESC
    `,
    [input.operatingCompanyId, input.loadId]
  );
  for (const i of invoices.rows) {
    const doc: LoadHistoryLinkedDocument = {
      kind: "invoice",
      id: i.id,
      display_id: i.display_id,
      status: i.status,
      amount_cents: i.total_cents != null ? Number(i.total_cents) : null,
      occurred_at: asIso(i.issued_at ?? i.created_at),
    };
    linked_documents.push(doc);
    rows.push({
      id: `doc-inv:${i.id}`,
      occurred_at: doc.occurred_at ?? asIso(i.created_at)!,
      kind: "linked_document",
      summary: `Invoice ${i.display_id ?? i.id} (${i.status ?? "—"})`,
      field: null,
      before_value: null,
      after_value: null,
      actor_user_id: null,
      actor_label: null,
      source: "accounting.invoices",
      links: [
        { kind: "invoice", id: i.id, label: i.display_id },
        { kind: "load", id: input.loadId, label: load.load_number },
      ],
    });
  }

  const advances = await client.query<{
    id: string;
    display_id: string | null;
    status: string | null;
    advance_amount_cents: string | null;
    advanced_at: string | null;
    created_at: string;
  }>(
    `
      SELECT fa.id::text,
             COALESCE(fa.display_id, fa.faro_invoice_number) AS display_id,
             fa.status::text,
             fa.advance_amount_cents::text,
             fa.advanced_at,
             fa.created_at
      FROM accounting.factoring_advances fa
      WHERE fa.operating_company_id = $1::uuid
        AND fa.voided_at IS NULL
        AND fa.source_load_id = $2::uuid
      ORDER BY COALESCE(fa.advanced_at, fa.created_at) DESC
    `,
    [input.operatingCompanyId, input.loadId]
  );

  for (const a of advances.rows) {
    const doc: LoadHistoryLinkedDocument = {
      kind: "factoring_advance",
      id: a.id,
      display_id: a.display_id,
      status: a.status,
      amount_cents: a.advance_amount_cents != null ? Number(a.advance_amount_cents) : null,
      occurred_at: asIso(a.advanced_at ?? a.created_at),
    };
    linked_documents.push(doc);
    rows.push({
      id: `doc-fa:${a.id}`,
      occurred_at: doc.occurred_at ?? asIso(a.created_at)!,
      kind: "linked_document",
      summary: `Factoring advance ${a.display_id ?? a.id}`,
      field: null,
      before_value: null,
      after_value: null,
      actor_user_id: null,
      actor_label: null,
      source: "accounting.factoring_advances",
      links: [
        { kind: "factoring_advance", id: a.id, label: a.display_id },
        { kind: "load", id: input.loadId, label: load.load_number },
      ],
    });
  }

  const settlementLines = await client.query<{
    line_id: string;
    settlement_id: string;
    settlement_ref: string | null;
    amount_cents: string | null;
    created_at: string;
    status: string | null;
  }>(
    `
      SELECT sl.id::text AS line_id,
             s.id::text AS settlement_id,
             COALESCE(s.source_document_ref, s.display_id) AS settlement_ref,
             ROUND(sl.amount)::text AS amount_cents,
             sl.created_at,
             s.status::text
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements s
        ON s.id = sl.settlement_id
       AND s.operating_company_id = $1::uuid
      WHERE sl.voided_at IS NULL
        AND (
          sl.load_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM driver_finance.driver_bills b
            WHERE b.id = sl.source_driver_bill_id
              AND b.load_id = $2::uuid
              AND b.operating_company_id = $1::uuid
          )
        )
      ORDER BY sl.created_at DESC
      LIMIT 100
    `,
    [input.operatingCompanyId, input.loadId]
  );

  for (const sl of settlementLines.rows) {
    linked_documents.push({
      kind: "settlement_line",
      id: sl.line_id,
      display_id: sl.settlement_ref,
      status: sl.status,
      amount_cents: sl.amount_cents != null ? Number(sl.amount_cents) : null,
      occurred_at: asIso(sl.created_at),
    });
    rows.push({
      id: `doc-sl:${sl.line_id}`,
      occurred_at: asIso(sl.created_at)!,
      kind: "linked_document",
      summary: `Settlement line on ${sl.settlement_ref ?? sl.settlement_id}`,
      field: null,
      before_value: null,
      after_value: null,
      actor_user_id: null,
      actor_label: null,
      source: "driver_finance.settlement_lines",
      links: [
        { kind: "settlement", id: sl.settlement_id, label: sl.settlement_ref },
        { kind: "load", id: input.loadId, label: load.load_number },
      ],
    });
  }

  const expenses = await client.query<{
    id: string;
    display_id: string | null;
    status: string | null;
    amount_cents: string | null;
    incurred_on: string | null;
    created_at: string;
  }>(
    `
      SELECT id::text,
             expense_number AS display_id,
             status::text,
             total_amount_cents::text AS amount_cents,
             NULL::text AS incurred_on,
             created_at
      FROM accounting.expenses
      WHERE operating_company_id = $1::uuid
        AND load_id = $2::uuid
        AND voided_at IS NULL
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [input.operatingCompanyId, input.loadId]
  );

  for (const e of expenses.rows) {
    linked_documents.push({
      kind: "expense",
      id: e.id,
      display_id: e.display_id,
      status: e.status,
      amount_cents: e.amount_cents != null ? Number(e.amount_cents) : null,
      occurred_at: asIso(e.incurred_on ?? e.created_at),
    });
    rows.push({
      id: `doc-exp:${e.id}`,
      occurred_at: asIso(e.incurred_on ?? e.created_at)!,
      kind: "linked_document",
      summary: `Expense ${e.display_id ?? e.id}`,
      field: null,
      before_value: null,
      after_value: null,
      actor_user_id: null,
      actor_label: null,
      source: "accounting.expenses",
      links: [
        { kind: "expense", id: e.id, label: e.display_id },
        { kind: "load", id: input.loadId, label: load.load_number },
      ],
    });
  }

  const workOrders = await client.query<{
    id: string;
    display_id: string | null;
    status: string | null;
    created_at: string;
  }>(
    `
      SELECT id::text, display_id, status::text, created_at
      FROM maintenance.work_orders
      WHERE operating_company_id = $1::uuid
        AND load_id = $2::uuid
        AND voided_at IS NULL
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [input.operatingCompanyId, input.loadId]
  ).catch(() => ({ rows: [] as Array<{ id: string; display_id: string | null; status: string | null; created_at: string }> }));

  for (const wo of workOrders.rows) {
    linked_documents.push({
      kind: "work_order",
      id: wo.id,
      display_id: wo.display_id,
      status: wo.status,
      amount_cents: null,
      occurred_at: asIso(wo.created_at),
    });
    rows.push({
      id: `doc-wo:${wo.id}`,
      occurred_at: asIso(wo.created_at)!,
      kind: "linked_document",
      summary: `Work order ${wo.display_id ?? wo.id}`,
      field: null,
      before_value: null,
      after_value: null,
      actor_user_id: null,
      actor_label: null,
      source: "maintenance.work_orders",
      links: [
        { kind: "work_order", id: wo.id, label: wo.display_id },
        { kind: "load", id: input.loadId, label: load.load_number },
      ],
    });
  }

  // Drop epoch gap placeholders to the bottom visually by sorting: real times first, gaps last
  rows.sort((a, b) => {
    const aGap = a.kind === "gap" ? 1 : 0;
    const bGap = b.kind === "gap" ? 1 : 0;
    if (aGap !== bGap) return aGap - bGap;
    return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
  });

  return {
    load_id: load.id,
    load_number: load.load_number,
    operating_company_id: load.operating_company_id,
    rows,
    linked_documents,
  };
}
