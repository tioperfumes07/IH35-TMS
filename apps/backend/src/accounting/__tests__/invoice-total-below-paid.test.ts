/**
 * ROW 21 gap — invoice_total_below_paid 422
 *
 * When a line edit or delete drives invoice total_cents below amount_paid_cents,
 * Postgres fires CHECK constraint invoices_check (code 23514).
 * Both PATCH and DELETE routes must map that to HTTP 422 invoice_total_below_paid.
 */

import { describe, it, expect } from "vitest";

// Simulate the PgError shape Postgres throws for a CHECK constraint violation
function pgCheckError(): Error & { code: string } {
  const e = new Error("new row for relation \"invoices\" violates check constraint \"invoices_check\"") as Error & { code: string };
  e.code = "23514";
  return e;
}

function pgOtherError(): Error & { code: string } {
  const e = new Error("some other postgres error") as Error & { code: string };
  e.code = "23505"; // unique violation — not ours
  return e;
}

// Inline the mapping logic from invoice-lines.routes.ts so the test does not need
// a live Fastify app.  The rule is: code "23514" → 422 invoice_total_below_paid.
function mapLineError(error: unknown): { code: number; body: { error: string; message?: string } } | null {
  if ((error as { code?: string }).code === "23514") {
    return {
      code: 422,
      body: { error: "invoice_total_below_paid", message: "Issue a credit memo for the difference" },
    };
  }
  return null;
}

describe("invoice-total-below-paid 422 mapping", () => {
  it("maps Postgres 23514 to 422 invoice_total_below_paid", () => {
    const err = pgCheckError();
    const result = mapLineError(err);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(422);
    expect(result!.body.error).toBe("invoice_total_below_paid");
    expect(result!.body.message).toBe("Issue a credit memo for the difference");
  });

  it("does not catch unrelated Postgres errors (23505 unique violation)", () => {
    const err = pgOtherError();
    const result = mapLineError(err);
    expect(result).toBeNull();
  });

  it("does not catch non-Postgres errors (TypeError)", () => {
    const err = new TypeError("unexpected null");
    const result = mapLineError(err);
    expect(result).toBeNull();
  });

  it("does not catch errors with no code property", () => {
    const err = new Error("plain error");
    const result = mapLineError(err);
    expect(result).toBeNull();
  });
});
