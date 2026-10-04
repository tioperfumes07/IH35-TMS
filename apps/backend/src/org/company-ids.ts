// The ONE definition of each operating company's id. It used to be re-typed in 17 files (a cron, a service, a route each
// keeping its own copy of the literal) because the exported copy lived in org/companies.routes.ts and a service must not
// import a route module. A wrong digit in any copy would silently scope that path to no company (CC-2 2026-10-04).
export const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
