import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { listFileCategories, updateFileMetadata, type DocsFile, type FileEntityType } from "../../api/docs";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { Modal } from "../Modal";
import { useToast } from "../Toast";

type EditMetadataModalProps = {
  file: DocsFile;
  entityType: FileEntityType;
  onClose: () => void;
  onSaveSuccess: () => void;
};

export function EditMetadataModal({ file, entityType, onClose, onSaveSuccess }: EditMetadataModalProps) {
  const { pushToast } = useToast();
  const [categoryId, setCategoryId] = useState<string | null>(file.category_id ?? null);
  const [documentDate, setDocumentDate] = useState(file.document_date ? file.document_date.slice(0, 10) : "");
  const [expirationDate, setExpirationDate] = useState(file.expiration_date ? file.expiration_date.slice(0, 10) : "");
  const [description, setDescription] = useState(file.description ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["file-categories", entityType],
    queryFn: () => listFileCategories(entityType).then((result) => result.categories.filter((category) => category.is_active)),
  });

  const selectedCategory = useMemo(
    () => categoriesQuery.data?.find((category) => category.id === categoryId) ?? null,
    [categoriesQuery.data, categoryId]
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      updateFileMetadata(file.id, {
        category_id: categoryId ?? null,
        document_date: documentDate || null,
        expiration_date: expirationDate || null,
        description: description.trim() || null,
      }),
    onSuccess: () => {
      pushToast("Metadata updated", "success");
      onSaveSuccess();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrorMessage(`Failed to save metadata (${error.status}).`);
        return;
      }
      setErrorMessage("Failed to save metadata.");
    },
  });

  return (
    <Modal open onClose={onClose} title="Edit Metadata">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedCategory?.requires_expiration_date && !expirationDate) {
            setErrorMessage("Expiration date is required for this category.");
            return;
          }
          setErrorMessage(null);
          saveMutation.mutate();
        }}
      >
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Category</label>
          <Combobox
            options={(categoriesQuery.data ?? []).map((category) => ({ value: category.id, label: category.label, sublabel: category.code }))}
            value={categoryId}
            onChange={(value) => setCategoryId(value)}
            loading={categoriesQuery.isLoading}
            placeholder="Select category"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Document Date</label>
            <input
              type="date"
              value={documentDate}
              onChange={(event) => setDocumentDate(event.target.value)}
              className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">
              Expiration Date {selectedCategory?.requires_expiration_date ? <span className="text-crit">(required)</span> : null}
            </label>
            <input
              type="date"
              value={expirationDate}
              required={selectedCategory?.requires_expiration_date}
              onChange={(event) => setExpirationDate(event.target.value)}
              className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Description</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>

        {errorMessage ? <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{errorMessage}</div> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
