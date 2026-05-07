import { useState } from "react";
import { Button } from "../../../components/Button";

type Props = {
  loading?: boolean;
  onComplete: (completedDate: string, notes: string) => void;
};

export function CompanyViolationCorrectiveActionForm({ loading, onComplete }: Props) {
  const [completedDate, setCompletedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  return (
    <form
      className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onComplete(completedDate, notes);
      }}
    >
      <div className="text-xs font-semibold text-gray-700">Complete corrective action</div>
      <div className="grid gap-2 md:grid-cols-2">
        <input
          type="date"
          value={completedDate}
          onChange={(event) => setCompletedDate(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
          placeholder="Completion notes"
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={loading}>
          Mark completed
        </Button>
      </div>
    </form>
  );
}
