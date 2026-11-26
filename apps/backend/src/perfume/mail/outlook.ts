/**
 * PERFUME mail engine — the Hotmail mailbox (owner 2026-11-25 23:25 CT: "add a hotmail connection").
 *
 * tio-perfumes@hotmail.com is a personal Microsoft account (Outlook.com, Exchange on the Mac). Measured on the Mac Mail
 * database, last 45 days: Lux America and Mohan Tilani send their lists ONLY there, and Sanya, Perfumora, Euro and
 * AceBeauty lists land in its Junk folder. Read through Microsoft Graph with the owner's own sign-in (Mail.Read +
 * offline_access, consumer accounts) — read-only, nothing is sent or moved. /me/messages covers every folder, Junk
 * included.
 *
 * A Graph message is turned into the same shape the Gmail reader returns (headers From / Subject, internalDate, parts with
 * file names and attachment ids, the HTML body as a text/html part), so the engine's rules, holds and the download-link
 * reader are the same code for all three mailboxes. Microsoft returns a NEW refresh token on every refresh; the caller
 * stores it (onRefreshToken) or the next run would be refused. No token is logged or returned.
 */
import crypto from "node:crypto";
import type { FetchLike, GmailMessage, GmailPart } from "./gmail.js";
import { GmailApiError, MailReconnectError } from "./gmail.js";

export const MS_AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
export const MS_SCOPES = ["openid", "email", "offline_access", "https://graph.microsoft.com/Mail.Read"];
const GRAPH = "https://graph.microsoft.com/v1.0/me";

export function microsoftClient(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.OAUTH_MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.OAUTH_MICROSOFT_CLIENT_SECRET?.trim();
  let redirectUri = process.env.OAUTH_MICROSOFT_REDIRECT_URI?.trim();
  if (!redirectUri && process.env.OAUTH_REDIRECT_URI) {
    try { redirectUri = `${new URL(process.env.OAUTH_REDIRECT_URI).origin}/api/v1/perfume/mail/microsoft/callback`; } catch { /* left unset */ }
  }
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

export function pkcePair(): { verifier: string; challenge: string; state: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  return { verifier, challenge: crypto.createHash("sha256").update(verifier).digest("base64url"), state: crypto.randomBytes(24).toString("base64url") };
}

export function microsoftAuthorizeUrl(c: { clientId: string; redirectUri: string }, p: { state: string; challenge: string; loginHint?: string | null }): string {
  const q = new URLSearchParams({ client_id: c.clientId, response_type: "code", redirect_uri: c.redirectUri, response_mode: "query",
    scope: MS_SCOPES.join(" "), state: p.state, code_challenge: p.challenge, code_challenge_method: "S256", prompt: "select_account" });
  if (p.loginHint) q.set("login_hint", p.loginHint);
  return `${MS_AUTHORITY}/authorize?${q.toString()}`;
}

type TokenSet = { accessToken: string; refreshToken: string | null; scopes: string[]; email: string | null };

/** The signed-in address from the id_token (came straight from Microsoft's token endpoint over TLS). */
export function idTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const p = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string; preferred_username?: string };
    return String(p.email || p.preferred_username || "").toLowerCase() || null;
  } catch {
    return null;
  }
}

async function tokenCall(body: Record<string, string>, doFetch: FetchLike): Promise<TokenSet> {
  const c = microsoftClient();
  if (!c) throw new Error("microsoft_oauth_not_configured");
  const res = await doFetch(`${MS_AUTHORITY}/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, ...body }).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; error?: string; id_token?: string };
  if (!res.ok || !j.access_token) {
    if (j.error === "invalid_grant" || j.error === "interaction_required" || j.error === "unauthorized_client") {
      throw new MailReconnectError(`Microsoft refused the mailbox access (${j.error}) — sign in to Hotmail again on the desk.`);
    }
    throw new GmailApiError(res.status, `microsoft token ${res.status}: ${j.error ?? ""}`);
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, scopes: (j.scope ?? "").split(/\s+/).filter(Boolean), email: idTokenEmail(j.id_token) };
}

export const exchangeMicrosoftCode = (code: string, verifier: string, doFetch: FetchLike = fetch as unknown as FetchLike) =>
  tokenCall({ grant_type: "authorization_code", code, code_verifier: verifier, scope: MS_SCOPES.join(" ") }, doFetch);

export const refreshMicrosoft = (refreshToken: string, doFetch: FetchLike = fetch as unknown as FetchLike) =>
  tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken, scope: MS_SCOPES.join(" ") }, doFetch);

type GraphAddress = { emailAddress?: { address?: string; name?: string } };
type GraphMessage = { id: string; subject?: string; from?: GraphAddress; receivedDateTime?: string; hasAttachments?: boolean;
  body?: { contentType?: string; content?: string } };
type GraphAttachment = { id: string; name?: string; size?: number; contentType?: string; "@odata.type"?: string; contentBytes?: string };

/** One Graph message in the Gmail reader's shape. */
export function graphToGmail(m: GraphMessage, attachments: GraphAttachment[]): GmailMessage {
  const from = m.from?.emailAddress;
  const parts: GmailPart[] = [];
  if (m.body?.content) {
    const html = (m.body.contentType ?? "").toLowerCase() === "html";
    parts.push({ mimeType: html ? "text/html" : "text/plain", body: { data: Buffer.from(m.body.content, "utf8").toString("base64url") } });
  }
  for (const a of attachments) {
    if (a["@odata.type"] && a["@odata.type"] !== "#microsoft.graph.fileAttachment") continue;
    parts.push({ filename: a.name ?? "", mimeType: a.contentType ?? "", body: { attachmentId: a.id, size: a.size ?? 0 } });
  }
  return {
    id: m.id, internalDate: String(Date.parse(m.receivedDateTime ?? "") || Date.now()),
    payload: { mimeType: "multipart/mixed", parts,
      headers: [{ name: "From", value: from?.address ? `${from.name ?? ""} <${from.address}>` : "" }, { name: "Subject", value: m.subject ?? "" }] },
  };
}

export class Outlook {
  constructor(private readonly token: string, private readonly self: string, private readonly doFetch: FetchLike = fetch as unknown as FetchLike) {}

  private async get<T>(url: string): Promise<T> {
    const res = await this.doFetch(url.startsWith("http") ? url : `${GRAPH}${url}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (res.status === 401) throw new MailReconnectError("Microsoft refused the mailbox access (401) — sign in to Hotmail again on the desk.");
    if (!res.ok) throw new GmailApiError(res.status, `graph ${url.split("?")[0].slice(-60)} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  /** Every message received in the window (all folders, Junk included), the owner's own mail left out. */
  async window(days: number, max = 500): Promise<GraphMessage[]> {
    const since = new Date(Date.now() - Math.max(1, Math.min(60, days)) * 86_400_000).toISOString();
    const out: GraphMessage[] = [];
    let url: string | undefined = `/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}&$select=id,subject,from,receivedDateTime,hasAttachments&$top=100&$orderby=receivedDateTime desc`;
    while (url && out.length < max) {
      const r: { value?: GraphMessage[]; "@odata.nextLink"?: string } = await this.get(url);
      out.push(...(r.value ?? []));
      url = r["@odata.nextLink"];
    }
    return out.filter((m) => (m.from?.emailAddress?.address ?? "").toLowerCase() !== this.self).slice(0, max);
  }

  async message(id: string): Promise<GmailMessage> {
    const m = await this.get<GraphMessage>(`/messages/${encodeURIComponent(id)}?$select=id,subject,from,receivedDateTime,hasAttachments,body`);
    const atts = m.hasAttachments
      ? (await this.get<{ value?: GraphAttachment[] }>(`/messages/${encodeURIComponent(id)}/attachments?$select=id,name,size,contentType`)).value ?? []
      : [];
    return graphToGmail(m, atts);
  }

  async attachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const a = await this.get<GraphAttachment>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
    if (!a.contentBytes) throw new GmailApiError(404, `attachment ${a.name ?? attachmentId} came back empty`);
    return Buffer.from(a.contentBytes, "base64");
  }

  async me(): Promise<string> {
    const r = await this.get<{ mail?: string | null; userPrincipalName?: string }>("/?$select=mail,userPrincipalName");
    return String(r.mail || r.userPrincipalName || "").toLowerCase();
  }
}
