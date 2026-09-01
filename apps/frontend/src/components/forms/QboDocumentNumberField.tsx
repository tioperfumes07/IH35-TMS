import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { apiRequest } from "../../api/client";

export type NextDocumentNumber = {
  suggested: string;
  derived_from: string | null;
  document_number?: string;
  taken?: boolean;
};

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  operatingCompanyId: string;
  nextNumberPath?: string;
  checkPath?: string;
  fieldName: string;
  locked?: boolean;
  lockReason?: string;
  disabled?: boolean;
  hint?: string;
  "data-testid"?: string;
};

/**
 * GO-06 — QBO custom transaction numbers.
 * Box starts empty. Operator types verbatim or leaves blank (server mints on save).
 * GET next-number is a caption hint only — never auto-fills the input.
 */
export function QboDocumentNumberField({
  label,
  value,
  onChange,
  operatingCompanyId,
  nextNumberPath,
  checkPath,
  fieldName,
  locked = false,
  lockReason,
  disabled,
  hint,
  "data-testid": testId = "qbo-document-number",
}: Props) {
  const nextQuery = useQuery({
    queryKey: ["qbo-next-number", nextNumberPath, operatingCompanyId],
    queryFn: () =>
      apiRequest<NextDocumentNumber>(
        `${nextNumberPath}${nextNumberPath!.includes("?") ? "&" : "?"}operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
    enabled: Boolean(operatingCompanyId) && !locked && Boolean(nextNumberPath),
    staleTime: 10_000,
  });

  const checkQuery = useQuery({
    queryKey: ["qbo-number-taken", checkPath, operatingCompanyId, value],
    queryFn: () =>
      apiRequest<NextDocumentNumber>(
        `${checkPath}?operating_company_id=${encodeURIComponent(operatingCompanyId)}&check=${encodeURIComponent(value.trim())}`
      ),
    enabled: Boolean(checkPath && operatingCompanyId && value.trim() && !locked),
  });

  const taken = Boolean(checkQuery.data?.taken);
  const suggested = nextQuery.data?.suggested?.trim() || nextQuery.data?.document_number?.trim() || "";

  return (
    <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-semibold text-gray-700">
      <span className="flex items-center gap-1">
        {label}
        {locked ? <Lock className="h-3 w-3" aria-label={lockReason ?? "Locked after post"} /> : null}
      </span>
      <input
        data-testid={testId}
        aria-label={label}
        className="h-8 w-full rounded-sm border border-gray-300 bg-white px-2 text-right text-xs font-mono placeholder:text-gray-400"
        value={value}
        disabled={disabled || locked}
        placeholder={suggested}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
      />
      {taken ? (
        <span className="font-normal text-red-700">Already used on {fieldName} {value.trim()}.</span>
      ) : (
        <span className="font-normal text-gray-500">
          {hint
            ?? (suggested
              ? "Leave blank to mint. Grey text is a hint only — it is not in the box."
              : "Leave blank to mint. Type any number you want.")}
        </span>
      )}
      {locked && lockReason ? <span className="font-normal text-gray-500">{lockReason}</span> : null}
    </label>
  );
}
