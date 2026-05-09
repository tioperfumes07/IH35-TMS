type DriverInviteTemplateParams = {
  driverName: string;
  loginUrl: string;
  ownerName: string;
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

export function driverInviteHtml(params: DriverInviteTemplateParams): string {
  const driverName = escapeHtml(params.driverName);
  const loginUrl = escapeHtml(params.loginUrl);
  const ownerName = escapeHtml(params.ownerName);
  const supportEmail = escapeHtml(params.supportEmail);

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:20px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="padding:18px 24px;border-bottom:1px solid #e5e7eb;background:#111827;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;line-height:1.3;">Welcome to IH 35 Dispatch</h1>
      </div>
      <div style="padding:20px 24px;">
        <p style="margin:0 0 14px;">Hi ${driverName},</p>
        <p style="margin:0 0 14px;">
          You have been invited to access the IH 35 Driver App. This app lets you review load updates, handle required submissions, and stay connected with dispatch.
        </p>
        <p style="margin:0 0 16px;">
          <a href="${loginUrl}" style="display:inline-block;padding:10px 14px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">
            Open Driver Login
          </a>
        </p>
        <p style="margin:0 0 14px;font-size:13px;color:#374151;">
          If the button does not work, copy and paste this URL into your browser:<br />
          <span style="word-break:break-all;">${loginUrl}</span>
        </p>
        <p style="margin:0 0 14px;font-size:13px;color:#374151;">Need help? Contact support at ${supportEmail}.</p>
        <p style="margin:0;font-size:13px;color:#374151;">Thank you,<br />${ownerName}<br />IH 35 Dispatch</p>
      </div>
    </div>
  </body>
</html>`;
}

export function driverInviteText(params: DriverInviteTemplateParams): string {
  return [
    `Hi ${params.driverName},`,
    "",
    "You have been invited to access the IH 35 Driver App.",
    `Open login: ${params.loginUrl}`,
    "",
    `Need help? Contact ${params.supportEmail}`,
    "",
    `Thank you,`,
    `${params.ownerName}`,
    "IH 35 Dispatch",
  ].join("\n");
}
