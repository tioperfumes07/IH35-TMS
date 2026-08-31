import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { legalMattersApi, type LegalMatterRow } from "../../../api/legal-matters";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { userFacingApiError } from "../../../lib/api-error-message";
import { LegalModuleTabs } from "../LegalModuleTabs";
import {
  EMPTY_LEGAL_MATTER_FORM,
  formStateToCreatePayload,
  LegalMatterFormFields,
  type LegalMatterFormState,
} from "./LegalMatterFormFields";

export function LegalMatterNewPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();
  const [form, setForm] = useState<LegalMatterFormState>(EMPTY_LEGAL_MATTER_FORM);

  const createMut = useMutation<{ matter: LegalMatterRow }, Error, void>({
    mutationFn: () => legalMattersApi.create(companyId, formStateToCreatePayload(form)),
    onSuccess: (data) => navigate(`/legal/matters/${String(data.matter.id ?? "")}`),
  });

  return (
    <div className="space-y-3">
      <PageHeader breadcrumb={["Legal", "Matters"]} title="Create legal matter" subtitle="Create a matter record" />
      <LegalModuleTabs />
      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company.</p>
      ) : (
        <div className="mx-auto max-w-3xl space-y-3 rounded-sm border border-gray-200 bg-white p-4">
          <LegalMatterFormFields form={form} setForm={setForm} mode="create" operatingCompanyId={companyId} />
          <div className="flex gap-2">
            <Link to="/legal/matters">
              <Button variant="secondary">Cancel</Button>
            </Link>
            <Button
              disabled={createMut.isPending || !form.matter_number.trim()}
              onClick={() => void createMut.mutate()}
            >
              Save
            </Button>
          </div>
          {createMut.isError ? (
            <p className="text-sm text-red-600">
              {userFacingApiError(createMut.error, "Could not create matter.")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
