import type { DriverQualificationFileItem } from "../api/safety";

export type DqfComplianceLevel = "compliant" | "attention" | "non_compliant" | "empty" | "unknown";

export type DqfComplianceSummary = {
  level: DqfComplianceLevel;
  label: string;
  itemCount: number;
  presentCount: number;
  missingCount: number;
  expiredCount: number;
  redExpiryCount: number;
  amberExpiryCount: number;
};

export function driverDisplayName(first?: string | null, last?: string | null, fallbackId?: string) {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || fallbackId || "Driver";
}

export function summarizeDriverDqf(items: DriverQualificationFileItem[] | undefined): DqfComplianceSummary {
  const empty = {
    itemCount: 0,
    presentCount: 0,
    missingCount: 0,
    expiredCount: 0,
    redExpiryCount: 0,
    amberExpiryCount: 0,
  };

  if (items === undefined) {
    return { level: "unknown", label: "Loading…", ...empty };
  }
  if (items.length === 0) {
    return { level: "empty", label: "No DQF items", ...empty };
  }

  const presentCount = items.filter((item) => item.status === "present").length;
  const missingCount = items.filter((item) => item.status === "missing").length;
  const expiredCount = items.filter((item) => item.status === "expired").length;
  const redExpiryCount = items.filter((item) => item.expiry_pill === "red").length;
  const amberExpiryCount = items.filter((item) => item.expiry_pill === "amber").length;
  const base = {
    itemCount: items.length,
    presentCount,
    missingCount,
    expiredCount,
    redExpiryCount,
    amberExpiryCount,
  };

  if (expiredCount > 0 || redExpiryCount > 0) {
    return { level: "non_compliant", label: "Non-compliant", ...base };
  }
  if (missingCount > 0 || amberExpiryCount > 0) {
    return { level: "attention", label: "Needs attention", ...base };
  }
  return { level: "compliant", label: "Compliant", ...base };
}

export function dqfComplianceChipClass(level: DqfComplianceLevel) {
  if (level === "compliant") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (level === "attention") return "bg-amber-50 text-amber-900 border-amber-200";
  if (level === "non_compliant") return "bg-red-50 text-red-800 border-red-200";
  if (level === "empty") return "bg-gray-50 text-gray-600 border-gray-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function dqfItemStatusClass(status: DriverQualificationFileItem["status"]) {
  if (status === "present") return "bg-emerald-50 text-emerald-800";
  if (status === "expired") return "bg-red-50 text-red-800";
  return "bg-amber-50 text-amber-800";
}

export function dqfExpiryPillClass(pill?: DriverQualificationFileItem["expiry_pill"]) {
  if (pill === "red") return "bg-red-100 text-red-800";
  if (pill === "amber") return "bg-amber-100 text-amber-800";
  if (pill === "green") return "bg-emerald-100 text-emerald-800";
  return "bg-gray-100 text-gray-700";
}
