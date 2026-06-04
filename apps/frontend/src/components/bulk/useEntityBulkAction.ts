import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bulkUpdate, type BulkUpdateResponse } from "../../api/bulk";

type RunBulkArgs = {
  domain: string;
  resource: string;
  ids: string[];
  action: string;
  payload?: Record<string, unknown>;
  reason?: string;
  operatingCompanyId: string;
  invalidateKeys?: string[][];
};

export function useEntityBulkAction() {
  const queryClient = useQueryClient();
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progress, setProgress] = useState({
    requested: 0,
    succeeded: 0,
    failed: [] as Array<{ id: string; message: string; code?: string }>,
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

      const failed = response.failed.map((row) => ({
        id: row.id,
        message: row.message,
        code: row.code,
      }));
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
      setProgress({
        requested: args.ids.length,
        succeeded: 0,
        failed: args.ids.map((id) => ({ id, message })),
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
