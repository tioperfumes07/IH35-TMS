import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDriverLabels } from "../api/mdata";

export function chunkDriverLabelIds(ids: string[], size = 200): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

/** Exact, entity-scoped human labels for persisted driver FKs (including archived drivers). */
export function useDriverLabels(operatingCompanyId: string, driverIds: Array<string | null | undefined>) {
  const ids = useMemo(
    () => [...new Set(driverIds.filter((id): id is string => Boolean(id)))].sort(),
    [driverIds],
  );
  const query = useQuery({
    queryKey: ["mdata", "driver-labels", operatingCompanyId, ids],
    queryFn: async () => {
      const pages = await Promise.all(chunkDriverLabelIds(ids).map((page) => getDriverLabels(operatingCompanyId, page)));
      return { labels: pages.flatMap((page) => page.labels) };
    },
    enabled: Boolean(operatingCompanyId && ids.length),
  });
  const byId = useMemo(() => new Map((query.data?.labels ?? []).map((row) => [row.id, row.label])), [query.data?.labels]);
  return { ...query, byId };
}
