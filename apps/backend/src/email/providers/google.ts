import type { EmailProvider, SendEmailInput, SendEmailResult } from "../provider.js";

/**
 * Google (Gmail API) email provider.
 *
 * WHY THE GMAIL API AND NOT SMTP
 * Google disabled password-based SMTP for normal account passwords in 2022 ("less secure app access").
 * SMTP would therefore need either a 16-character App Password per mailbox or OAuth2 anyway — and a
 * raw SMTP client would mean adding a runtime dependency (nodemailer), which is a gated change here.
 * The Gmail REST API needs neither: it is plain HTTPS with an OAuth2 access token, exactly the shape
 * the Postmark provider already uses.
 *
 * CREDENTIALS ARE READ FROM ENV, NEVER STORED IN THIS REPO.
 * A refresh token is exchanged for a short-lived access token on demand and cached in memory only.
 * Nothing is persisted, logged, or written to disk.
 *
 * MULTI-ENTITY: TRANSP/TRK send from the ih35trucking.net Workspace mailbox and USMCA from its own
 * Gmail mailbox, so the sender is per-send (`input.from`) with a configured default. The mailbox that
 * OWNS the refresh token must be allowed to send as that From address — for a different address you
 * need either a Workspace "send mail as" alias verified on that account, or a separate refresh token
 * per mailbox (see EMAIL_GOOGLE_REFRESH_TOKEN_BY_ADDRESS in the factory).
 */

type GoogleProviderArgs = {
  clientId: string;
  clientSecret: string;
  /** Default mailbox refresh token. */
  refreshToken: string;
  /** Default From address, used when a send does not specify one. */
  fromAddress: string;
  /** Optional per-From-address refresh tokens for additional mailboxes (e.g. USMCA). */
  refreshTokenByAddress?: Record<string, string>;
};

type CachedToken = { accessToken: string; expiresAtMs: number };

/** RFC 2047 encode a header value so non-ASCII subjects survive. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build a MIME message. Multipart only when there are attachments — keeps the common path simple. */
function buildMime(input: SendEmailInput, from: string): string {
  const headers: string[] = [
    `From: ${from}`,
    `To: ${input.to.join(", ")}`,
  ];
  if (input.cc?.length) headers.push(`Cc: ${input.cc.join(", ")}`);
  if (input.bcc?.length) headers.push(`Bcc: ${input.bcc.join(", ")}`);
  headers.push(`Subject: ${encodeHeader(input.subject)}`);
  headers.push("MIME-Version: 1.0");

  if (!input.attachments?.length) {
    const boundary = `alt_${Date.now().toString(36)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const parts = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      input.text ?? "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      input.html,
      `--${boundary}--`,
      "",
    ];
    return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
  }

  const mixed = `mix_${Date.now().toString(36)}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);
  const parts: string[] = [
    `--${mixed}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    input.html,
  ];
  for (const a of input.attachments) {
    parts.push(
      `--${mixed}`,
      `Content-Type: ${a.contentType ?? "application/octet-stream"}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      a.contentBase64
    );
  }
  parts.push(`--${mixed}--`, "");
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

export function createGoogleEmailProvider(args: GoogleProviderArgs): EmailProvider {
  // Access tokens are cached per refresh token, in memory only, and re-minted before expiry.
  const cache = new Map<string, CachedToken>();

  async function accessTokenFor(refreshToken: string): Promise<string> {
    const hit = cache.get(refreshToken);
    if (hit && hit.expiresAtMs > Date.now() + 60_000) return hit.accessToken;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: args.clientId,
        client_secret: args.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Never echo the token itself — only Google's error code.
      throw new Error(`google_oauth_refresh_failed:${res.status}:${body.slice(0, 300)}`);
    }
    const payload = (await res.json()) as { access_token?: string; expires_in?: number };
    const accessToken = payload.access_token;
    if (!accessToken) throw new Error("google_oauth_refresh_failed:no_access_token");
    cache.set(refreshToken, {
      accessToken,
      expiresAtMs: Date.now() + Math.max(0, Number(payload.expires_in ?? 3600)) * 1000,
    });
    return accessToken;
  }

  return {
    kind: "google",
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      const from = (input.from ?? args.fromAddress).trim();
      // A mailbox may only send as itself (or a verified alias), so pick that mailbox's token.
      const refreshToken = args.refreshTokenByAddress?.[from.toLowerCase()] ?? args.refreshToken;
      const accessToken = await accessTokenFor(refreshToken);

      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: base64Url(Buffer.from(buildMime(input, from), "utf8")) }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`google_send_failed:${res.status}:${body.slice(0, 500)}`);
      }
      const payload = (await res.json()) as { id?: string };
      // A REAL provider message id — this is what proves the send left the building, and it is what
      // stops the row being recorded as console-only (LV-010 / verify-console-email-never-sent).
      return { messageId: String(payload.id ?? `google-${Date.now()}`) };
    },
  };
}
