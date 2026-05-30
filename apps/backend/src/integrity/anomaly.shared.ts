import { z } from "zod";

export const ANOMALY_TYPES = [
  "orphaned-bill",
  "driver-without-medcard",
  "unit-overdue-pm",
] as const;

export const ANOMALY_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const ANOMALY_STATUSES = ["new", "acknowledged", "resolved", "dismissed"] as const;
export const ANOMALY_SUBJECT_TYPES = ["driver", "unit", "customer", "invoice"] as const;

export const AnomalyTypeSchema = z.enum(ANOMALY_TYPES);
export const SeveritySchema = z.enum(ANOMALY_SEVERITIES);
export const StatusSchema = z.enum(ANOMALY_STATUSES);
export const SubjectTypeSchema = z.enum(ANOMALY_SUBJECT_TYPES);

export const AnomalySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  anomaly_type: AnomalyTypeSchema,
  severity: SeveritySchema,
  subject_type: SubjectTypeSchema,
  subject_id: z.string().uuid(),
  detected_at: z.string(),
  detector_version: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()),
  status: StatusSchema,
  status_changed_at: z.string().nullable(),
  status_changed_by: z.string().uuid().nullable(),
  resolution_note: z.string().nullable(),
});

export type AnomalyType = z.infer<typeof AnomalyTypeSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type AnomalyStatus = z.infer<typeof StatusSchema>;
export type SubjectType = z.infer<typeof SubjectTypeSchema>;
export type Anomaly = z.infer<typeof AnomalySchema>;
