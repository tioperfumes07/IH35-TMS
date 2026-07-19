import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./registry.js";
import { PermanentDeliveryError } from "../delivery-errors.js";
import { verifyCustomerWithSafer } from "../../integrations/fmcsa/safer.service.js";
import { isFmcsaPermanentError, isRetryableFmcsaError } from "../../integrations/fmcsa/errors.js";

function requireUuid(value: unknown, field: string): string {
  const trimmed = String(value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) {
    throw new PermanentDeliveryError(`${field}_invalid_uuid`);
  }
  return trimmed;
}

export class FmcsaCustomerVerifyHandler implements OutboxEventHandler {
  // Literal required for verify-outbox-handler-parity static scan.
  eventType = "fmcsa.customer.verify_requested" as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operatingCompanyId = requireUuid(payload.operating_company_id, "operating_company_id");
    const customerId = requireUuid(payload.customer_id, "customer_id");
    const actorUserId = requireUuid(payload.actor_user_id, "actor_user_id");

    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

    const scoped = await ctx.client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM mdata.customers
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [customerId, operatingCompanyId]
    );
    if (!scoped.rows[0]) {
      throw new PermanentDeliveryError("fmcsa_customer_missing_or_cross_tenant");
    }

    try {
      const result = await verifyCustomerWithSafer({
        customerId,
        actorUserId,
        force: true,
        operatingCompanyId,
      });

      if (result.reason === "not_found") {
        throw new PermanentDeliveryError("fmcsa_customer_not_found");
      }

      ctx.log("fmcsa.customer.verify_requested delivered", {
        eventId: ctx.eventId,
        customerId,
        operatingCompanyId,
        reason: result.reason,
      });

      return {
        message: `fmcsa_verify_${result.reason}`,
      };
    } catch (error) {
      if (isRetryableFmcsaError(error)) {
        throw error;
      }
      if (error instanceof PermanentDeliveryError) {
        throw error;
      }
      if (isFmcsaPermanentError(error)) {
        throw new PermanentDeliveryError(String((error as Error)?.message ?? error));
      }
      // Unexpected non-retryable — fail closed visibly (no silent drop).
      throw new PermanentDeliveryError(String((error as Error)?.message ?? error));
    }
  }
}
