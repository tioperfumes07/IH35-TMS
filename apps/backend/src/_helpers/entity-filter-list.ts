import { z } from "zod";

/** Read filters only. Legacy one-id links remain valid; values are never SQL text. */
export const entityIdFilterSchema = z.string().trim().min(1).transform((value, ctx) => {
  const ids = value.split(",").map((id) => id.trim());
  if (ids.length > 100 || ids.some((id) => !z.string().uuid().safeParse(id).success)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expected 1–100 comma-separated UUIDs" });
    return z.NEVER;
  }
  return [...new Set(ids)].join(",");
});

/** Pass the returned array as a bound uuid[] parameter to ANY / array-overlap. */
export function entityIdFilterValues(value: string): string[] {
  return entityIdFilterSchema.parse(value).split(",");
}
