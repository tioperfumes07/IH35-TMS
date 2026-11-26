/**
 * PERFUME mail engine — lists sent as a download link (owner 2026-11-25 23:09 CT: "mtz sends daily elegance as well … The
 * engine is supposed to get the Lists automatically"). Shapes taken from the real 11/25 emails on the owner's Mac:
 * MTZ "Download Excel PriceList", Elegance "Download PriceList in Excel" + PDF, Nandansons "Complete Wholesale List in .xls
 * format" wrapped by Outlook safelinks.
 */
import { describe, expect, it } from "vitest";
import { linkSearchQuery, ruleFor, type MailRule } from "./engine.js";
import { downloadLink, downloadLinksOf, extensionOf, htmlOf, linkFileName, safeUrl, unwrapLink } from "./links.js";

const MTZ = `<p>In Stock and Ready to Ship!</p><a href="https://nedhi5bab.cc.rs6.net/tn.jsp?f=0015zvLu&amp;c=1"><span>Download Excel PriceList</span></a>
  <a href="https://miamitradingzone.com/shop">Order Online</a><a href="https://facebook.com/x">Facebook</a>`;
const ELEGANCE = `<a href="https://cftxjg8ab.cc.rs6.net/tn.jsp?f=001A">Download PriceList in Excel</a> <a href="https://cftxjg8ab.cc.rs6.net/tn.jsp?f=001B">Download PriceList in PDF</a>`;
const NAND = `<a href="https://na01.safelinks.protection.outlook.com/?url=https%3A%2F%2Faaq9b8dab.cc.rs6.net%2Ftn.jsp%3Ff%3D001X&data=1">Complete Wholesale List in .xls format</a>
  <a href="https://na01.safelinks.protection.outlook.com/?url=https%3A%2F%2Faaq9b8dab.cc.rs6.net%2Ftn.jsp%3Ff%3D001Y&data=1">Complete Wholesale List in .pdf format</a>
  <a href="https://na01.safelinks.protection.outlook.com/?url=https%3A%2F%2Faaq9b8dab.cc.rs6.net%2Ftn.jsp%3Ff%3D001Z">Testers List in .pdf format</a>`;

describe("finding the download button in a vendor's email", () => {
  it("MTZ: the Excel button, not Order Online / Facebook", () => {
    expect(downloadLinksOf(MTZ)).toEqual([{ label: "Download Excel PriceList", url: "https://nedhi5bab.cc.rs6.net/tn.jsp?f=0015zvLu&c=1", kind: "excel" }]);
  });
  it("Elegance: the Excel one is taken; its PDF twin is left when a spreadsheet is offered", () => {
    expect(downloadLinksOf(ELEGANCE).map((l) => [l.label, l.kind])).toEqual([["Download PriceList in Excel", "excel"]]);
  });
  it("Nandansons: the Outlook safelinks wrapper is removed; the .xls list taken, the PDFs left", () => {
    expect(downloadLinksOf(NAND)).toEqual([{ label: "Complete Wholesale List in .xls format", url: "https://aaq9b8dab.cc.rs6.net/tn.jsp?f=001X", kind: "excel" }]);
    expect(unwrapLink("https://na01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fa.com%2Fb.xlsx")).toBe("https://a.com/b.xlsx");
  });
  it("PDF price lists are taken only when no spreadsheet link exists; a PDF that is not a list is not", () => {
    expect(downloadLinksOf(`<a href="https://v.com/a.pdf">Price List PDF</a><a href="https://v.com/b.pdf">Brochure PDF</a>`).map((l) => l.label)).toEqual(["Price List PDF"]);
  });
  it("only public https links are opened", () => {
    expect(safeUrl("http://v.com/a.xlsx")).toBeNull();
    expect(safeUrl("https://127.0.0.1/a.xlsx")).toBeNull();
    expect(safeUrl("https://localhost/a")).toBeNull();
    expect(safeUrl("https://files.internal/a")).toBeNull();
    expect(safeUrl("https://nedhi5bab.cc.rs6.net/tn.jsp?f=1")?.hostname).toBe("nedhi5bab.cc.rs6.net");
    expect(downloadLinksOf(`<a href="http://v.com/a.xlsx">Excel price list</a>`)).toEqual([]);
  });
  it("the HTML body is read from nested Gmail parts", () => {
    const data = Buffer.from(MTZ, "utf8").toString("base64url");
    expect(htmlOf({ id: "m", payload: { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: "eA" } }, { mimeType: "text/html", body: { data } }] } })).toBe(MTZ);
  });
});

describe("opening the link", () => {
  const xlsx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
  const link = { label: "Download Excel PriceList", url: "https://nedhi5bab.cc.rs6.net/tn.jsp?f=1", kind: "excel" as const };
  it("the file type comes from the bytes: xlsx, old xls, pdf, csv", () => {
    expect(extensionOf(xlsx, "application/octet-stream")).toBe(".xlsx");
    expect(extensionOf(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]), "")).toBe(".xls");
    expect(extensionOf(Buffer.from("%PDF-1.7"), "")).toBe(".pdf");
    expect(extensionOf(Buffer.from("a,b\n1,2"), "text/csv; charset=utf-8")).toBe(".csv");
    expect(extensionOf(Buffer.from("<html>"), "text/html")).toBeNull();
  });
  it("a redirect to the file is saved; the name is stable per email", async () => {
    const r = await downloadLink(link, 1_000_000, async () => ({ status: 200, contentType: "application/vnd.ms-excel", finalUrl: "https://files.ctctusercontent.com/x/MTZ.xlsx", buf: xlsx }));
    expect(r).toEqual({ ok: true, buf: xlsx, ext: ".xlsx" });
    expect(linkFileName(link.label, ".xlsx")).toBe("Link · Download Excel PriceList.xlsx");
  });
  it("held, never guessed: a web page, an expired link, a redirect to a non-public address, too large, no answer", async () => {
    const page = await downloadLink(link, 1_000_000, async () => ({ status: 200, contentType: "text/html", finalUrl: "https://x.com/login", buf: Buffer.from("<html>") }));
    expect(page).toMatchObject({ ok: false, reason: expect.stringContaining("web page") });
    expect(await downloadLink(link, 1_000_000, async () => ({ status: 404, contentType: "", finalUrl: link.url, buf: Buffer.alloc(0) }))).toMatchObject({ ok: false, reason: expect.stringContaining("404") });
    expect(await downloadLink(link, 1_000_000, async () => ({ status: 200, contentType: "", finalUrl: "http://10.0.0.5/a.xlsx", buf: xlsx }))).toMatchObject({ ok: false });
    expect(await downloadLink(link, 10, async () => ({ status: 200, contentType: "", finalUrl: link.url, buf: xlsx }))).toMatchObject({ ok: false, reason: expect.stringContaining("20 MB") });
    expect(await downloadLink(link, 1_000_000, async () => { throw new Error("timeout"); })).toMatchObject({ ok: false, reason: expect.stringContaining("did not answer") });
  });
});

describe("which emails are checked for links", () => {
  it("only the senders set up as vendors (address or @domain), in the run window", () => {
    expect(linkSearchQuery(3, ["sales@miamitradingzone.ccsend.com", "@elegancedistributors.net", "sales@nandanson.com", "SALES@nandanson.com"]))
      .toBe("newer_than:3d -in:sent -in:drafts from:(sales@miamitradingzone.ccsend.com OR elegancedistributors.net OR sales@nandanson.com)");
    expect(linkSearchQuery(3, [])).toBeNull();
  });
  it("a link file is matched on the subject: Elegance's Arabic list goes to ELEGANCE ARB, the regular list to ELEGANCE", () => {
    const rule = (p: Partial<MailRule>): MailRule => ({ id: "r", from_address: "", file_text: null, vendor_id: "v", special: false, ignore: false, ...p });
    const rules = [rule({ id: "eleg", from_address: "@elegancedistributors.net" }), rule({ id: "arb", from_address: "@elegancedistributors.net", file_text: "Arabic" })];
    expect(ruleFor(rules, "info@elegancedistributors.net", "Elegance Distributors Arabic Perfumes Price List November 25TH Download PriceList in Excel")?.id).toBe("arb");
    expect(ruleFor(rules, "info@elegancedistributors.net", "Elegance Distributors Price List November 25TH Download PriceList in Excel")?.id).toBe("eleg");
  });
});
