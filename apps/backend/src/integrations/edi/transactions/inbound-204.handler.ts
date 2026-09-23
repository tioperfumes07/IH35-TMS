/**
 * GAP-70 — Inbound X12 204 Load Tender handler.
 * Parses tender envelope and creates dispatch.loads in PENDING state.
 *
 * E6 (Lead ruling, 2026-09-22 / Round 84): this handler used to write rows into mdata.loads (an INSERT) and
 * mdata.load_stops directly, one of the 4 offenders verify-one-load-create-path.mjs's own
 * shrink-only ratchet named at seed. Rewired below to call createLoadWithFullSideEffects, the
 * ONE shared create path every feed must go through -- every INSERT/resolver/gate that path
 * calls now applies here too, not just to the interactive Book Load wizard.
 */

import type { DbClient } from "../setup.service.js";
import { createLoadWithFullSideEffects, type BookLoadStop } from "../../../dispatch/book-load.service.js";

// A real, live identity.users row (migration 202614200000, this session) -- a genuine
// service-account actor for machine-origin writes, EDI 204 named explicitly in its own
// purpose text. "Machine caller gets a NEW system actor, don't borrow a human user" (Round 84).
const EDI_SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

export type Parsed204Load = {
  broker_ref: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  // The N1 loop's own Name field (position 2, between the entity code and city in this parser's
  // simplified indexing) -- the actual facility/consignee name, not just city/state. "A stop fed
  // with a city and no consignee is not done" (Round 84 P0).
  pickup_name: string | null;
  delivery_name: string | null;
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
  let pickupName: string | null = null;
  let deliveryName: string | null = null;
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
      // This parser's own established indexing (city at 3, state at 4) leaves position 2 as the
      // N1 loop's Name field -- the actual facility/consignee name.
      const name = segmentValue(seg, 2);
      const city = segmentValue(seg, 3);
      const state = segmentValue(seg, 4);
      if (entity === "SH" || entity === "SF") {
        pickupName = name;
        pickupCity = city;
        pickupState = state;
      }
      if (entity === "CN" || entity === "ST") {
        deliveryName = name;
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
    pickup_name: pickupName,
    delivery_name: deliveryName,
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
        pickup_name: null,
        delivery_name: null,
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

/**
 * Creates a draft mdata.loads row for dispatcher review (EDI 204 tender).
 *
 * E6 (Lead ruling, 2026-09-22 / Round 84): rewired from a direct INSERT of mdata.loads rows /
 * mdata.load_stops to the ONE shared create path, createLoadWithFullSideEffects. This is
 * genuinely live, real-time data (a real tender just arrived over EDI) -- source is
 * "live_feed", never "historical_backfill". The actor is EDI_SYSTEM_USER_ID, a real
 * identity.users service-account row (not a borrowed human session), per Round 84's explicit
 * answer: "machine caller gets a NEW system actor, don't borrow a human user."
 */
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

  const stops: BookLoadStop[] = [];
  if (params.parsed.pickup_city || params.parsed.pickup_state || params.parsed.pickup_name) {
    stops.push({
      stop_type: "pickup",
      sequence_number: 1,
      facility_name: params.parsed.pickup_name ?? undefined,
      city: params.parsed.pickup_city ?? undefined,
      state: params.parsed.pickup_state ?? undefined,
    });
  }
  if (params.parsed.delivery_city || params.parsed.delivery_state || params.parsed.delivery_name) {
    stops.push({
      stop_type: "delivery",
      sequence_number: stops.length + 1,
      facility_name: params.parsed.delivery_name ?? undefined,
      city: params.parsed.delivery_city ?? undefined,
      state: params.parsed.delivery_state ?? undefined,
    });
  }

  const result = await createLoadWithFullSideEffects(
    client,
    {
      requestingUserUuid: EDI_SYSTEM_USER_ID,
      requestingUserRole: "system",
      operating_company_id: params.operating_company_id,
      customer_id: params.customer_id,
      // 'draft' save_mode maps to mdata.loads.status='draft' regardless of this value (see
      // statusForInsert inside createLoadWithFullSideEffects); 'unassigned' is a real
      // mdata.load_status_enum member, used here only to satisfy the required field honestly.
      status: "unassigned",
      save_mode: "draft",
      requested_load_number: loadNumber,
      commodity: params.parsed.commodity ?? undefined,
      notes: params.parsed.commodity ? `EDI 204 tender: ${params.parsed.commodity}` : "EDI 204 tender",
      // The original direct-INSERT wrote broker_ref into customer_wo_number -- preserved
      // exactly, byte-for-byte behavior, not a new mapping decision.
      customer_wo_number: params.parsed.broker_ref ?? undefined,
      // mdata.loads.rate_total_cents is computed from charges (summed), not a direct input
      // field -- the L3 segment's rate becomes a real LINEHAUL charge line rather than being
      // silently dropped, matching what the original direct-INSERT wrote into that column.
      charges:
        params.parsed.rate_cents != null
          ? [{ code: "LINEHAUL", amount_cents: params.parsed.rate_cents }]
          : [],
      stops,
    },
    { source: "live_feed" }
  );

  if (result.kind !== "ok") return null;
  return String(result.row.id ?? "") || null;
}
