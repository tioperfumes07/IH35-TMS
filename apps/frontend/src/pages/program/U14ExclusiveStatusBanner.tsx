import {
  U14_EXCLUSIVE_CERTIFIED_COUNT,
  U14_EXCLUSIVE_TOTAL,
} from "../../generated/module-completion";

/**
 * Seat-hop certify strip. Must never be read as Rule 24 Certified or matrix Live 100%.
 */
export function U14ExclusiveStatusBanner({ testId }: { testId: string }) {
  const all = U14_EXCLUSIVE_CERTIFIED_COUNT === U14_EXCLUSIVE_TOTAL;
  return (
    <p
      className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700"
      data-testid={testId}
    >
      <b>Urgent exclusive hops:</b> {U14_EXCLUSIVE_CERTIFIED_COUNT} of {U14_EXCLUSIVE_TOTAL}{" "}
      {all ? "certified" : "certified so far"} (seat hops + live SHA).{" "}
      <b>Not</b> the Rule 24 Certified column and <b>not</b> matrix Live 100%. Launch still
      requires Box 1–4 + money on USMCA. Do not recertify stamped rows.
    </p>
  );
}
