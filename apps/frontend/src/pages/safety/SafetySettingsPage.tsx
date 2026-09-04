import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { getSafetySettings } from "../../api/safety";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { SafetySettingsForm } from "./components/SafetySettingsForm";

type Props = {
  operatingCompanyId: string;
};

export function SafetySettingsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["safety", "settings", operatingCompanyId],
    queryFn: () => getSafetySettings(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  if (settingsQuery.isLoading) return <div className="text-xs text-gray-500">Loading settings...</div>;
  if (settingsQuery.isError) {
    return (
      <div data-testid="safety-settings-query-error">
        <ListErrorState
          title="Couldn't load Safety settings"
          status={settingsQuery.error instanceof ApiError ? settingsQuery.error.status : 0}
          message={userFacingApiError(settingsQuery.error, "Couldn't load Safety settings.")}
          onRetry={() => void settingsQuery.refetch()}
        />
      </div>
    );
  }
  if (!settingsQuery.data) return <div className="text-xs text-gray-500">Settings not found.</div>;

  return (
    <SafetySettingsForm
      operatingCompanyId={operatingCompanyId}
      settings={settingsQuery.data}
      onSaved={() => void queryClient.invalidateQueries({ queryKey: ["safety", "settings", operatingCompanyId] })}
    />
  );
}
