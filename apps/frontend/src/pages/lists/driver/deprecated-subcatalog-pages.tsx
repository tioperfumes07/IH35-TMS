import { createDriverCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogDeprecatedBanner } from "./DriverCatalogDeprecatedBanner";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

type DeprecatedCatalogClient = ReturnType<typeof createDriverCatalogClient>;

type DeprecatedPageConfig = {
  urlSegment: string;
  displayName: string;
  breadcrumbSuffix: string;
  canonicalPath: string;
};

function DeprecatedDriverSubcatalogPage({
  client,
  displayName,
  breadcrumbSuffix,
  canonicalPath,
}: {
  client: DeprecatedCatalogClient;
  displayName: string;
  breadcrumbSuffix: string;
  canonicalPath: string;
}) {
  return (
    <div className="space-y-3">
      <DriverCatalogDeprecatedBanner displayName={displayName} canonicalPath={canonicalPath} />
      <DriverCatalogListPage
        client={client}
        displayName={displayName}
        breadcrumbPath={`Lists & Catalogs / Driver / ${breadcrumbSuffix}`}
      />
    </div>
  );
}

const PAGES: DeprecatedPageConfig[] = [
  {
    urlSegment: "license-classes",
    displayName: "License Classes",
    breadcrumbSuffix: "License Classes",
    canonicalPath: "/lists/drivers/license-classes",
  },
  {
    urlSegment: "endorsements",
    displayName: "CDL Endorsements",
    breadcrumbSuffix: "CDL Endorsements",
    canonicalPath: "/lists/drivers/endorsements",
  },
  {
    urlSegment: "restrictions",
    displayName: "CDL Restrictions",
    breadcrumbSuffix: "CDL Restrictions",
    canonicalPath: "/lists/drivers/restrictions",
  },
  {
    urlSegment: "medical-card-status",
    displayName: "Medical Card Status",
    breadcrumbSuffix: "Medical Card Status",
    canonicalPath: "/lists/drivers/medical-card-status",
  },
  {
    urlSegment: "employment-status",
    displayName: "Employment Status",
    breadcrumbSuffix: "Employment Status",
    canonicalPath: "/lists/drivers/employment-status",
  },
];

const clients = Object.fromEntries(
  PAGES.map((page) => [page.urlSegment, createDriverCatalogClient(page.urlSegment)])
) as Record<string, DeprecatedCatalogClient>;

export function LicenseClassesListPage() {
  const page = PAGES[0];
  return (
    <DeprecatedDriverSubcatalogPage
      client={clients[page.urlSegment]}
      displayName={page.displayName}
      breadcrumbSuffix={page.breadcrumbSuffix}
      canonicalPath={page.canonicalPath}
    />
  );
}

export function CdlEndorsementsListPage() {
  const page = PAGES[1];
  return (
    <DeprecatedDriverSubcatalogPage
      client={clients[page.urlSegment]}
      displayName={page.displayName}
      breadcrumbSuffix={page.breadcrumbSuffix}
      canonicalPath={page.canonicalPath}
    />
  );
}

export function CdlRestrictionsListPage() {
  const page = PAGES[2];
  return (
    <DeprecatedDriverSubcatalogPage
      client={clients[page.urlSegment]}
      displayName={page.displayName}
      breadcrumbSuffix={page.breadcrumbSuffix}
      canonicalPath={page.canonicalPath}
    />
  );
}

export function MedicalCardStatusesListPage() {
  const page = PAGES[3];
  return (
    <DeprecatedDriverSubcatalogPage
      client={clients[page.urlSegment]}
      displayName={page.displayName}
      breadcrumbSuffix={page.breadcrumbSuffix}
      canonicalPath={page.canonicalPath}
    />
  );
}

export function EmploymentStatusesListPage() {
  const page = PAGES[4];
  return (
    <DeprecatedDriverSubcatalogPage
      client={clients[page.urlSegment]}
      displayName={page.displayName}
      breadcrumbSuffix={page.breadcrumbSuffix}
      canonicalPath={page.canonicalPath}
    />
  );
}

export const DEPRECATED_DRIVER_SUBCATALOG_PATHS = PAGES.map((p) => `/lists/driver/${p.urlSegment}`);
