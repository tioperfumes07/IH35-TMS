/**
 * R-186.2 — legacy full-page route retained (never delete). Redirects into the Settlements
 * half-page Settlement Creator drawer (?creator=1). The live surface is SettlementCreatorDrawer.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function SettlementCreatorPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/driver-finance/settlements?creator=1", { replace: true });
  }, [navigate]);
  return (
    <div className="p-4 text-center text-xs text-[#6B7280]" data-testid="settlement-creator-page-redirect">
      Opening Settlement Creator…
    </div>
  );
}
