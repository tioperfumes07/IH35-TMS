import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type LogEntry = {
  id: string;
  sent_at: string;
  credential_type: string;
  entity_type: string;
  channel: string;
  recipient: string;
  status: string;
  days_until_expiration: number | null;
};

type Props = { entries: LogEntry[] };

const COLUMNS: Array<ParityColumn<LogEntry>> = [
  {
    key: "sent_at",
    label: "Sent",
    sortable: true,
    sortValue: (row) => row.sent_at,
    render: (row) => new Date(row.sent_at).toLocaleString(),
  },
  {
    key: "credential_type",
    label: "Credential",
    sortable: true,
  },
  {
    key: "entity_type",
    label: "Owner Type",
    sortable: true,
  },
  {
    key: "channel",
    label: "Channel",
    sortable: true,
  },
  {
    key: "recipient",
    label: "Recipient",
    sortable: true,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
  },
];

export function NotificationLogPanel({ entries }: Props) {
  return (
    <div className="space-y-3" data-testid="compliance-log-panel">
      <h3 className="text-page-title font-semibold">Notification Log</h3>
      <ParityTable
        rows={entries}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        loading={false}
        storageKey="compliance-notification-log"
        emptyText="No notification log entries."
        exportFilename="compliance-notification-log"
        tableTestId="compliance-notification-log-table"
        rowTestId={(row) => `compliance-notification-log-${row.id}`}
      />
    </div>
  );
}
