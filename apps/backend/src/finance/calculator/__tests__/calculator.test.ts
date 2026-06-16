import { describe, expect, it } from "vitest";
import { computeCalculator, CalculatorValidationError } from "../calculator.service.js";

describe("FH-4 calculator (pure, no DB, never posts)", () => {
  const base = {
    operating_company_id: "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
    price_cents: 5_000_000, // $50,000
    down_payment_cents: 1_000_000, // $10,000 → financed $40,000
    first_payment_date: "2026-07-01",
  };

  it("computes a scenario: financed = price - down, payment > 0, interest > 0, payoff date set", () => {
    const out = computeCalculator({ ...base, scenarios: [{ annual_rate_pct: 6, term_months: 60 }] });
    expect(out.financed_principal_cents).toBe(4_000_000);
    const s = out.scenarios[0];
    expect(s.number_of_payments).toBe(60);
    expect(s.monthly_payment_cents).toBeGreaterThan(0);
    expect(s.total_interest_cents).toBeGreaterThan(0);
    expect(s.total_payments_cents).toBe(s.financed_principal_cents + s.total_interest_cents);
    expect(s.payoff_date).toBe("2031-06-01"); // 60 months from 2026-07-01
    expect(s.amortization_preview).toHaveLength(12);
  });

  it("compares scenarios: shorter term = higher payment, less total interest", () => {
    const out = computeCalculator({
      ...base,
      scenarios: [
        { annual_rate_pct: 6, term_months: 60 },
        { annual_rate_pct: 6, term_months: 36 },
      ],
    });
    expect(out.scenarios).toHaveLength(2);
    const [a, b] = out.scenarios;
    expect(b.monthly_payment_cents).toBeGreaterThan(a.monthly_payment_cents); // 36mo pays more/month
    expect(b.total_interest_cents).toBeLessThan(a.total_interest_cents); // but less total interest
  });

  it("0% interest: total interest is zero, payment = financed / term", () => {
    const out = computeCalculator({ ...base, scenarios: [{ annual_rate_pct: 0, term_months: 40 }] });
    const s = out.scenarios[0];
    expect(s.total_interest_cents).toBe(0);
    expect(s.monthly_payment_cents).toBe(100_000); // $40,000 / 40
  });

  it("rejects down payment >= price (nothing to finance)", () => {
    expect(() => computeCalculator({ ...base, down_payment_cents: 5_000_000, scenarios: [{ annual_rate_pct: 6, term_months: 60 }] })).toThrow(
      CalculatorValidationError
    );
  });
});
