import { apiRequest } from "../../../api/client";

export type CatalogReport = {
  id: string;
  label: string;
  route: string;
  icon: string;
  description: string;
};

export type CatalogCategory = {
  id: string;
  label: string;
  reports: CatalogReport[];
};

export function fetchReportCategoryCatalog() {
  return apiRequest<{ categories: CatalogCategory[] }>("/api/reports/categories/catalog");
}
