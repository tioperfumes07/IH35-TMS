import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { bulkUpdate, type BulkUpdateResponse } from "../../api/bulk";
import type { BulkFailure } from "./BulkProgressDialog";

type RunBulkArgs = {
  domain: string;
  resource: string;
  ids: string[];
  action: string;
  payload?: Record<string, unknown>;
  reason?: string;
  operatingCompanyId: string;
  invalidateKeys?: string[][];
  rowLabels?: Record<string, string>;
};

function attachRowLabels(failed: BulkFailure[], rowLabels?: Record<string, string>): BulkFailure[] {
  if (!rowLabels) return failed;
  return failed.map((row) => ({
    ...row,
    label: row.label ?? rowLabels[row.id],
  }));
}

function parseStructuredBulkBody(data: unknown): BulkUpdateResponse | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  if (!Array.isArray(raw.failed) && !Array.isArray(raw.succeeded) && raw.bulk_call_id == null) {
    return null;
  }
  return {
    requested: Number(raw.requested ?? 0),
    succeeded: Array.isArray(raw.succeeded) ? raw.succeeded.map(String) : [],
    failed: Array.isArray(raw.failed)
      ? raw.failed.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            id: String(row.id ?? ""),
            code: String(row.code ?? "E_UNKNOWN"),
            message: String(row.message ?? "Update failed"),
            ...(typeof row.label === "string" ? { label: row.label } : {}),
          };
        })
      : [],
    audit_log_ids: Array.isArray(raw.audit_log_ids) ? (raw.audit_log_ids as string[]) : [],
    bulk_call_id: String(raw.bulk_call_id ?? ""),
  };
}

function mapResponseFailures(response: BulkUpdateResponse, rowLabels?: Record<string, string>): BulkFailure[] {
  return attachRowLabels(
    response.failed.map((row) => ({
      id: row.id,
      message: row.message,
      code: row.code,
      label: "label" in row && typeof row.label === "string" ? row.label : undefined,
    })),
    rowLabels
  );
}

export function useEntityBulkAction() {
  const queryClient = useQueryClient();
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progress, setProgress] = useState({
    requested: 0,
    succeeded: 0,
    failed: [] as BulkFailure[],
    bulk_call_id: "",
  });

  const runBulk = async (args: RunBulkArgs, onSuccess?: () => void) => {
    setProgressOpen(true);
    setProgressLoading(true);
    setProgress({ requested: args.ids.length, succeeded: 0, failed: [], bulk_call_id: "" });

    try {
      const response: BulkUpdateResponse = await bulkUpdate(
        {
          domain: args.domain,
          resource: args.resource,
          ids: args.ids,
          action: args.action,
          payload: args.payload,
          reason: args.reason,
          operatingCompanyId: args.operatingCompanyId,
        },
        { operatingCompanyId: args.operatingCompanyId }
      );

      const failed = mapResponseFailures(response, args.rowLabels);
      setProgress({
        requested: response.requested,
        succeeded: response.succeeded.length,
        failed,
        bulk_call_id: response.bulk_call_id,
      });

      if (args.invalidateKeys) {
        await Promise.all(args.invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
      }
      onSuccess?.();
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bulk update failed";

      if (error instanceof ApiError) {
        const structured = parseStructuredBulkBody(error.data);
        if (structured) {
          const failed = mapResponseFailures(structured, args.rowLabels);
          setProgress({
            requested: structured.requested || args.ids.length,
            succeeded: structured.succeeded.length,
            failed,
            bulk_call_id: structured.bulk_call_id,
          });
          throw error;
        }
      }

      setProgress({
        requested: args.ids.length,
        succeeded: 0,
        failed: [{ id: "batch", message }],
        bulk_call_id: "",
      });
      throw error;
    } finally {
      setProgressLoading(false);
    }
  };

  return {
    progressOpen,
    setProgressOpen,
    progressLoading,
    progress,
    runBulk,
  };
}
