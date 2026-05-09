import { sendEmail } from "../notifications/email.service.js";

function verificationCodeHtml(code: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:20px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
      <h1 style="margin:0 0 12px;font-size:20px;">IH 35 Driver Login Code</h1>
      <p style="margin:0 0 12px;">Use this code to finish signing in to the IH 35 Driver App:</p>
      <p style="margin:0 0 12px;font-size:28px;font-weight:700;letter-spacing:2px;">${code}</p>
      <p style="margin:0;font-size:13px;color:#4b5563;">This code expires in 10 minutes. If you did not request it, ignore this email.</p>
    </div>
  </body>
</html>`;
}

export async function sendEmailCode(to: string, code: string, actorUserId: string | null) {
  await sendEmail({
    to,
    subject: "Your IH 35 Driver Login Code",
    html: verificationCodeHtml(code),
    text: `Your IH 35 Driver login code is ${code}. It expires in 10 minutes.`,
    sender: "noreply",
    tags: [{ name: "type", value: "driver_login_code" }],
    eventClass: "auth.email.verification_started",
    actorUserId,
  });
}
