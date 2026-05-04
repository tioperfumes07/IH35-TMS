import Twilio from "twilio";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
  console.warn("Twilio env vars missing — phone auth will not function until configured.");
}

const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

export type TwilioChannel = "whatsapp" | "sms";

export async function startVerification(phone: string, channel: TwilioChannel = "whatsapp") {
  if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID) {
    throw new Error("twilio_not_configured");
  }
  try {
    const verification = await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verifications.create({
      to: phone,
      channel,
    });
    return { sid: verification.sid, status: verification.status, channel };
  } catch (err) {
    const error = err as { code?: number; message?: string };
    throw new Error(`twilio_send_failed:${error.code ?? "unknown"}:${error.message ?? ""}`);
  }
}

export async function checkVerification(phone: string, code: string) {
  if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID) {
    throw new Error("twilio_not_configured");
  }
  try {
    const verificationCheck = await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verificationChecks.create({
      to: phone,
      code,
    });
    return { status: verificationCheck.status, valid: verificationCheck.status === "approved" };
  } catch (err) {
    const error = err as { code?: number; message?: string };
    throw new Error(`twilio_check_failed:${error.code ?? "unknown"}:${error.message ?? ""}`);
  }
}
