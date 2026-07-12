import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { sendEmail } from "../notifications/email.service.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { resolveDefaultAchToken } from "./driver-payment-methods.service.js";

type PaymentState = "unpaid" | "queued" | "sent_to_bank" | "cleared" | "bounced" | "manual_paid";
type PaymentEventType = "queued" | "sent" | "cleared" | "bounced" | "retried" | "marked_paid_manually";

type SettlementRow = {
  id: string;
  operating_company_id: string;
  driver_id: string | null;
  status: string;
  payment_state: PaymentState | null;
  payment_method: string | null;
  payment_bank_reference: string | null;
};

function settlementPaymentState(settlement: SettlementRow): PaymentState {
  return (settlement.payment_state ?? "unpaid") as PaymentState;
}

function hashPayload(input: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

// CHAIN-07 root cause: driver_finance.driver_settlements carries FORCE ROW LEVEL SECURITY
// (policy requires operating_company_id = current_setting('app.operating_company_id')). Every
// caller below used to look the settlement up by id ALONE, BEFORE the GUC was set (the GUC was
// only learned by reading the very row RLS was blocking) -- a chicken-and-egg that made every
// settlement-payment action (queue/mark-sent/mark-cleared/mark-bounced/mark-paid-manually, and
// the auto-queue-on-finalize call) throw settlement_not_found for every settlement, every time,
// regardless of validity. Fix: callers now receive operating_company_id explicitly (from the
// route, same as every other driver_finance route) and set the GUC BEFORE this lookup, and this
// lookup scopes by BOTH id and operating_company_id (defense in depth beyond RLS alone).
async function loadSettlement(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  settlementId: string,
  operatingCompanyId: string
) {
  const res = await client.query<SettlementRow>(
    `
      SELECT id, operating_company_id, driver_id, status, payment_state, payment_method, payment_bank_reference
      FROM driver_finance.driver_settlements
      WHERE id = $1
        AND operating_company_id = $2
      LIMIT 1
    `,
    [settlementId, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

async function appendPaymentEvent(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  settlement: SettlementRow,
  eventType: PaymentEventType,
  userId: string,
  payload: Record<string, unknown> | null = null
) {
  await client.query(
    `
      INSERT INTO driver_finance.settlement_payment_events (
        settlement_id,
        operating_company_id,
        event_type,
        payload,
        user_id,
        created_at
      )
      VALUES ($1,$2,$3,$4::jsonb,$5,now())
    `,
    [settlement.id, settlement.operating_company_id, eventType, JSON.stringify(payload ?? {}), userId]
  );
}

async function ownerEmailsForCompany(operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ email: string }>(
      `
        SELECT DISTINCT lower(u.email) AS email
        FROM identity.users u
        JOIN org.user_company_access uca ON uca.user_id = u.id
        WHERE u.role = 'Owner'
          AND u.deactivated_at IS NULL
          AND u.email IS NOT NULL
          AND uca.company_id = $1
      `,
      [operatingCompanyId]
    );
    return res.rows.map((row) => row.email).filter(Boolean);
  });
}

// A driver is "bank configured" for ACH when they have an active default ACH method with a token in the
// canonical store (driver_finance.driver_payment_methods). This replaces a probe against mdata.drivers
// direct-deposit token columns that never existed (so ACH could never be queued). Flag-gated
// (DRIVER_PAYMENT_METHODS_ENABLED, per-entity default OFF) and expand/contract-safe (resolveDefaultAchToken
// no-ops if the flag is OFF or the HELD table isn't migrated), so default behavior is unchanged until the
// owner flips the flag per entity.
async function hasDriverBankToken(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  driverId: string | null,
  operatingCompanyId: string
) {
  if (!driverId) return false;
  const token = await resolveDefaultAchToken(client, operatingCompanyId, driverId);
  return token != null;
}

function validateTransition(current: PaymentState, next: PaymentState) {
  const allowed: Record<PaymentState, PaymentState[]> = {
    unpaid: ["queued", "manual_paid"],
    queued: ["sent_to_bank", "manual_paid", "bounced"],
    sent_to_bank: ["cleared", "bounced"],
    cleared: [],
    bounced: ["queued", "manual_paid"],
    manual_paid: [],
  };
  return allowed[current].includes(next);
}

export async function queuePayment(settlementId: string, operatingCompanyId: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    // GUC must be set BEFORE the lookup -- driver_settlements is FORCE RLS (see loadSettlement).
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId);
    if (!settlement) throw new Error("settlement_not_found");

    if (!(settlement.status === "locked" || settlement.status === "final")) {
      throw new Error("settlement_must_be_final");
    }
    const currentState = settlementPaymentState(settlement);
    if (!validateTransition(currentState, "queued")) {
      throw new Error("invalid_payment_state_transition");
    }

    const bankConfigured = await hasDriverBankToken(client, settlement.driver_id, operatingCompanyId);
    if (!bankConfigured && (settlement.payment_method ?? "") !== "check") {
      throw new Error("driver_bank_configuration_required");
    }

    const updateRes = await client.query<SettlementRow>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'queued',
            payment_queued_at = now(),
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id, operating_company_id, driver_id, status, payment_state, payment_method, payment_bank_reference
      `,
      [settlement.id, settlement.operating_company_id]
    );
    const updated = updateRes.rows[0];
    if (!updated) throw new Error("settlement_payment_queue_failed");

    await appendPaymentEvent(client, updated, "queued", userId, { previous_state: currentState });
    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.payment_queued",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
      },
      "info",
      "P5-T5-SETTLEMENT-PAYMENT"
    );
    return updated;
  });
}

export async function markSentToBank(settlementId: string, operatingCompanyId: string, bankReference: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId);
    if (!settlement) throw new Error("settlement_not_found");
    const currentState = settlementPaymentState(settlement);
    if (!validateTransition(currentState, "sent_to_bank")) {
      throw new Error("invalid_payment_state_transition");
    }

    const updateRes = await client.query<SettlementRow>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'sent_to_bank',
            payment_sent_at = now(),
            payment_bank_reference = $3,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id, operating_company_id, driver_id, status, payment_state, payment_method, payment_bank_reference
      `,
      [settlement.id, settlement.operating_company_id, bankReference]
    );
    const updated = updateRes.rows[0];
    if (!updated) throw new Error("settlement_payment_sent_failed");
    await appendPaymentEvent(client, updated, "sent", userId, { bank_reference: bankReference });
    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.payment_sent",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
        bank_reference: bankReference,
      },
      "info",
      "P5-T5-SETTLEMENT-PAYMENT"
    );
    return updated;
  });
}

export async function markCleared(settlementId: string, operatingCompanyId: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId);
    if (!settlement) throw new Error("settlement_not_found");
    const currentState = settlementPaymentState(settlement);
    if (!validateTransition(currentState, "cleared")) {
      throw new Error("invalid_payment_state_transition");
    }

    const updateRes = await client.query<SettlementRow>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'cleared',
            payment_cleared_at = now(),
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id, operating_company_id, driver_id, status, payment_state, payment_method, payment_bank_reference
      `,
      [settlement.id, settlement.operating_company_id]
    );
    const updated = updateRes.rows[0];
    if (!updated) throw new Error("settlement_payment_cleared_failed");
    await appendPaymentEvent(client, updated, "cleared", userId, {});

    const payloadHash = hashPayload({
      settlement_id: updated.id,
      payment_state: updated.payment_state,
      payment_bank_reference: updated.payment_bank_reference,
    });
    await enqueueSyncJob(updated.operating_company_id, "settlement", updated.id, payloadHash, userId);

    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.payment_cleared",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
      },
      "info",
      "P5-T5-SETTLEMENT-PAYMENT"
    );
    return updated;
  });
}

export async function markBounced(settlementId: string, operatingCompanyId: string, reason: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId);
    if (!settlement) throw new Error("settlement_not_found");
    const currentState = settlementPaymentState(settlement);
    if (!validateTransition(currentState, "bounced")) {
      throw new Error("invalid_payment_state_transition");
    }

    const updateRes = await client.query<SettlementRow>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'bounced',
            payment_bounced_reason = $3,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id, operating_company_id, driver_id, status, payment_state, payment_method, payment_bank_reference
      `,
      [settlement.id, settlement.operating_company_id, reason]
    );
    const updated = updateRes.rows[0];
    if (!updated) throw new Error("settlement_payment_bounced_failed");
    await appendPaymentEvent(client, updated, "bounced", userId, { reason });

    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.payment_bounced",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
        reason,
      },
      "warning",
      "P5-T5-SETTLEMENT-PAYMENT"
    );

    const ownerEmails = await ownerEmailsForCompany(updated.operating_company_id);
    if (ownerEmails.length > 0) {
      await sendEmail({
        to: ownerEmails,
        subject: `[IH 35 TMS] Settlement payment bounced (${updated.id})`,
        sender: "noreply",
        html: `<p>Settlement payment bounced.</p><p>Settlement: ${updated.id}</p><p>Reason: ${reason}</p>`,
        text: `Settlement payment bounced. Settlement: ${updated.id}. Reason: ${reason}.`,
        eventClass: "driver_pay.settlement.payment_bounced",
        actorUserId: userId,
      }).catch(() => undefined);
    }

    return updated;
  });
}

export async function markPaidManually(
  settlementId: string,
  operatingCompanyId: string,
  paymentMethod: string,
  reference: string | null,
  userId: string
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId);
    if (!settlement) throw new Error("settlement_not_found");
    const currentState = settlementPaymentState(settlement);
    if (!validateTransition(currentState, "manual_paid")) {
      throw new Error("invalid_payment_state_transition");
    }

    const updateRes = await client.query<SettlementRow>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'manual_paid',
            payment_method = $3,
            payment_bank_reference = $4,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id, operating_company_id, driver_id, status, payment_state, payment_method, payment_bank_reference
      `,
      [settlement.id, settlement.operating_company_id, paymentMethod, reference]
    );
    const updated = updateRes.rows[0];
    if (!updated) throw new Error("settlement_mark_manual_paid_failed");
    await appendPaymentEvent(client, updated, "marked_paid_manually", userId, { payment_method: paymentMethod, reference });

    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.marked_paid_manually",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
        payment_method: paymentMethod,
        reference,
      },
      "info",
      "P5-T5-SETTLEMENT-PAYMENT"
    );
    return updated;
  });
}

export async function queuePaymentOnFinalize(settlementId: string, operatingCompanyId: string, userId: string) {
  // NOTE: this used to `return withCurrentUser(...)` as its first statement, which made the
  // `try { await queuePayment(...) }` block below permanently unreachable dead code -- the
  // auto-queue-on-finalize feature never actually queued a payment even when a company had
  // auto_queue_settlement_payments=true. Fixed: await the enabled-check, THEN conditionally call
  // queuePayment in its own transaction (queuePayment opens its own withCurrentUser scope).
  const enabled = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId);
    if (!settlement) throw new Error("settlement_not_found");
    const companyRes = await client.query<{ auto_queue_settlement_payments: boolean }>(
      `SELECT auto_queue_settlement_payments FROM org.companies WHERE id = $1 LIMIT 1`,
      [operatingCompanyId]
    );
    return Boolean(companyRes.rows[0]?.auto_queue_settlement_payments);
  });
  if (!enabled) return { queued: false, reason: "auto_queue_disabled" as const };

  try {
    await queuePayment(settlementId, operatingCompanyId, userId);
    return { queued: true as const };
  } catch (error) {
    return { queued: false as const, reason: String((error as Error)?.message ?? "queue_payment_failed") };
  }
}

export async function listPaymentEvents(settlementId: string, operatingCompanyId: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query(
      `
        SELECT id, settlement_id, operating_company_id, event_type, payload, user_id, created_at
        FROM driver_finance.settlement_payment_events
        WHERE settlement_id = $1
          AND operating_company_id = $2
        ORDER BY created_at ASC
      `,
      [settlementId, operatingCompanyId]
    );
    return res.rows;
  });
}

