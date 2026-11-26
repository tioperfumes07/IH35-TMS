/**
 * PERFUME — send a list from jpm@tioperfumes.com (owner 2026-11-25 22:50 CT). Pasted addresses counted once each; the
 * email built with its attachment and the STOP footer; one email per address, opted-out addresses skipped, a failure
 * recorded and the rest still sent; a Stop on the desk ends the send; only jpm@ may send, only with the send grant, never
 * past the daily limit. The DB is an in-memory stand-in for withCurrentUser (the SQL is matched by its text).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db = { accounts: [] as Row[], batches: [] as Row[], sends: [] as Row[], optouts: [] as string[], sentLast24h: 0 };

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_uid: string, fn: (c: { query: (sql: string, p?: unknown[]) => Promise<{ rows: Row[] }> }) => unknown) => fn({
    query: async (sql: string, p: unknown[] = []) => {
      const s = sql.replace(/\s+/g, " ");
      if (s.startsWith("SELECT status, can_send FROM perfume.mail_accounts")) return { rows: db.accounts.filter((a) => a.email === p[0]) };
      if (s.startsWith("SELECT refresh_token_enc FROM perfume.mail_accounts")) return { rows: [{ refresh_token_enc: Buffer.from("tok") }] };
      if (s.includes("count(*) n FROM perfume.mail_sends")) return { rows: [{ n: String(db.sentLast24h) }] };
      if (s.startsWith("INSERT INTO perfume.mail_send_batches")) {
        const id = `b${db.batches.length + 1}`; db.batches.push({ id, status: "sending", recipients: p[5] }); return { rows: [{ id }] };
      }
      if (s.startsWith("SELECT email FROM perfume.mail_optouts")) return { rows: db.optouts.map((email) => ({ email })) };
      if (s.startsWith("SELECT status FROM perfume.mail_send_batches")) return { rows: db.batches.filter((b) => b.id === p[0]).map((b) => ({ status: b.status })) };
      if (s.startsWith("INSERT INTO perfume.mail_sends")) {
        const status = s.includes("'skipped_optout'") ? "skipped_optout" : s.includes("'sent'") ? "sent" : "failed";
        db.sends.push({ batch_id: p[0], to_email: p[1], status, extra: p[2] ?? null }); return { rows: [] };
      }
      if (s.startsWith("UPDATE perfume.mail_send_batches SET status = $2")) {
        const b = db.batches.find((x) => x.id === p[0])!; Object.assign(b, { status: p[1], error: p[2], sent: p[3], skipped: p[4], failed: p[5] }); return { rows: [] };
      }
      if (s.startsWith("UPDATE perfume.mail_send_batches SET sent")) return { rows: [] };
      if (s.startsWith("UPDATE perfume.mail_accounts")) {
        const a = db.accounts.find((x) => x.email === p[0]); if (a) { if (s.includes("can_send = false")) a.can_send = false; else a.status = "reconnect"; }
        return { rows: [] };
      }
      throw new Error(`unexpected SQL: ${s.slice(0, 90)}`);
    },
  }),
}));
vi.mock("../../lib/encryption.js", () => ({ decrypt: (b: Buffer | null) => (b ? b.toString() : null) }));
process.env.OAUTH_GOOGLE_CLIENT_ID = "cid"; process.env.OAUTH_GOOGLE_CLIENT_SECRET = "sec"; process.env.OAUTH_REDIRECT_URI = "https://x/cb";

const { parseRecipients, messageText, runSend, startSend, SendError, PERFUME_SENDER, DAILY_SEND_CAP, SEND_FOOTER } = await import("./send.js");
const { buildMime } = await import("./gmail.js");
const { PERFUME_MAIL_CRON_EXPRESSIONS } = await import("../../cron/perfume-mail-price-lists.cron.js");

type Sent = { to: string; raw: string };
function fakeGoogle(opts: { failTo?: string; status?: number } = {}) {
  const sent: Sent[] = [];
  const fetchImpl = async (url: string, init?: { body?: string }) => {
    if (url.includes("oauth2.googleapis.com/token")) return { ok: true, status: 200, json: async () => ({ access_token: "at" }), text: async () => "" };
    const raw = Buffer.from(JSON.parse(init!.body!).raw, "base64url").toString("utf8");
    const to = raw.match(/^To: (.+)$/m)![1].trim();
    if (opts.status) return { ok: false, status: opts.status, json: async () => ({}), text: async () => "denied" };
    if (to === opts.failTo) return { ok: false, status: 500, json: async () => ({}), text: async () => "boom" };
    sent.push({ to, raw });
    return { ok: true, status: 200, json: async () => ({ id: `g-${sent.length}` }), text: async () => "" };
  };
  return { sent, fetchImpl };
}
const input = (recipients: string[]) => ({ from: PERFUME_SENDER, recipients, subject: "Lista de precios — TIO 11/25", body: "Buenas noches, adjunto la lista.",
  attachments: [{ fileName: "TIO WHOLESALE OFFER 11-25-2026.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: Buffer.from("PKxlsx") }] });

beforeEach(() => {
  db.accounts = [{ email: PERFUME_SENDER, status: "connected", can_send: true }]; db.batches = []; db.sends = []; db.optouts = []; db.sentLast24h = 0;
});

describe("addresses pasted into To", () => {
  it("one per address, lower case, names and mailto: removed; bad entries reported, never sent", () => {
    const r = parseRecipients("Kanak <Kanak@Perfume-Center.com>, sales@etperfume.com\nsales@ETPERFUME.com; mailto:ana@elegance.com\nnot-an-email");
    expect(r.emails).toEqual(["kanak@perfume-center.com", "sales@etperfume.com", "ana@elegance.com"]);
    expect(r.invalid).toEqual(["not-an-email"]);
  });
});

describe("the email that goes out", () => {
  it("From jpm@, To one address, accented subject encoded, the message + STOP footer, the list attached", () => {
    const raw = buildMime({ from: PERFUME_SENDER, to: "kanak@perfume-center.com", subject: "Lista de precios — TIO", text: messageText("Hola"), attachments: input([]).attachments }).toString("utf8");
    expect(raw).toMatch(/^From: jpm@tioperfumes\.com\r\nTo: kanak@perfume-center\.com\r\nSubject: =\?UTF-8\?B\?/);
    expect(raw).toContain('Content-Disposition: attachment; filename="TIO WHOLESALE OFFER 11-25-2026.xlsx"');
    expect(raw).toContain(Buffer.from("PKxlsx").toString("base64"));
    const textPart = raw.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
    expect(Buffer.from(textPart, "base64").toString("utf8")).toBe(`Hola${SEND_FOOTER}`);
    expect(SEND_FOOTER).toContain("reply to this email with STOP");
  });
  it("a header with a line break is refused, not cleaned", () => {
    expect(() => buildMime({ from: PERFUME_SENDER, to: "a@b.com\r\nBcc: x@y.com", subject: "s", text: "t", attachments: [] })).toThrow("mime_header_newline");
  });
});

describe("sending", () => {
  it("one email per address; an opted-out address is skipped; a failed one is recorded and the rest still go", async () => {
    db.optouts = ["stop@buyer.com"];
    db.batches.push({ id: "b1", status: "sending" });
    const g = fakeGoogle({ failTo: "bad@buyer.com" });
    await runSend("owner", "b1", input(["a@buyer.com", "stop@buyer.com", "bad@buyer.com", "c@buyer.com"]), g.fetchImpl, 0);
    expect(g.sent.map((s) => s.to)).toEqual(["a@buyer.com", "c@buyer.com"]);
    expect(db.sends.map((s) => [s.to_email, s.status])).toEqual([
      ["a@buyer.com", "sent"], ["stop@buyer.com", "skipped_optout"], ["bad@buyer.com", "failed"], ["c@buyer.com", "sent"]]);
    expect(db.batches[0]).toMatchObject({ status: "done", sent: 2, skipped: 1, failed: 1 });
  });
  it("Stop on the desk ends the send before the next address", async () => {
    db.batches.push({ id: "b1", status: "sending" });
    const g = fakeGoogle();
    const orig = g.fetchImpl;
    const fetchImpl = async (url: string, init?: { body?: string }) => { const r = await orig(url, init); if (g.sent.length === 1) db.batches[0].status = "stopped"; return r; };
    await runSend("owner", "b1", input(["a@x.com", "b@x.com", "c@x.com"]), fetchImpl, 0);
    expect(g.sent.map((s) => s.to)).toEqual(["a@x.com"]);
    expect(db.batches[0]).toMatchObject({ status: "stopped", sent: 1 });
  });
  it("Google says no send access (403): the send fails and the mailbox is marked read-only, reading keeps working", async () => {
    db.batches.push({ id: "b1", status: "sending" });
    await runSend("owner", "b1", input(["a@x.com"]), fakeGoogle({ status: 403 }).fetchImpl, 0);
    expect(db.batches[0].status).toBe("failed");
    expect(db.accounts[0]).toMatchObject({ status: "connected", can_send: false });
  });
});

describe("who may send, and how much", () => {
  it("only jpm@tioperfumes.com, only connected with send access, never past the daily limit", async () => {
    await expect(startSend("owner", { ...input(["a@x.com"]), from: "tioperfumes07@gmail.com" })).rejects.toMatchObject({ code: "sender_not_allowed" });
    db.accounts[0].can_send = false;
    await expect(startSend("owner", input(["a@x.com"]))).rejects.toMatchObject({ code: "send_not_granted" });
    db.accounts[0].can_send = true; db.sentLast24h = DAILY_SEND_CAP;
    await expect(startSend("owner", input(["a@x.com"]))).rejects.toBeInstanceOf(SendError);
    expect(db.batches).toHaveLength(0);
  });
});

describe("when the mailboxes are checked", () => {
  it("Mon–Sat 6:30, 9:30, 12:30, 17:00, 21:45 and Sunday 21:45 (measured vendor arrival times)", () => {
    expect([...PERFUME_MAIL_CRON_EXPRESSIONS]).toEqual(["30 6 * * 1-6", "30 9 * * 1-6", "30 12 * * 1-6", "0 17 * * 1-6", "45 21 * * *"]);
  });
});
