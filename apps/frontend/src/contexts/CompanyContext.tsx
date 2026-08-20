import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { listMyCompanies, setDefaultCompany, type MyCompany } from "../api/org";
import { ApiError } from "../api/client";
import { isLaunchOperatingCompanyCode } from "../lib/launch-operating-company";

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
        const result = await listMyCompanies();
        return result.companies;
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

    const launchCompanies = companies.filter((company) => isLaunchOperatingCompanyCode(company.code));
    const pickable = launchCompanies.length ? launchCompanies : companies;

    const fromStorage = window.localStorage.getItem(STORAGE_KEY);
    if (fromStorage && pickable.some((company) => company.id === fromStorage)) {
      setSelectedCompanyId(fromStorage);
      return;
    }

    const fromDefault = pickable.find((company) => company.is_default);
    if (fromDefault) {
      setSelectedCompanyId(fromDefault.id);
      window.localStorage.setItem(STORAGE_KEY, fromDefault.id);
      return;
    }

    const firstAlphabetical = [...pickable].sort((a, b) => a.legal_name.localeCompare(b.legal_name))[0];
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
    const launchCompanies = companies.filter((company) => isLaunchOperatingCompanyCode(company.code));
    const pickable = launchCompanies.length ? launchCompanies : companies;
    const selectedCompany =
      pickable.find((company) => company.id === selectedCompanyId) ??
      pickable.find((company) => company.is_default) ??
      pickable[0] ??
      null;

    return {
      companies,
      selectedCompanyId: selectedCompany?.id ?? null,
      selectedCompany,
      isLoading: companiesQuery.isLoading,
      setSelectedCompany: (companyId: string) => {
        const allowed = pickable.some((c) => c.id === companyId);
        if (!allowed) return;
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
