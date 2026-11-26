/**
 * PERFUME mail engine — the Hotmail mailbox (owner 2026-11-25 23:25 CT: "add a hotmail connection"). A Graph message becomes
 * the same shape the Gmail reader gives the engine (From / Subject, attachments with ids, the HTML body the download-link
 * reader reads); the Microsoft sign-in asks only for read access on a consumer account with PKCE; the mailbox is read
 * across every folder (Junk included) without the owner's own mail; Microsoft's rotated refresh token is kept.
 */
import { describe, expect, it } from "vitest";
import { attachmentsOf, header, senderAddress } from "./gmail.js";
import { downloadLinksOf, htmlOf } from "./links.js";
import { graphToGmail, idTokenEmail, microsoftAuthorizeUrl, MS_SCOPES, Outlook, pkcePair } from "./outlook.js";
import { outlookSource, senderFits } from "./source.js";

const LUX = { id: "AAMk1", subject: "Lux America Price List 11/23/26", receivedDateTime: "2026-11-23T15:29:00Z", hasAttachments: true,
  from: { emailAddress: { address: "Pilar@LuxAmerica.net", name: "Pilar" } },
  body: { contentType: "html", content: '<p>Attached.</p><a href="https://luxamerica.net/list.xlsx">Download Excel price list</a>' } };

describe("a Hotmail message as the engine reads it", () => {
  it("From and Subject, the attached list with its Graph id, inline images left out, the HTML body for links", () => {
    const m = graphToGmail(LUX, [
      { id: "att-1", name: "LuxAmericaPriceList_11_23_26.xlsx", size: 52_000, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "@odata.type": "#microsoft.graph.fileAttachment" },
      { id: "att-2", name: "outlook-item", "@odata.type": "#microsoft.graph.itemAttachment" },
    ]);
    expect(senderAddress(header(m, "From"))).toBe("pilar@luxamerica.net");
    expect(header(m, "Subject")).toBe("Lux America Price List 11/23/26");
    expect(m.internalDate).toBe(String(Date.parse("2026-11-23T15:29:00Z")));
    expect(attachmentsOf(m)).toEqual([{ fileName: "LuxAmericaPriceList_11_23_26.xlsx", attachmentId: "att-1", inlineData: null, size: 52_000,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }]);
    expect(downloadLinksOf(htmlOf(m)).map((l) => l.url)).toEqual(["https://luxamerica.net/list.xlsx"]);
  });
});

describe("the Microsoft sign-in", () => {
  it("consumer accounts, read-only mail + lasting access, PKCE S256, the Hotmail address suggested", () => {
    const p = pkcePair();
    const u = new URL(microsoftAuthorizeUrl({ clientId: "cid", redirectUri: "https://api.ih35dispatch.com/api/v1/perfume/mail/microsoft/callback" },
      { state: p.state, challenge: p.challenge, loginHint: "tio-perfumes@hotmail.com" }));
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize");
    expect(u.searchParams.get("scope")).toBe("openid email offline_access https://graph.microsoft.com/Mail.Read");
    expect(MS_SCOPES.some((s) => /send|readwrite/i.test(s))).toBe(false);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(p.challenge);
    expect(u.searchParams.get("login_hint")).toBe("tio-perfumes@hotmail.com");
    expect(p.challenge).not.toBe(p.verifier);
  });
  it("the signed-in address comes from the id_token", () => {
    const tok = `x.${Buffer.from(JSON.stringify({ email: "Tio-Perfumes@Hotmail.com" })).toString("base64url")}.y`;
    expect(idTokenEmail(tok)).toBe("tio-perfumes@hotmail.com");
    expect(idTokenEmail(`x.${Buffer.from(JSON.stringify({ preferred_username: "tio-perfumes@hotmail.com" })).toString("base64url")}.y`)).toBe("tio-perfumes@hotmail.com");
    expect(idTokenEmail("garbage")).toBeNull();
  });
});

describe("reading the Hotmail mailbox", () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    if (url.includes("/messages?")) return { ok: true, status: 200, text: async () => "", json: async () => ({ value: [
      { id: "m1", hasAttachments: true, from: { emailAddress: { address: "pilar@luxamerica.net" } } },
      { id: "m2", hasAttachments: false, from: { emailAddress: { address: "sales@miamitradingzone.ccsend.com" } } },
      { id: "m3", hasAttachments: false, from: { emailAddress: { address: "promo@someone.com" } } },
      { id: "m4", hasAttachments: true, from: { emailAddress: { address: "tio-perfumes@hotmail.com" } } },
    ] }) };
    if (url.endsWith("/attachments/att-1")) return { ok: true, status: 200, text: async () => "", json: async () => ({ id: "att-1", name: "a.xlsx", contentBytes: Buffer.from("PK..").toString("base64") }) };
    return { ok: false, status: 404, text: async () => "nf", json: async () => ({}) };
  };
  const src = outlookSource(new Outlook("at", "tio-perfumes@hotmail.com", fetchImpl));
  it("every folder in the window (Junk included), the owner's own mail left out; files and set-up senders found", async () => {
    expect(await src.priceFileIds(3)).toEqual(["m1"]);
    expect(await src.fromIds(3, ["sales@miamitradingzone.ccsend.com", "@luxamerica.net"])).toEqual(["m1", "m2"]);
    expect(calls.filter((c) => c.includes("/messages?"))).toHaveLength(1);
    expect(decodeURIComponent(calls[0])).toContain("receivedDateTime ge ");
    expect(calls[0]).toContain("https://graph.microsoft.com/v1.0/me/messages?");
    expect(calls[0]).not.toContain("parentFolderId");
  });
  it("an attachment's bytes", async () => {
    expect((await src.attachment("m1", { fileName: "a.xlsx", attachmentId: "att-1", inlineData: null, size: 4, mimeType: "" })).toString()).toBe("PK..");
  });
  it("sender rules: exact address or @domain", () => {
    expect(senderFits("Pilar@LuxAmerica.net", ["@luxamerica.net"])).toBe(true);
    expect(senderFits("sales@nandanson.com", ["sales@nandanson.com"])).toBe(true);
    expect(senderFits("x@other.com", ["@luxamerica.net", "sales@nandanson.com"])).toBe(false);
  });
});
