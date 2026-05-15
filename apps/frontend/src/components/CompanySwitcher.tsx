import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { switchIdentityCompany } from "../api/identity";
import { ApiError } from "../api/client";
import type { MyCompany } from "../api/org";
import { useCompanyContext } from "../contexts/CompanyContext";
import { setPostReloadToast } from "./PostReloadToastHost";

export function CompanySwitcher() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<MyCompany | null>(null);
  const [switching, setSwitching] = useState(false);
  const { companies, selectedCompanyId, selectedCompany, setSelectedCompany, setDefaultCompanyForUser } = useCompanyContext();
  const { pushToast } = useToast();

  const showSwitcher = companies.length > 1;
  const selectedLabel = selectedCompany?.short_name || selectedCompany?.legal_name || "Select company";

  const defaultCompanyId = useMemo(() => companies.find((company) => company.is_default)?.id ?? null, [companies]);

  if (!showSwitcher) return null;

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-white/10"
        style={{ borderColor: "#2A3242", color: "#E5E7EB", backgroundColor: "#151A24" }}
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
                      if (company.id === selectedCompanyId) {
                        setOpen(false);
                        return;
                      }
                      setPending(company);
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

      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title="Switch company"
        modalKind="company-switch-confirm"
        sizePreset="sm"
        resizable
      >
        <div className="space-y-3 text-sm text-gray-800">
          <p>
            Switch to <span className="font-semibold">{pending?.short_name || pending?.legal_name}</span>? Workspace will reload.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setPending(null)} disabled={switching}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={switching || !pending}
              onClick={async () => {
                if (!pending) return;
                setSwitching(true);
                try {
                  await switchIdentityCompany({ target_company_id: pending.id, confirm: true });
                  setSelectedCompany(pending.id);
                  setPostReloadToast({
                    message: `Switched to ${pending.short_name || pending.legal_name}`,
                    kind: "success",
                  });
                  window.location.reload();
                } catch (err) {
                  setSwitching(false);
                  if (err instanceof ApiError) {
                    pushToast(err.message || "Could not switch company", "error");
                    return;
                  }
                  pushToast("Could not switch company", "error");
                }
              }}
            >
              {switching ? "Switching…" : "Confirm"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
