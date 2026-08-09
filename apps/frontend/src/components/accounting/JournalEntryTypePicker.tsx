import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { journalEntryTypesCatalogClient } from "../../api/catalogs-accounting";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { ParityDrawer } from "../parity/ParityDrawer";
import { useToast } from "../Toast";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  operatingCompanyId: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

export function JournalEntryTypePicker({ operatingCompanyId, value, onChange, disabled }: Props) {
  const { pushToast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [draftCode, setDraftCode] = useState("");
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);

  const typesQuery = useQuery({
    queryKey: ["journal-entry-types", "picker", operatingCompanyId],
    queryFn: () =>
      journalEntryTypesCatalogClient.list({
        operating_company_id: operatingCompanyId,
        is_active: "true",
        limit: 200,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const options = useMemo(
    () =>
      (typesQuery.data?.rows ?? []).map((row) => ({
        value: row.id,
        label: row.display_name,
        sublabel: row.code,
      })),
    [typesQuery.data]
  );

  const saveNew = async () => {
    const code = draftCode.trim();
    const display_name = draftName.trim();
    if (!code || !display_name) {
      pushToast("Code and name are required", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await journalEntryTypesCatalogClient.create(operatingCompanyId, {
        code,
        display_name,
      });
      onChange(created.id);
      setCreateOpen(false);
      setDraftCode("");
      setDraftName("");
      void typesQuery.refetch();
      pushToast("Journal entry type created", "success");
    } catch (error) {
      pushToast(userFacingApiError(error, "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Combobox
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Journal entry type"
        loading={typesQuery.isLoading}
        disabled={disabled}
        allowAddNew={{
          label: "+ Add new journal entry type",
          onAdd: () => setCreateOpen(true),
        }}
        dataField="journal-entry-type"
      />
      <span data-testid="journal-entry-type-picker" className="sr-only" aria-hidden="true" />
      <ParityDrawer open={createOpen} onClose={() => setCreateOpen(false)} title="Create journal entry type" size="regular">
        <div className="space-y-2 text-xs">
          <label className="block">
            Code
            <input
              className="mt-1 h-12 w-full rounded-sm border border-gray-300 px-2"
              value={draftCode}
              onChange={(event) => setDraftCode(event.target.value)}
            />
          </label>
          <label className="block">
            Display name
            <input
              className="mt-1 h-12 w-full rounded-sm border border-gray-300 px-2"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} onClick={() => void saveNew()}>
              Save
            </Button>
          </div>
        </div>
      </ParityDrawer>
    </>
  );
}
