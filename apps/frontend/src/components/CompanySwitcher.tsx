import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "./Button";
import { useCompanyContext } from "../contexts/CompanyContext";

export function CompanySwitcher() {
  const [open, setOpen] = useState(false);
  const { companies, selectedCompanyId, selectedCompany, setSelectedCompany, setDefaultCompanyForUser } = useCompanyContext();

  const showSwitcher = companies.length > 1;
  const selectedLabel = selectedCompany?.short_name || selectedCompany?.legal_name || "Select company";

  const defaultCompanyId = useMemo(() => companies.find((company) => company.is_default)?.id ?? null, [companies]);

  if (!showSwitcher) return null;

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        onClick={() => setOpen((current) => !current)}
      >
        {selectedLabel}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded border border-gray-200 bg-white p-2 text-xs shadow">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Company context</div>
          <div className="space-y-1">
            {companies.map((company) => {
              const isSelected = company.id === selectedCompanyId;
              const isDefault = company.id === defaultCompanyId;
              return (
                <div key={company.id} className="rounded border border-gray-100 p-2">
                  <button
                    type="button"
                    className={`w-full text-left ${isSelected ? "font-semibold text-gray-900" : "text-gray-700"}`}
                    onClick={() => {
                      setSelectedCompany(company.id);
                      setOpen(false);
                    }}
                  >
                    {company.short_name || company.legal_name}
                  </button>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                    <span>{company.code}</span>
                    {isDefault ? <span>Default</span> : null}
                  </div>
                  {!isDefault ? (
                    <div className="mt-2">
                      <Button
                        variant="secondary"
                        type="button"
                        className="h-7 px-2 py-1 text-[11px]"
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
