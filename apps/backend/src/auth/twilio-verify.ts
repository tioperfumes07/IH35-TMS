import Twilio from "twilio";
import { isFeatureDisabled } from "../config/required-env.js";

export type TwilioChannel = "whatsapp" | "sms";

let cachedClient: ReturnType<typeof Twilio> | null = null;

export function resetTwilioClientForTests() {
  cachedClient = null;
}

function readTwilioConfig() {
  const sid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  const verifyServiceSid = (process.env.TWILIO_VERIFY_SERVICE_SID ?? "").trim();
  return { sid, token, verifyServiceSid };
}

export function getTwilioClient() {
  if (cachedClient) return cachedClient;
  const { sid, token } = readTwilioConfig();
  if (!sid || !token || !sid.startsWith("AC")) {
    return null;
  }
  cachedClient = Twilio(sid, token);
  return cachedClient;
}

export function isTwilioVerifyConfigured() {
  if (isFeatureDisabled("phone_auth")) return false;
  const { verifyServiceSid } = readTwilioConfig();
  return Boolean(getTwilioClient() && verifyServiceSid);
}

export async function startVerification(phone: string, channel: TwilioChannel = "whatsapp") {
  const client = getTwilioClient();
  const { verifyServiceSid } = readTwilioConfig();
  if (!client || !verifyServiceSid || isFeatureDisabled("phone_auth")) {
    throw new Error("twilio_not_configured");
  }
  try {
    const verification = await client.verify.v2.services(verifyServiceSid).verifications.create({
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
  const client = getTwilioClient();
  const { verifyServiceSid } = readTwilioConfig();
  if (!client || !verifyServiceSid || isFeatureDisabled("phone_auth")) {
    throw new Error("twilio_not_configured");
  }
  try {
    const verificationCheck = await client.verify.v2.services(verifyServiceSid).verificationChecks.create({
      to: phone,
      code,
    });
    return { status: verificationCheck.status, valid: verificationCheck.status === "approved" };
  } catch (err) {
    const error = err as { code?: number; message?: string };
    throw new Error(`twilio_check_failed:${error.code ?? "unknown"}:${error.message ?? ""}`);
  }
}
