import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listFuelCardTypeIssuers } from "../../api/fuel-card-assignments";
import { DataPanel } from "../../components/layout/DataPanel";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = { operatingCompanyId: string; vendorId: string };

/**
 * ROUND 381.6 — reverse of the fuel card issuer link: the card types this vendor issues (Relay, Dreamline), each with
 * its live card count, and one hop to the Fuel Cards registry filtered to this vendor's cards. The forward side is the
 * Issuer column on /fuel/cards; the designation is made there (catalogs.fuel_card_types.issuer_vendor_id).
 */
export function VendorFuelCardsReverseSection({ operatingCompanyId, vendorId }: Props) {
  const query = useQuery({
    queryKey: ["fuel", "card-type-issuers", operatingCompanyId],
    queryFn: () => listFuelCardTypeIssuers(operatingCompanyId),
    enabled: Boolean(operatingCompanyId && vendorId),
  });
  const rows = (query.data?.rows ?? []).filter((t) => t.issuer_vendor_id === vendorId);
  if (!query.isError && !query.isLoading && rows.length === 0) return null;

  return (
    <DataPanel title="Fuel Cards Issued">
      {query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Couldn't load the fuel cards this vendor issues")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading fuel cards…</p>
      ) : (
        <div className="space-y-1" data-testid="vendor-fuel-cards-reverse">
          {rows.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 px-2 py-1.5 text-xs">
              <span className="font-semibold text-gray-900">{t.display_name}</span>
              <Link
                to={`/fuel/cards?vendor_id=${encodeURIComponent(vendorId)}`}
                className="text-[#1F2A44] hover:underline"
                data-testid={`vendor-fuel-cards-open-${t.code}`}
              >
                {t.active_card_count} card{t.active_card_count === 1 ? "" : "s"} on the Fuel Cards registry
              </Link>
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}
