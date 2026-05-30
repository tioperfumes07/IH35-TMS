import { z } from "zod";

export const cancelReasonCodeValues = [
  "customer_request",
  "no_truck_available",
  "weather",
  "hos_violation",
  "equipment_failure",
  "payment_concern",
  "other",
] as const;

export const CancelReasonCodeSchema = z.enum(cancelReasonCodeValues);

export const CancelReasonSchema = z.string().trim().min(1).max(2000);
