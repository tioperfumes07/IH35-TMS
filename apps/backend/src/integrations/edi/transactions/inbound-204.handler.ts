/**
 * GAP-70 — Inbound X12 204 Load Tender handler.
 * Parses tender envelope and creates dispatch.loads in PENDING state.
 */

import type { DbClient } from "../setup.service.js";

export type Parsed204Load = {
  broker_ref: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  commodity: string | null;
  rate_cents: number | null;
  pickup_date: string | null;
};

export type Inbound204Result = {
  message_uuid: string;
  load_uuid: string | null;
  parsed: Parsed204Load;
  status: "processed" | "failed";
  error_message?: string;
};

function segmentValue(segment: string, index: number): string | null {
  const parts = segment.split("*");
  return parts[index]?.trim() || null;
}

export function parseX12204Payload(raw: string): Parsed204Load {
  const segments = raw.replace(/\r\n/g, "\n").split(/[~|\n]/).map((s) => s.trim()).filter(Boolean);
  let brokerRef: string | null = null;
  let pickupCity: string | null = null;
  let pickupState: string | null = null;
  let deliveryCity: string | null = null;
  let deliveryState: string | null = null;
  let commodity: string | null = null;
  let rateCents: number | null = null;
  let pickupDate: string | null = null;

  for (const seg of segments) {
    const tag = seg.split("*")[0] ?? "";
    if (tag === "B2" && !brokerRef) {
      brokerRef = segmentValue(seg, 4) ?? segmentValue(seg, 2);
    }
    if (tag === "G62") {
      pickupDate = segmentValue(seg, 2);
    }
    if (tag === "N1") {
      const entity = segmentValue(seg, 1);
      const city = segmentValue(seg, 3);
      const state = segmentValue(seg, 4);
      if (entity === "SH" || entity === "SF") {
        pickupCity = city;
        pickupState = state;
      }
      if (entity === "CN" || entity === "ST") {
        deliveryCity = city;
        deliveryState = state;
      }
    }
    if (tag === "L5" && !commodity) {
      commodity = segmentValue(seg, 2);
    }
    if (tag === "L3" && rateCents == null) {
      const dollars = Number(segmentValue(seg, 1));
      if (Number.isFinite(dollars)) rateCents = Math.round(dollars * 100);
    }
  }

  return {
    broker_ref: brokerRef,
    pickup_city: pickupCity,
    pickup_state: pickupState,
    delivery_city: deliveryCity,
    delivery_state: deliveryState,
    commodity,
    rate_cents: rateCents,
    pickup_date: pickupDate,
  };
}

export function extractControlNumber(raw: string): string {
  const isa = raw.split(/[~|\n]/).find((s) => s.startsWith("ISA*"));
  if (!isa) return `CTL-${Date.now()}`;
  const parts = isa.split("*");
  return parts[13]?.trim() || `CTL-${Date.now()}`;
}

export async function handleInbound204(
  client: DbClient,
  params: {
    operating_company_id: string;
    partner_uuid: string;
    raw_payload: string;
  }
): Promise<Inbound204Result> {
  const controlNumber = extractControlNumber(params.raw_payload);
  let parsed: Parsed204Load;
  try {
    parsed = parseX12204Payload(params.raw_payload);
  } catch (err) {
    const messageUuid = await insertMessage(client, {
      ...params,
      control_number: controlNumber,
      parsed_payload: null,
      status: "failed",
      error_message: err instanceof Error ? err.message : "parse_failed",
      related_load_uuid: null,
    });
    return {
      message_uuid: messageUuid,
      load_uuid: null,
      parsed: {
        broker_ref: null,
        pickup_city: null,
        pickup_state: null,
        delivery_city: null,
        delivery_state: null,
        commodity: null,
        rate_cents: null,
        pickup_date: null,
      },
      status: "failed",
      error_message: err instanceof Error ? err.message : "parse_failed",
    };
  }

  let loadUuid: string | null = null;
  try {
    loadUuid = await createDraftLoadFrom204(client, {
      operating_company_id: params.operating_company_id,
      parsed,
      customer_id: null,
    });
  } catch (err) {
    const messageUuid = await insertMessage(client, {
      ...params,
      control_number: controlNumber,
      parsed_payload: parsed,
      status: "failed",
      error_message: err instanceof Error ? err.message : "load_create_failed",
      related_load_uuid: null,
    });
    return {
      message_uuid: messageUuid,
      load_uuid: null,
      parsed,
      status: "failed",
      error_message: err instanceof Error ? err.message : "load_create_failed",
    };
  }

  const messageUuid = await insertMessage(client, {
    ...params,
    control_number: controlNumber,
    parsed_payload: parsed,
    status: "processed",
    error_message: null,
    related_load_uuid: loadUuid,
  });

  return {
    message_uuid: messageUuid,
    load_uuid: loadUuid,
    parsed,
    status: "processed",
  };
}

async function insertMessage(
  client: DbClient,
  params: {
    operating_company_id: string;
    partner_uuid: string;
    raw_payload: string;
    control_number: string;
    parsed_payload: Parsed204Load | null;
    status: "processed" | "failed";
    error_message: string | null;
    related_load_uuid: string | null;
  }
): Promise<string> {
  const res = await client.query<{ uuid: string }>(
    `
      INSERT INTO integrations.edi_messages (
        operating_company_id,
        partner_uuid,
        transaction_type,
        direction,
        control_number,
        payload,
        parsed_payload,
        related_load_uuid,
        status,
        error_message,
        processed_at
      )
      VALUES ($1, $2, '204', 'inbound', $3, $4, $5::jsonb, $6, $7, $8, now())
      RETURNING uuid
    `,
    [
      params.operating_company_id,
      params.partner_uuid,
      params.control_number,
      params.raw_payload,
      params.parsed_payload ? JSON.stringify(params.parsed_payload) : null,
      params.related_load_uuid,
      params.status === "processed" ? "processed" : "failed",
      params.error_message,
    ]
  );
  return res.rows[0]!.uuid;
}

/** Creates a draft mdata.loads row for dispatcher review (EDI 204 tender). */
export async function createDraftLoadFrom204(
  client: DbClient,
  params: {
    operating_company_id: string;
    parsed: Parsed204Load;
    customer_id: string | null;
    load_number?: string;
  }
): Promise<string | null> {
  if (!params.customer_id) {
    return null;
  }
  const loadNumber =
    params.load_number ??
    `EDI-${params.parsed.broker_ref ?? Date.now().toString(36).toUpperCase()}`;
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO mdata.loads (
        operating_company_id,
        load_number,
        customer_id,
        status,
        rate_total_cents,
        currency_code,
        notes,
        customer_wo_number
      )
      VALUES ($1, $2, $3, 'draft', $4, 'USD', $5, $6)
      RETURNING id
    `,
    [
      params.operating_company_id,
      loadNumber,
      params.customer_id,
      params.parsed.rate_cents ?? 0,
      params.parsed.commodity ? `EDI 204 tender: ${params.parsed.commodity}` : "EDI 204 tender",
      params.parsed.broker_ref,
    ]
  );
  const loadId = res.rows[0]?.id ?? null;
  if (!loadId) return null;

  if (params.parsed.pickup_city || params.parsed.pickup_state) {
    await client.query(
      `
        INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, city, state, status)
        VALUES ($1, 1, 'pickup', $2, $3, 'pending')
      `,
      [loadId, params.parsed.pickup_city, params.parsed.pickup_state]
    );
  }
  if (params.parsed.delivery_city || params.parsed.delivery_state) {
    await client.query(
      `
        INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, city, state, status)
        VALUES ($1, 2, 'delivery', $2, $3, 'pending')
      `,
      [loadId, params.parsed.delivery_city, params.parsed.delivery_state]
    );
  }

  return loadId;
}
