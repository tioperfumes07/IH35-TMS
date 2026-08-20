import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../Button";
import { useToast } from "../Toast";
import { switchIdentityCompany } from "../../api/identity";
import type { MyCompany } from "../../api/org";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { selectedCompanySwitcherLabel } from "../../lib/selected-company-label";
import { userFacingApiError } from "../../lib/api-error-message";
import { filterLaunchOperatingCompanies } from "../../lib/launch-operating-company";

/** Launched (`is_active`) + USMCA-only until launch. TRANSP/TRK stay in org.companies (never-delete). */
function visibleCompanies(companies: MyCompany[]): MyCompany[] {
  return filterLaunchOperatingCompanies(companies);
}

export function CarrierSwitcher() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);
  const { companies, selectedCompanyId, selectedCompany, setSelectedCompany, setDefaultCompanyForUser } =
    useCompanyContext();
  const { pushToast } = useToast();

  const activeCompanies = useMemo(() => visibleCompanies(companies), [companies]);
  const showSwitcher = activeCompanies.length > 1;
  const selectedLabel = selectedCompanySwitcherLabel(selectedCompany);

  const defaultCompanyId = useMemo(
    () => activeCompanies.find((company) => company.is_default)?.id ?? null,
    [activeCompanies]
  );

  if (!showSwitcher) return null;

  async function switchCompany(company: MyCompany) {
    setSwitchingCompanyId(company.id);
    try {
      await switchIdentityCompany({ target_company_id: company.id, confirm: true });
      setSelectedCompany(company.id);
      await queryClient.invalidateQueries();
      pushToast(`Switched to ${company.short_name || company.legal_name}`, "success");
      setOpen(false);
    } catch (err) {
      pushToast(userFacingApiError(err, "Could not switch company"), "error");
    } finally {
      setSwitchingCompanyId(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex w-full min-w-0 max-w-[min(280px,100%)] items-center gap-1 rounded-sm border px-2 py-1 text-xs hover:bg-white/10"
        style={{ borderColor: "#2A3242", color: "#E5E7EB", backgroundColor: "#151A24" }}
        onClick={() => setOpen((current) => !current)}
        title={`Current company: ${selectedLabel}`}
        data-testid="carrier-switcher-trigger"
      >
        <span className="shrink-0 text-[10px] text-gray-300">Current:</span>
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-sm border border-gray-200 bg-white p-2 text-xs shadow-sm">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Company context</div>
          <div className="space-y-1">
            {activeCompanies.map((company) => {
              const isSelected = company.id === selectedCompanyId;
              const isDefault = company.id === defaultCompanyId;
              return (
                <div key={company.id} className="rounded-sm border border-gray-100 p-2">
                  <div className={`w-full text-left ${isSelected ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                    {company.short_name || company.legal_name}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                    <span>{company.code}</span>
                    {isSelected ? <span>Current</span> : isDefault ? <span>Default</span> : null}
                  </div>
                  {!isSelected ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        className="h-7 px-2 py-1 text-[11px]"
                        disabled={switchingCompanyId !== null}
                        onClick={() => void switchCompany(company)}
                      >
                        {switchingCompanyId === company.id ? "Switching…" : "Switch"}
                      </Button>
                      {!isDefault ? (
                        <Button
                          variant="secondary"
                          type="button"
                          className="h-7 px-2 py-1 text-[11px]"
                          disabled={switchingCompanyId !== null}
                          onClick={async () => {
                            await setDefaultCompanyForUser(company.id);
                            setOpen(false);
                          }}
                        >
                          Make default
                        </Button>
                      ) : null}
                    </div>
                  ) : !isDefault ? (
                    <div className="mt-2">
                      <Button
                        variant="secondary"
                        type="button"
                        className="h-7 px-2 py-1 text-[11px]"
                        disabled={switchingCompanyId !== null}
                        onClick={async () => {
                          await setDefaultCompanyForUser(company.id);
                          setOpen(false);
                        }}
                      >
                        Make default
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
