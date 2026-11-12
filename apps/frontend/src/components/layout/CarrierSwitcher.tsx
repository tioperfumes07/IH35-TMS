import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../Button";
import { useToast } from "../Toast";
import { switchIdentityCompany } from "../../api/identity";
import { getPerfumeAccess } from "../../api/perfume";
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
  // The top bar's status strip is overflow-hidden (Topbar.tsx), which clipped this absolutely-positioned panel to the
  // 26px strip — the company list and the TIO Perfumes entry were in the DOM but invisible. The panel is portaled to
  // <body> and fixed under the trigger instead, and closes on an outside mousedown or Escape.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setPanelPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);
  const { companies, selectedCompanyId, selectedCompany, setSelectedCompany, setDefaultCompanyForUser } =
    useCompanyContext();
  const { pushToast } = useToast();

  const activeCompanies = useMemo(() => visibleCompanies(companies), [companies]);
  const auth = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  // PERFUME-DESK: the Owner also sees "Other businesses → TIO Perfumes". It is NOT a carrier in
  // org.companies (no carrier engine, cron or seeder ever runs against it); it opens the isolated price desk.
  // Only the login listed in perfume.desk_users sees it — not every Owner-role user.
  const isOwnerRole = String(auth.user?.role ?? "") === "Owner";
  const perfumeAccess = useQuery({ queryKey: ["perfume", "access"], queryFn: getPerfumeAccess, enabled: isOwnerRole, staleTime: 300_000, retry: false });
  const isOwner = isOwnerRole && perfumeAccess.data?.allowed === true;
  const showSwitcher = activeCompanies.length > 1 || isOwner;
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
        ref={triggerRef}
        type="button"
        className="inline-flex w-full min-w-0 max-w-[min(280px,100%)] items-center gap-1 rounded-sm border px-2 py-1 text-xs hover:bg-white/10"
        style={{ borderColor: "#2A3242", color: "#E5E7EB", backgroundColor: "#151A24" }}
        onClick={() => setOpen((current) => !current)}
        title={`Current company: ${selectedLabel}`}
        data-testid="carrier-switcher-trigger"
      >
        <span className="shrink-0 text-xs text-gray-300">Current:</span>
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {open && panelPos ? createPortal(
        <div
          ref={panelRef}
          data-testid="carrier-switcher-panel"
          className="fixed z-[1000] w-72 rounded-sm border border-gray-200 bg-white p-2 text-xs shadow-sm"
          style={{ top: panelPos.top, right: panelPos.right }}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Company context</div>
          <div className="space-y-1">
            {activeCompanies.map((company) => {
              const isSelected = company.id === selectedCompanyId;
              const isDefault = company.id === defaultCompanyId;
              return (
                <div key={company.id} className="p-2">
                  <div className={`w-full text-left ${isSelected ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                    {company.short_name || company.legal_name}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                    <span>{company.code}</span>
                    {isSelected ? <span>Current</span> : isDefault ? <span>Default</span> : null}
                  </div>
                  {!isSelected ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        className="h-7 px-2 py-1 text-xs"
                        disabled={switchingCompanyId !== null}
                        onClick={() => void switchCompany(company)}
                      >
                        {switchingCompanyId === company.id ? "Switching…" : "Switch"}
                      </Button>
                      {!isDefault ? (
                        <Button
                          variant="secondary"
                          type="button"
                          className="h-7 px-2 py-1 text-xs"
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
                        className="h-7 px-2 py-1 text-xs"
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
          {isOwner ? (
            <div className="mt-2 border-t border-gray-200 pt-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("carrierSwitcher.otherBusinesses", "Other businesses")}</div>
              <button
                type="button"
                className="w-full rounded-sm p-2 text-left text-gray-700 hover:bg-gray-50"
                data-testid="carrier-switcher-tio-perfumes"
                onClick={() => {
                  setOpen(false);
                  navigate("/perfume");
                }}
              >
                <div className="font-semibold text-gray-900">{t("carrierSwitcher.tioPerfumes", "TIO Perfumes")}</div>
                <div className="mt-1 text-xs text-gray-500">{t("carrierSwitcher.tioPerfumesHint", "Price desk · separate from every carrier")}</div>
              </button>
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
