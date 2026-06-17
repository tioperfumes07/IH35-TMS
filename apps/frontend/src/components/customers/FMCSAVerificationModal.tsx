import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError } from "../../api/client";
import { linkFmcsaLookupToCustomer, lookupFmcsa, type FmcsaLookupResult, type FmcsaLookupType } from "../../api/fmcsa";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import { StatusBadge } from "../layout/StatusBadge";

type Props = {
  open: boolean;
  onClose: () => void;
  customerId?: string;
  initialUsdot?: string | null;
  initialMc?: string | null;
  onApplyToCustomer?: (result: FmcsaLookupResult) => void;
  onSavedAsVerified?: (result: { lookupId: string; verifiedAt: string }) => void;
};

function authorityVariant(status: string): "positive" | "crit" | "neutral" {
  if (status === "ACTIVE") return "positive";
  if (status === "INACTIVE" || status === "REVOKED") return "crit";
  return "neutral";
}

function cleanedLookupInput(type: FmcsaLookupType, value: string) {
  if (type === "mc") return value.trim().replace(/^MC[-\s]*/i, "").replace(/[^\d]/g, "");
  return value.trim().replace(/[^\d]/g, "");
}

export function FMCSAVerificationModal({
  open,
  onClose,
  customerId,
  initialUsdot,
  initialMc,
  onApplyToCustomer,
  onSavedAsVerified,
}: Props) {
  const { pushToast } = useToast();
  const [lookupType, setLookupType] = useState<FmcsaLookupType>("usdot");
  const [lookupValue, setLookupValue] = useState("");
  const [result, setResult] = useState<FmcsaLookupResult | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const displayLookupValue = useMemo(() => cleanedLookupInput(lookupType, lookupValue), [lookupType, lookupValue]);

  const lookupMutation = useMutation({
    mutationFn: (payload: { type: FmcsaLookupType; value: string }) => lookupFmcsa(payload),
    onSuccess: (data) => {
      setResult(data);
      setInputError(null);
      pushToast(data.cached ? "FMCSA result loaded from cache" : "FMCSA verification completed", "success");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        setResult(null);
        setInputError("Carrier not found in FMCSA.");
        return;
      }
      setInputError("FMCSA lookup failed. Please try again.");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (lookupId: string) => {
      if (!customerId) throw new Error("customer_id_required");
      return linkFmcsaLookupToCustomer(customerId, lookupId);
    },
    onSuccess: (data) => {
      pushToast("FMCSA verification saved on customer", "success");
      onSavedAsVerified?.({ lookupId: data.customer.fmcsa_lookup_id, verifiedAt: data.customer.fmcsa_verified_at });
    },
    onError: () => pushToast("Failed to save FMCSA verification", "error"),
  });

  function resetAndClose() {
    setLookupType("usdot");
    setLookupValue("");
    setResult(null);
    setInputError(null);
    onClose();
  }

  async function runLookup() {
    const normalized = cleanedLookupInput(lookupType, lookupValue);
    if (!normalized) {
      setInputError("Enter a valid numeric USDOT or MC number.");
      return;
    }
    setInputError(null);
    await lookupMutation.mutateAsync({ type: lookupType, value: normalized });
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Verify FMCSA Authority">
      <div className="space-y-3">
        <div className="rounded border border-gray-200 p-3">
          <div className="text-xs font-semibold text-gray-600">Lookup Type</div>
          <div className="mt-2 flex gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="fmcsa-lookup-type"
                checked={lookupType === "usdot"}
                onChange={() => {
                  setLookupType("usdot");
                  setLookupValue(initialUsdot ?? "");
                }}
              />
              USDOT Number
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="fmcsa-lookup-type"
                checked={lookupType === "mc"}
                onChange={() => {
                  setLookupType("mc");
                  setLookupValue(initialMc ?? "");
                }}
              />
              MC / Docket Number
            </label>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold text-gray-600">{lookupType === "usdot" ? "USDOT Number" : "MC Number"}</label>
            <input
              value={lookupValue}
              onChange={(event) => setLookupValue(event.target.value)}
              placeholder={lookupType === "usdot" ? "e.g. 384859" : "e.g. MC-123456"}
              className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>

          {inputError ? <div className="mt-2 text-xs text-red-600">{inputError}</div> : null}
          {displayLookupValue ? <div className="mt-1 text-[11px] text-gray-500">Searching: {lookupType.toUpperCase()} {displayLookupValue}</div> : null}
          <div className="mt-3">
            <Button onClick={() => void runLookup()} loading={lookupMutation.isPending}>
              Verify
            </Button>
          </div>
        </div>

        {result ? (
          <div className="rounded border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <StatusBadge variant={authorityVariant(result.authority_status)}>{`Authority: ${result.authority_status}`}</StatusBadge>
              {result.cached ? <StatusBadge variant="info">Cached</StatusBadge> : null}
            </div>
            <div className="grid gap-1 text-sm">
              <div><strong>Legal Name:</strong> {result.legal_name ?? "-"}</div>
              <div><strong>DBA:</strong> {result.dba_name ?? "-"}</div>
              <div><strong>USDOT:</strong> {result.usdot_number ?? "-"}</div>
              <div><strong>MC:</strong> {result.mc_number ?? "-"}</div>
              <div><strong>Address:</strong> {[result.address_line1, result.city, result.state, result.zip].filter(Boolean).join(", ") || "-"}</div>
              <div><strong>Phone:</strong> {result.phone ?? "-"}</div>
              <div><strong>Insurance Status:</strong> {result.insurance_status ?? "-"}</div>
              <div><strong>Safety Rating:</strong> {result.safety_rating ?? "NONE"}</div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500">Fetched at {new Date(result.fetched_at).toLocaleString()}</div>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={resetAndClose}>
            Close
          </Button>
          <Button type="button" variant="secondary" disabled={!result} onClick={() => result && onApplyToCustomer?.(result)}>
            Apply to Customer
          </Button>
          <Button
            type="button"
            disabled={!result || !customerId}
            onClick={() => result && saveMutation.mutate(result.lookup_id)}
            loading={saveMutation.isPending}
          >
            Save as Verified
          </Button>
        </div>
      </div>
    </Modal>
  );
}
