import { describe, expect, it, vi } from "vitest";
import { extractPriceLines, parsePerfumeExtraction, PERFUME_EXTRACT_SYSTEM_PROMPT, PerfumeExtractInputError } from "./extract.service.js";
import { PERFUME_LIST_EXTRACTION_MODEL, REGISTERED_MODEL_IDS } from "../ai/models.js";

const names = ["PHOTO-2026-11-11-18-14-36 2.jpg", "PHOTO-2026-11-11-18-14-38 3.jpg"];

describe("PERFUME-DESK picture reader — parse", () => {
  it("reads the real offer photos' lines (COCO NOIR $166.50, CHANCE EAU VIVE $171)", () => {
    const text = `Here you go: {"lines":[
      {"image":1,"brand":"Chanel","description":"Coco Noir EDP 100ml","size":"100ML","type":"edp","gender":"w","price":"166.50"},
      {"image":2,"brand":"CHANEL","description":"CHANCE EAU VIVE EDT 150ML","size":"150ML","type":"EDT","gender":null,"price":"$171"}]}`;
    const out = parsePerfumeExtraction(text, names);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ image: 1, image_name: names[0], brand: "CHANEL", description: "COCO NOIR EDP 100ML", type: "EDP", gender: "W", price: "166.50" });
    expect(out[1]).toMatchObject({ image: 2, price: "171.00", description: "CHANCE EAU VIVE EDT 150ML" });
  });

  it("never trusts a price that is not a plain amount — null + note, the owner types it", () => {
    const out = parsePerfumeExtraction(`{"lines":[{"image":1,"description":"SAUVAGE EDT 100ML","price":"12O.00"},{"image":1,"description":"X","price":"0"},{"image":9,"description":"Y","price":"1,105.00"}]}`, names);
    expect(out[0].price).toBeNull();
    expect(out[0].note).toMatch(/not a plain amount/);
    expect(out[1].price).toBeNull();
    expect(out[2]).toMatchObject({ image: 1, price: "1105.00" });
  });

  it("drops lines with no description and refuses non-JSON", () => {
    expect(parsePerfumeExtraction(`{"lines":[{"image":1,"description":"","price":"5.00"}]}`, names)).toEqual([]);
    expect(() => parsePerfumeExtraction("I cannot read this", names)).toThrow("extraction_not_json");
  });
});

describe("PERFUME-DESK picture reader — call", () => {
  it("sends pictures as untrusted data with no tools, the registered model, and parses the answer", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      expect(body.model).toBe(PERFUME_LIST_EXTRACTION_MODEL);
      expect(body.tools).toBeUndefined();
      expect(body.system).toBe(PERFUME_EXTRACT_SYSTEM_PROMPT);
      expect(body.messages[0].content.filter((c: { type: string }) => c.type === "image")).toHaveLength(1);
      return new Response(JSON.stringify({ content: [{ type: "text", text: '{"lines":[{"image":1,"description":"N5 EDP 200ML","brand":"CHANEL","price":"250"}]}' }] }), { status: 200 });
    });
    const r = await extractPriceLines([{ name: "p.jpg", media_type: "image/jpeg", data_base64: "AAAA" }], { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.lines[0]).toMatchObject({ brand: "CHANEL", price: "250.00" });
    expect(REGISTERED_MODEL_IDS).toContain(PERFUME_LIST_EXTRACTION_MODEL);
  });

  it("refuses too many pictures and unsupported types before calling anyone", async () => {
    const one = { name: "a.jpg", media_type: "image/jpeg" as const, data_base64: "AAAA" };
    await expect(extractPriceLines(Array(7).fill(one), { apiKey: "k" })).rejects.toBeInstanceOf(PerfumeExtractInputError);
    await expect(extractPriceLines([{ ...one, media_type: "image/tiff" as never }], { apiKey: "k" })).rejects.toBeInstanceOf(PerfumeExtractInputError);
  });
});
