import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type Rule = {
  id: string;
  credential_type: string;
  entity_scope: string;
  recipient_emails?: string[] | null;
  notify_days_before?: number[] | null;
  channel?: string[] | null;
  active?: boolean;
};

type Props = {
  rules: Rule[];
  onCreate: () => void;
  onArchive: (id: string) => void;
};

export function NotificationRulesPanel({ rules, onCreate, onArchive }: Props) {
  const columns: Array<ParityColumn<Rule>> = [
    {
      key: "credential_type",
      label: "Credential",
      sortable: true,
    },
    {
      key: "entity_scope",
      label: "Scope",
      sortable: true,
    },
    {
      key: "notify_days_before",
      label: "Days Before",
      sortable: true,
      sortValue: (row) => (row.notify_days_before ?? []).join(","),
      render: (row) => (row.notify_days_before ?? []).join(", ") || "—",
    },
    {
      key: "channel",
      label: "Channels",
      sortable: true,
      sortValue: (row) => (row.channel ?? []).join(","),
      render: (row) => (row.channel ?? []).join(", ") || "—",
    },
    {
      key: "recipient_emails",
      label: "Recipients",
      sortable: true,
      sortValue: (row) => (row.recipient_emails ?? []).join(","),
      render: (row) => (row.recipient_emails ?? []).join(", ") || "—",
    },
    {
      key: "actions",
      label: "",
      alwaysVisible: true,
      render: (row) => (
        <button
          type="button"
          className="text-red-700 underline"
          onClick={(event) => {
            event.stopPropagation();
            onArchive(row.id);
          }}
        >
          Archive
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="compliance-rules-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Notification Rules</h3>
        <button type="button" className="rounded-sm bg-[#1F2A44] px-3 py-1 text-sm text-white" onClick={onCreate}>
          Create Rule
        </button>
      </div>
      <ParityTable
        columns={columns}
        rows={rules}
        rowKey={(row) => row.id}
        storageKey="compliance-notification-rules"
        emptyText="No notification rules."
        tableTestId="compliance-rules-table"
      />
    </div>
  );
}
