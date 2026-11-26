/**
 * PERFUME mail engine — the Gmail REST calls (read-only). No SDK: plain HTTPS with an OAuth2 access token, the same
 * shape as the Gmail send provider (email/providers/google.ts).
 *
 * The owner connects each mailbox himself on the desk (Google sign-in, scope gmail.readonly). The refresh token Google
 * returns is stored encrypted in perfume.mail_accounts; an access token is minted from it per run and kept in memory
 * only. Nothing here logs, returns or persists a token.
 */
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
/** Send only (owner 2026-11-25 22:50 CT: send the lists from jpm@tioperfumes.com). Never used by the read engine. */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Google refused the stored grant (revoked, password changed, app access removed): the owner must sign in again. */
export class MailReconnectError extends Error {}
/** The mailbox grant has no send access (403 on send): reading still works; the owner connects it again for sending. */
export class SendNotGrantedError extends Error {}
export class GmailApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function googleClient(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.OAUTH_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.OAUTH_GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.OAUTH_REDIRECT_URI?.trim();
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string>;
}>;

export async function accessTokenFor(refreshToken: string, doFetch: FetchLike = fetch as unknown as FetchLike): Promise<string> {
  const g = googleClient();
  if (!g) throw new Error("google_oauth_not_configured");
  const res = await doFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    if (body.error === "invalid_grant" || body.error === "unauthorized_client") {
      throw new MailReconnectError(`Google refused the mailbox access (${body.error}) — sign in to this mailbox again on the desk.`);
    }
    throw new GmailApiError(res.status, `token refresh failed: ${body.error ?? res.status}`);
  }
  return body.access_token;
}

export type GmailPart = { filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number; data?: string }; parts?: GmailPart[] };
export type GmailMessage = {
  id: string; threadId?: string; internalDate?: string;
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
};
export type Attachment = { fileName: string; attachmentId: string | null; inlineData: string | null; size: number; mimeType: string };

export class Gmail {
  constructor(private readonly token: string, private readonly doFetch: FetchLike = fetch as unknown as FetchLike) {}

  private async get<T>(path: string): Promise<T> {
    const res = await this.doFetch(`${API}${path}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (res.status === 401) throw new MailReconnectError("Google refused the mailbox access (401) — sign in to this mailbox again on the desk.");
    if (!res.ok) throw new GmailApiError(res.status, `gmail ${path.split("?")[0]} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  /** Message ids matching a Gmail search, newest first, up to `max`. */
  async listIds(q: string, max = 200): Promise<string[]> {
    const ids: string[] = [];
    let pageToken = "";
    do {
      const r = await this.get<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(
        `/messages?q=${encodeURIComponent(q)}&maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      for (const m of r.messages ?? []) ids.push(m.id);
      pageToken = r.nextPageToken ?? "";
    } while (pageToken && ids.length < max);
    return ids.slice(0, max);
  }

  message(id: string): Promise<GmailMessage> {
    return this.get<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
  }

  /** Sends one RFC 822 message (already built by buildMime). Returns Gmail's message id. */
  async send(raw: Buffer): Promise<string> {
    const res = await this.doFetch(`${API}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: raw.toString("base64url") }),
    });
    if (res.status === 401) throw new MailReconnectError("Google refused the mailbox access (401) — sign in to this mailbox again on the desk.");
    if (res.status === 403) throw new SendNotGrantedError("This mailbox was connected without send access — connect it again for sending on the desk.");
    if (!res.ok) throw new GmailApiError(res.status, `gmail send ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return body.id ?? "";
  }

  async attachment(messageId: string, a: Attachment): Promise<Buffer> {
    if (a.inlineData) return Buffer.from(a.inlineData, "base64url");
    if (!a.attachmentId) throw new GmailApiError(404, `attachment ${a.fileName} has no data`);
    const r = await this.get<{ data?: string }>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(a.attachmentId)}`);
    if (!r.data) throw new GmailApiError(404, `attachment ${a.fileName} came back empty`);
    return Buffer.from(r.data, "base64url");
  }
}

export function header(m: GmailMessage, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** The address in a From header: "PCA Sales <sales@perfumecenter.com>" → "sales@perfumecenter.com". */
export function senderAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/** Every attached file of a message (nested multiparts included), by its file name. */
export function attachmentsOf(m: GmailMessage): Attachment[] {
  const out: Attachment[] = [];
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.filename && p.filename.trim()) {
      out.push({ fileName: p.filename.trim(), attachmentId: p.body?.attachmentId ?? null, inlineData: p.body?.attachmentId ? null : p.body?.data ?? null,
        size: p.body?.size ?? 0, mimeType: p.mimeType ?? "" });
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(m.payload);
  return out;
}

/** RFC 2047 for a header with non-ASCII text (Spanish subjects, accented names). */
function encodeHeaderValue(v: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}
function wrap76(b64: string): string { return b64.replace(/.{1,76}/g, "$&\r\n"); }
export type MimeAttachment = { fileName: string; content: Buffer; mimeType: string };

/** One plain-text email with attachments (multipart/mixed). Header injection is refused, never cleaned. */
export function buildMime(m: { from: string; to: string; subject: string; text: string; attachments: MimeAttachment[] }): Buffer {
  for (const v of [m.from, m.to, m.subject]) if (/[\r\n]/.test(v)) throw new Error("mime_header_newline");
  const boundary = `tio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${m.from}`, `To: ${m.to}`, `Subject: ${encodeHeaderValue(m.subject)}`, "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "",
    wrap76(Buffer.from(m.text, "utf8").toString("base64")),
  ];
  for (const a of m.attachments) {
    const name = a.fileName.replace(/["\r\n\\]/g, "_");
    lines.push(`--${boundary}`, `Content-Type: ${a.mimeType || "application/octet-stream"}; name="${encodeHeaderValue(name)}"`,
      `Content-Disposition: attachment; filename="${encodeHeaderValue(name)}"`, "Content-Transfer-Encoding: base64", "",
      wrap76(a.content.toString("base64")));
  }
  lines.push(`--${boundary}--`, "");
  return Buffer.from(lines.join("\r\n"), "utf8");
}
