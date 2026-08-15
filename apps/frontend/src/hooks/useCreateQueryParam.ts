import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Lists Live Chrome deep-link: ?create=1 opens the create chrome then strips the param
 * (AccountingCatalogListPage / void-cancel / posting-templates / items parity).
 */
export function useCreateQueryParam(opts: {
  companyId: string;
  enabled?: boolean;
  onOpenCreate: () => void;
}): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const enabled = opts.enabled !== false;
  const { companyId, onOpenCreate } = opts;
  const onOpenRef = useRef(onOpenCreate);
  onOpenRef.current = onOpenCreate;

  useEffect(() => {
    if (!enabled) return;
    if (searchParams.get("create") !== "1" || !companyId) return;
    onOpenRef.current();
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [searchParams, companyId, enabled, setSearchParams]);
}
