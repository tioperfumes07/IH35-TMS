import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { listMyCompanies, setDefaultCompany, type MyCompany } from "../api/org";
import { ApiError } from "../api/client";

const STORAGE_KEY = "ih35:selectedCompanyId";

type CompanyContextValue = {
  companies: MyCompany[];
  selectedCompanyId: string | null;
  selectedCompany: MyCompany | null;
  isLoading: boolean;
  setSelectedCompany: (companyId: string) => void;
  setDefaultCompanyForUser: (companyId: string) => Promise<void>;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: ["org", "my-companies"],
    queryFn: async () => {
      try {
        return await listMyCompanies().then((result) => result.companies);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return [];
        throw error;
      }
    },
    retry: (count, error) => {
      if (error instanceof ApiError && error.status === 401) return false;
      return count < 1;
    },
  });

  useEffect(() => {
    const companies = companiesQuery.data ?? [];
    if (companies.length === 0) {
      setSelectedCompanyId(null);
      return;
    }

    const fromStorage = window.localStorage.getItem(STORAGE_KEY);
    if (fromStorage && companies.some((company) => company.id === fromStorage)) {
      setSelectedCompanyId(fromStorage);
      return;
    }

    const fromDefault = companies.find((company) => company.is_default);
    if (fromDefault) {
      setSelectedCompanyId(fromDefault.id);
      window.localStorage.setItem(STORAGE_KEY, fromDefault.id);
      return;
    }

    const firstAlphabetical = [...companies].sort((a, b) => a.legal_name.localeCompare(b.legal_name))[0];
    if (firstAlphabetical) {
      setSelectedCompanyId(firstAlphabetical.id);
      window.localStorage.setItem(STORAGE_KEY, firstAlphabetical.id);
    }
  }, [companiesQuery.data]);

  const setDefaultMutation = useMutation({
    mutationFn: (companyId: string) => setDefaultCompany(companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org", "my-companies"] });
    },
  });

  const value = useMemo<CompanyContextValue>(() => {
    const companies = companiesQuery.data ?? [];
    const selectedCompany =
      companies.find((company) => company.id === selectedCompanyId) ??
      companies.find((company) => company.is_default) ??
      companies[0] ??
      null;

    return {
      companies,
      selectedCompanyId: selectedCompany?.id ?? null,
      selectedCompany,
      isLoading: companiesQuery.isLoading,
      setSelectedCompany: (companyId: string) => {
        setSelectedCompanyId(companyId);
        window.localStorage.setItem(STORAGE_KEY, companyId);
      },
      setDefaultCompanyForUser: async (companyId: string) => {
        await setDefaultMutation.mutateAsync(companyId);
      },
    };
  }, [companiesQuery.data, companiesQuery.isLoading, selectedCompanyId, setDefaultMutation]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyContext() {
  const value = useContext(CompanyContext);
  if (!value) {
    throw new Error("useCompanyContext must be used within CompanyProvider");
  }
  return value;
}
