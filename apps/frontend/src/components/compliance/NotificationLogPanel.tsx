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

export function NotificationLogPanel({ entries }: Props) {
  return (
    <div data-testid="compliance-log-panel">
      <h3 className="mb-3 text-lg font-semibold">Notification Log</h3>
      <table className="min-w-full border text-sm">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="p-2">Sent</th>
            <th className="p-2">Credential</th>
            <th className="p-2">Owner Type</th>
            <th className="p-2">Channel</th>
            <th className="p-2">Recipient</th>
            <th className="p-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t">
              <td className="p-2">{new Date(entry.sent_at).toLocaleString()}</td>
              <td className="p-2">{entry.credential_type}</td>
              <td className="p-2">{entry.entity_type}</td>
              <td className="p-2">{entry.channel}</td>
              <td className="p-2">{entry.recipient}</td>
              <td className="p-2">{entry.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
