import { NA_REASON_TITLE, type NaReason } from "../../design/money-design-system";

// ROUND-20.8 A3 — NO BARE EM-DASH. A "—" must carry a title attribute saying why it is empty, and
// the three cases the spec names render as distinct, honest copy — not one undifferentiated dash.
// `reason` is a required prop (not optional) so a call site cannot render this without picking one
// of the three real cases.
type Props = { reason: NaReason; "data-testid"?: string };

export function NotApplicable({ reason, "data-testid": testId }: Props) {
  return (
    <span
      className="cursor-help border-b border-dotted border-[#c2ccd6] text-[#9aa7b4]"
      title={NA_REASON_TITLE[reason]}
      data-testid={testId}
      data-na-reason={reason}
    >
      —
    </span>
  );
}
