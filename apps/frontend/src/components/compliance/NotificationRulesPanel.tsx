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
  return (
    <div className="space-y-3" data-testid="compliance-rules-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Notification Rules</h3>
        <button type="button" className="rounded bg-blue-700 px-3 py-1 text-sm text-white" onClick={onCreate}>
          Create Rule
        </button>
      </div>
      <table className="min-w-full border text-sm">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="p-2">Credential</th>
            <th className="p-2">Scope</th>
            <th className="p-2">Days Before</th>
            <th className="p-2">Channels</th>
            <th className="p-2">Recipients</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="border-t">
              <td className="p-2">{rule.credential_type}</td>
              <td className="p-2">{rule.entity_scope}</td>
              <td className="p-2">{(rule.notify_days_before ?? []).join(", ") || "—"}</td>
              <td className="p-2">{(rule.channel ?? []).join(", ") || "—"}</td>
              <td className="p-2">{(rule.recipient_emails ?? []).join(", ") || "—"}</td>
              <td className="p-2">
                <button type="button" className="text-red-700 underline" onClick={() => onArchive(rule.id)}>
                  Archive
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
