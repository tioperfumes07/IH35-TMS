type PasswordResetTemplateParams = {
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
  supportEmail: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function passwordResetHtml(params: PasswordResetTemplateParams): string {
  const userName = escapeHtml(params.userName);
  const resetUrl = escapeHtml(params.resetUrl);
  const expires = String(params.expiresInMinutes);
  const supportEmail = escapeHtml(params.supportEmail);

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:20px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="padding:18px 24px;border-bottom:1px solid #e5e7eb;background:#111827;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;line-height:1.3;">Reset your IH 35 TMS password</h1>
      </div>
      <div style="padding:20px 24px;">
        <p style="margin:0 0 14px;">Hi ${userName},</p>
        <p style="margin:0 0 14px;">
          We received a request to reset your IH 35 TMS password. This link expires in ${expires} minutes.
        </p>
        <p style="margin:0 0 16px;">
          <a href="${resetUrl}" style="display:inline-block;padding:10px 14px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">
            Reset Password
          </a>
        </p>
        <p style="margin:0 0 14px;font-size:13px;color:#374151;">
          If the button does not work, copy and paste this URL into your browser:<br />
          <span style="word-break:break-all;">${resetUrl}</span>
        </p>
        <p style="margin:0 0 14px;font-size:13px;color:#374151;">
          If you did not request this reset, you can ignore this email.
        </p>
        <p style="margin:0;font-size:13px;color:#374151;">
          Need help? Contact ${supportEmail}.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

export function passwordResetText(params: PasswordResetTemplateParams): string {
  return [
    `Hi ${params.userName},`,
    "",
    `We received a request to reset your IH 35 TMS password. This link expires in ${params.expiresInMinutes} minutes.`,
    `Reset link: ${params.resetUrl}`,
    "",
    "If you did not request this reset, ignore this email.",
    `Need help? Contact ${params.supportEmail}.`,
  ].join("\n");
}
