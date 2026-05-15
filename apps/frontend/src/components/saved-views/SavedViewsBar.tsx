import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteSavedView, listSavedViews, saveView, type SavedViewRow } from "../../api/saved-views";
import { useToast } from "../Toast";

type Props = {
  tableName: string;
  currentView: Record<string, unknown>;
  onApply: (view: Record<string, unknown>) => void;
};

export function SavedViewsBar({ tableName, currentView, onApply }: Props) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [nameDraft, setNameDraft] = useState("");

  const q = useQuery({
    queryKey: ["saved-views", tableName],
    queryFn: () => listSavedViews(tableName),
  });

  const saveMu = useMutation({
    mutationFn: (name: string) => saveView(tableName, name, currentView),
    onSuccess: () => {
      pushToast("View saved", "success");
      setNameDraft("");
      void qc.invalidateQueries({ queryKey: ["saved-views", tableName] });
    },
    onError: () => pushToast("Could not save view", "error"),
  });

  const delMu = useMutation({
    mutationFn: (id: string) => deleteSavedView(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["saved-views", tableName] }),
  });

  const views = q.data?.views ?? [];

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-2 text-xs">
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase text-gray-500">Saved views</span>
        <select
          className="h-8 min-w-[160px] rounded border border-gray-300 bg-white px-2"
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const row = views.find((v: SavedViewRow) => v.id === id);
            if (row) onApply(row.view_json);
            e.target.value = "";
          }}
        >
          <option value="">Apply saved…</option>
          {views.map((v: SavedViewRow) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase text-gray-500">Save as</span>
        <div className="flex gap-1">
          <input
            className="h-8 w-40 rounded border border-gray-300 px-2"
            placeholder="Name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <button
            type="button"
            className="h-8 rounded border border-gray-300 bg-white px-2 font-semibold"
            disabled={!nameDraft.trim() || saveMu.isPending}
            onClick={() => void saveMu.mutateAsync(nameDraft.trim())}
          >
            Save
          </button>
        </div>
      </div>
      {views.length > 0 ? (
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase text-gray-500">Delete</span>
          <select
            className="h-8 min-w-[140px] rounded border border-gray-300 bg-white px-2 text-red-800"
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              void delMu.mutateAsync(id);
              e.target.value = "";
            }}
          >
            <option value="">Remove…</option>
            {views.map((v: SavedViewRow) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
