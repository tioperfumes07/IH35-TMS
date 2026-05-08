export async function sendEmailCode(to: string, code: string) {
  // TODO(P3-T11.15.7): integrate SendGrid/Postmark/Resend provider.
  if (process.env.NODE_ENV === "production") {
    console.warn("[email-send STUB] to=%s code=%s", to, code);
    return;
  }
  console.log("[email-send DEV] to=%s code=%s", to, code);
}
