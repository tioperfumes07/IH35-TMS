import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Mirrors apps/backend/src/banking/banking.routes.ts accountsAllQuerySchema behavior.
const accountsAllQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  include_inactive: z.coerce.boolean().optional().default(false),
});

describe("banking accounts inactive query parsing", () => {
  it("defaults include_inactive to false", () => {
    const parsed = accountsAllQuerySchema.safeParse({
      operating_company_id: randomUUID(),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.include_inactive).toBe(false);
  });

  it("accepts include_inactive=true", () => {
    const parsed = accountsAllQuerySchema.safeParse({
      operating_company_id: randomUUID(),
      include_inactive: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.include_inactive).toBe(true);
  });
});
