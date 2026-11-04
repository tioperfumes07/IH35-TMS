import { describe, expect, it } from "vitest";
import { pickDriverIdPhoto, pickUnitPhoto, type LinkedImageFile } from "./uploaded-photo-pick.js";

const f = (over: Partial<LinkedImageFile>): LinkedImageFile => ({
  id: "f1", original_filename: "x.jpeg", mime_type: "image/jpeg", category_code: null, r2_key: "k", created_at: "2026-01-01", ...over,
});

describe("row 3 header photo pick", () => {
  it("shows the INE ID image (measured prod case) and never the medical card", () => {
    const ine = f({ id: "ine", original_filename: "INE Jorge Pablo Munoz.jpeg", category_code: "other" });
    const med = f({ id: "med", original_filename: "Medical Exam-Jorge.jpeg", category_code: "medical_card" });
    expect(pickDriverIdPhoto([med, ine])?.id).toBe("ine");
    expect(pickDriverIdPhoto([med])).toBeNull();
  });
  it("never turns a PDF into a photo", () => {
    expect(pickDriverIdPhoto([f({ mime_type: "application/pdf", category_code: "cdl", original_filename: "cdl.pdf" })])).toBeNull();
    expect(pickUnitPhoto([f({ mime_type: "application/pdf", original_filename: "truck photo.pdf" })])).toBeNull();
  });
  it("takes any image filed as CDL, newest first", () => {
    const a = f({ id: "a", category_code: "cdl", created_at: "2026-01-01" });
    const b = f({ id: "b", category_code: "cdl", created_at: "2026-03-01" });
    expect(pickDriverIdPhoto([a, b])?.id).toBe("b");
  });
  it("unit: picks a truck image, skips insurance / permit images", () => {
    expect(pickUnitPhoto([f({ id: "t", original_filename: "Truck 114 front.jpg" })])?.id).toBe("t");
    expect(pickUnitPhoto([f({ original_filename: "insurance policy.jpg" })])).toBeNull();
    expect(pickUnitPhoto([f({ original_filename: "IMG_0001.jpg" })])).toBeNull();
  });
});
