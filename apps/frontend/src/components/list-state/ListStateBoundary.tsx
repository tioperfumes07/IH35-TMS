import type { ReactNode } from "react";
import { ListErrorState } from "../ListErrorState";
import { listQueryStatus, resolveListState } from "./listState";

/** Neutral, palette-safe message used for the loading and empty slots (slate, never red). */
export function ListStateMessage({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`px-1 py-2 text-xs text-slate-500 ${className ?? ""}`}>{children}</p>;
}

type Props = {
  /** react-query result driving the state. */
  query: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    error?: unknown;
    refetch: () => unknown;
  };
  /** True when the rows about to be rendered (after client-side filter) are zero. */
  isEmpty: boolean;
  /** Rendered ONLY when the query has settled with zero rows. */
  empty: ReactNode;
  /** Rendered while loading/settling. Defaults to a neutral "Loading…" message. */
  loading?: ReactNode;
  /** Rendered on a settled error. Defaults to the shared ListErrorState with Retry. */
  error?: ReactNode;
  /** Label woven into the default loading/error copy, e.g. "vendors". */
  entityLabel?: string;
  /** The list itself — rendered only when there is settled data. */
  children: ReactNode;
};

/**
 * Single primitive that guarantees a paged list's empty state is shown ONLY on a
 * settled, zero-row query — never mid-fetch. Loading and error are surfaced
 * distinctly; error is never collapsed into empty.
 */
export function ListStateBoundary({ query, isEmpty, empty, loading, error, entityLabel, children }: Props) {
  const state = resolveListState(listQueryStatus(query), isEmpty);

  if (state === "error") {
    return (
      <>
        {error ?? (
          <ListErrorState
            title={entityLabel ? `Couldn't load ${entityLabel}` : "Couldn't load list"}
            status={0}
            message={(query.error as Error | undefined)?.message}
            onRetry={() => void query.refetch()}
          />
        )}
      </>
    );
  }

  if (state === "loading") {
    return <>{loading ?? <ListStateMessage>Loading{entityLabel ? ` ${entityLabel}` : ""}…</ListStateMessage>}</>;
  }

  if (state === "empty") {
    return <>{empty}</>;
  }

  return <>{children}</>;
}
