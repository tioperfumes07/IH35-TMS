#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leafRe":"^catalog\\.accounting\\.qbo_categories\\.(list|create)$","task":"VERTICAL-CONNECTIVITY-QBO-CATEGORIES-TMS-CATALOG"} */
import fs from "node:fs";
const page=fs.readFileSync("apps/frontend/src/pages/lists/accounting/QboCategoriesListPage.tsx","utf8");
const client=fs.readFileSync("apps/frontend/src/api/catalogs-accounting.ts","utf8");
const route=fs.readFileSync("apps/backend/src/catalogs/accounting/factory.ts","utf8");
const index=fs.readFileSync("apps/backend/src/catalogs/accounting/index.ts","utf8");
const segment=()=>route.slice(route.indexOf("export function registerQboCategoriesCatalogRoutes"),route.indexOf("// AF-5",route.indexOf("export function registerQboCategoriesCatalogRoutes")));
const failures=(r=segment())=>[
 ["TMS catalog page",page.includes('displayName="Product & Service Categories"')&&page.includes("qboCategoriesCatalogClient")],
 ["canonical client",client.includes('createAccountingCatalogClient("qbo-categories")')],
 ["routes registered",index.includes("registerQboCategoriesCatalogRoutes(app)")],
 ["entity-scoped reads",r.includes("FROM catalogs.qbo_categories")&&r.includes("operating_company_id = $1::uuid")],
 ["canonical create",r.includes("INSERT INTO catalogs.qbo_categories (operating_company_id")],
 ["membership on all five handlers",(r.match(/await assertCompanyMembership\(authUser\.uuid,/g)||[]).length===5],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){if(!failures(segment().replace("await assertCompanyMembership(authUser.uuid, q.operating_company_id);","")).includes("membership on all five handlers"))process.exit(1);console.log("verify-qbo-categories-tms-catalog-connectivity selftest PASS — membership mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-qbo-categories-tms-catalog-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-qbo-categories-tms-catalog-connectivity PASS — list/create use real TMS catalog with five company-membership checks");
