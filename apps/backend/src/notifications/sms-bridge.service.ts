import { sendSms } from "../sms/sender.js";

export type SmsBridgeResult = {
  success: boolean;
  sid?: string;
  error?: string;
  skipped?: boolean;
};

/** Outbound SMS bridge for driver profile messages (Twilio when configured). */
export async function bridgeDriverSms(input: { to: string; body: string }): Promise<SmsBridgeResult> {
  const result = await sendSms({ to: input.to, body: input.body });
  if (result.error === "twilio_not_configured") {
    return { success: false, skipped: true, error: result.error };
  }
  return result;
}
