import { describe, expect, it } from "vitest";
import { parseQBText, qbDateInPeriod } from "../parseQBText";
import type { BankAccount } from "../../types";

const ACCOUNTS: BankAccount[] = [{ id: "WF-3500", label: "Wells Fargo – WF-3500", number: "xxxx3500" }];

describe("parseQBText — F425C-QBIMPORT-PAREN-NEGATIVE-DROPPED-SIGN", () => {
  it("includes a real positive deposit", () => {
    const rows = parseQBText("01/05/2026\tDeposit\tCustomer Payment\tWF-3500\t12500.00", ACCOUNTS);
    expect(rows).toHaveLength(1);
    expect(rows[0].amt).toBe(12500);
  });

  it("excludes a parenthesized (reversed/NSF) deposit instead of flipping its sign positive", () => {
    const rows = parseQBText("01/06/2026\tDeposit\tNSF Returned Check\tWF-3500\t(500.00)", ACCOUNTS);
    expect(rows).toHaveLength(0);
  });

  it("excludes a plain-minus-sign negative deposit (already worked, must keep working)", () => {
    const rows = parseQBText("01/06/2026\tDeposit\tReversal\tWF-3500\t-500.00", ACCOUNTS);
    expect(rows).toHaveLength(0);
  });

  it("still strips $ and thousands-commas on a real positive amount", () => {
    const rows = parseQBText("01/07/2026\tDeposit\tCustomer Payment\tWF-3500\t$1,234.56", ACCOUNTS);
    expect(rows).toHaveLength(1);
    expect(rows[0].amt).toBeCloseTo(1234.56);
  });
});

describe("qbDateInPeriod", () => {
  it("matches US-format dates in the given month/year", () => {
    expect(qbDateInPeriod("08/15/2026", 7, 2026)).toBe(true);
    expect(qbDateInPeriod("08/15/2026", 6, 2026)).toBe(false);
  });

  it("matches ISO-format dates in the given month/year", () => {
    expect(qbDateInPeriod("2026-08-15", 7, 2026)).toBe(true);
  });

  it("fails closed on an unrecognized date format", () => {
    expect(qbDateInPeriod("not-a-date", 7, 2026)).toBe(false);
  });
});
