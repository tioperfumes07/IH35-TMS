import { z } from "zod";

export const OFFICE_PASSWORD_HINT =
  "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.";

export const officePasswordSchema = z
  .string()
  .min(12, OFFICE_PASSWORD_HINT)
  .regex(/[a-z]/, OFFICE_PASSWORD_HINT)
  .regex(/[A-Z]/, OFFICE_PASSWORD_HINT)
  .regex(/[0-9]/, OFFICE_PASSWORD_HINT)
  .regex(/[^A-Za-z0-9]/, OFFICE_PASSWORD_HINT);
