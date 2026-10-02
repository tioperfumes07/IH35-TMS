import { describe, expect, it } from "vitest";
import { checkAmountInWords, renderCheckBody } from "../check.template.js";

describe("queue item 15 (G-16) — the printable check", () => {
  it("writes the amount the way a bank reads it", () => {
    expect(checkAmountInWords(123456)).toBe("One Thousand Two Hundred Thirty-Four and 56/100");
    expect(checkAmountInWords(5)).toBe("Zero and 05/100");
    expect(checkAmountInWords(100000000)).toBe("One Million and 00/100");
    expect(checkAmountInWords(4021900)).toBe("Forty Thousand Two Hundred Nineteen and 00/100");
  });

  it("places the face by the stock offsets and adds two stubs on voucher stock only", () => {
    const base = { checkNumber: "1001", date: "2026-10-02", payeeName: "ACME <Tires>", payeeAddress: null, amountCents: 25000, memo: "Inv 7", companyName: "USMCA", companyAddress: null, bankName: "Bank of America", offsetXmm: 2.5, offsetYmm: -1, printCompanyAddress: true };
    const voucher = renderCheckBody({ ...base, checkType: "voucher" });
    expect(voucher).toContain("padding-left:2.5mm;padding-top:-1mm");
    expect(voucher.match(/ck-stub"/g)?.length).toBe(2);
    expect(voucher).toContain("ACME &lt;Tires&gt;");
    expect(renderCheckBody({ ...base, checkType: "standard" }).match(/ck-stub"/g)).toBeNull();
  });
});
