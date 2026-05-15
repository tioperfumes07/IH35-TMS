/**
 * WhatsApp Cloud API live smoke (Block I — gated).
 *
 * This stays **disabled by default** until Meta business verification is complete:
 * - WHATSAPP_BUSINESS_VERIFIED must be exactly "true" to attempt a live send.
 *
 * Prerequisites (when enabled):
 * - WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID
 * - WHATSAPP_SMOKE_RECIPIENT (digits / E.164-ish as supported by sender normalization)
 *
 * Skip modes:
 * - WHATSAPP_BUSINESS_VERIFIED !== "true" → exits 0 (SKIP)
 * - Missing WHATSAPP_SMOKE_RECIPIENT → exits 0 (SKIP)
 */
import { sendWhatsAppMessage } from "../../apps/backend/src/whatsapp/sender.js";

async function main() {
  if (process.env.WHATSAPP_BUSINESS_VERIFIED !== "true") {
    console.log("[whatsapp smoke] SKIP: WHATSAPP_BUSINESS_VERIFIED is not 'true' (Meta approval pending)");
    process.exit(0);
  }

  const to = process.env.WHATSAPP_SMOKE_RECIPIENT?.trim();
  if (!to) {
    console.log("[whatsapp smoke] SKIP: WHATSAPP_SMOKE_RECIPIENT is not set");
    process.exit(0);
  }

  const result = await sendWhatsAppMessage({
    to,
    template_name: "ih35_settlement_ready_v1",
    variables: {
      settlement_no: "SMOKE",
      net: "0.00",
      link: "https://example.test",
    },
  });

  if (!result.success) {
    console.error("[whatsapp smoke] FAILED", result.error ?? "unknown_error");
    process.exit(1);
  }

  console.log("[whatsapp smoke] OK", { message_id: result.message_id ?? null });
}

main().catch((error) => {
  console.error("[whatsapp smoke] UNHANDLED", String((error as Error)?.message ?? error));
  process.exit(1);
});
