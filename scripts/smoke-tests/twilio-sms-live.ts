/**
 * Twilio SMS live smoke (Block I — gated).
 *
 * Sends a **real** SMS when TWILIO_SMOKE_RECIPIENT is set.
 *
 * Prerequisites:
 * - TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER (or TWILIO_SMS_FROM / TWILIO_FROM)
 * - TWILIO_SMOKE_RECIPIENT (E.164-ish; normalization handled by sender)
 *
 * Skip modes:
 * - Missing TWILIO_SMOKE_RECIPIENT → exits 0 (SKIP)
 */
import { sendSms } from "../../apps/backend/src/sms/sender.js";

async function main() {
  const to = process.env.TWILIO_SMOKE_RECIPIENT?.trim();
  if (!to) {
    console.log("[twilio sms smoke] SKIP: TWILIO_SMOKE_RECIPIENT is not set");
    process.exit(0);
  }

  const body = `IH35 TMS Twilio SMS smoke test (${new Date().toISOString()})`;
  const result = await sendSms({ to, body });

  if (!result.success) {
    console.error("[twilio sms smoke] FAILED", result.error ?? "unknown_error");
    process.exit(1);
  }

  if (!result.sid) {
    console.error("[twilio sms smoke] FAILED: missing Twilio SID on success response");
    process.exit(1);
  }

  console.log("[twilio sms smoke] OK", { sid: result.sid });
}

main().catch((error) => {
  console.error("[twilio sms smoke] UNHANDLED", String((error as Error)?.message ?? error));
  process.exit(1);
});
