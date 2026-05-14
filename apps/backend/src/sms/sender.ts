function normalizeSmsRecipient(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export async function sendSms(input: {
  to: string;
  body: string;
}): Promise<{ success: boolean; sid?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from =
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    process.env.TWILIO_SMS_FROM?.trim() ||
    process.env.TWILIO_FROM?.trim();

  if (!accountSid || !authToken || !from) {
    console.warn("[sms] missing Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER); skipping SMS send");
    return { success: false, error: "twilio_not_configured" };
  }

  const to = normalizeSmsRecipient(input.to);
  if (!to) {
    return { success: false, error: "sms_missing_recipient" };
  }

  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: input.body,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        typeof json.message === "string" ? json.message : `twilio_http_${response.status}`;
      console.warn("[sms] Twilio send failed", { status: response.status, message, json });
      return { success: false, error: message };
    }

    const sid = typeof json.sid === "string" ? json.sid : undefined;
    return { success: true, sid };
  } catch (error) {
    const message = String((error as Error)?.message ?? "twilio_fetch_failed");
    console.warn("[sms] fetch error", message);
    return { success: false, error: message };
  }
}
