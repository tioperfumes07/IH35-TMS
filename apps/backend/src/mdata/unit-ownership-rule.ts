/**
 * ENG-54 UNIT OWNERSHIP ENGINE — the HTTP face of the row rule in
 * db/migrations/202616570100_unit_lease_owner_asset_holder_engine.sql:
 *   a unit leased to an operating carrier must be owned by an asset holder (IH 35 Trucking LLC).
 * The trigger refuses every writer; this maps its refusal to a 422 the unit screens can show.
 */
import type { FastifyReply } from "fastify";

export const UNIT_OWNER_MUST_BE_ASSET_HOLDER = "unit_owner_must_be_asset_holder";

export const UNIT_OWNER_MUST_BE_ASSET_HOLDER_MESSAGE =
  "A truck leased to an operating carrier must be owned by the asset holder (IH 35 Trucking LLC). Set Owner Company to IH 35 Trucking LLC.";

export function isUnitOwnershipViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return Boolean(e && e.code === "P0001" && e.message === UNIT_OWNER_MUST_BE_ASSET_HOLDER);
}

export function sendUnitOwnershipViolation(reply: FastifyReply, err: unknown) {
  const detail = (err as { detail?: string } | null)?.detail ?? null;
  return reply.code(422).send({
    error: UNIT_OWNER_MUST_BE_ASSET_HOLDER,
    message: UNIT_OWNER_MUST_BE_ASSET_HOLDER_MESSAGE,
    detail,
  });
}
