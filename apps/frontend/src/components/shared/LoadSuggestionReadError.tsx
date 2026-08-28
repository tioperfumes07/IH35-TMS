import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorBanner } from "./ListErrorBanner";

type SuggestionQueryState = {
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

/**
 * Shared fail-loud state for the going-forward active-trip resolver.
 * Manual load selection stays available; operators are told when auto-linkage did not run.
 */
export function LoadSuggestionReadError({ query }: { query: SuggestionQueryState }) {
  if (!query.isError) return null;
  return (
    <ListErrorBanner
      message={userFacingApiError(query.error, "Active-trip load suggestion failed. Select a load manually or retry.")}
      onRetry={() => void query.refetch()}
    />
  );
}
