#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leafRe":"^runner\.fuel_price_variance$","task":"VERTICAL-CONNECTIVITY-REPORTS-FUEL-PRICE-VARIANCE"} */
import fs from "node:fs";
const backend=fs.readFileSync("apps/backend/src/reports/fuel-price-variance.routes.ts","utf8");
const index=fs.readFileSync("apps/backend/src/reports/index.ts","utf8");
const library=fs.readFileSync("apps/backend/src/reports/shared.ts","utf8");
const config=fs.readFileSync("apps/frontend/src/pages/reports/runners/runner-config.ts","utf8");
const runner=fs.readFileSync("apps/frontend/src/pages/reports/ReportsRunner.tsx","utf8");
const fuel=fs.readFileSync("apps/backend/src/fuel/fuel-transactions.routes.ts","utf8");
const failures=(b=backend)=>[
 ["mounted report route",index.includes("registerFuelPriceVarianceRoutes(app)")],
 ["real report library",library.includes('id: "fuel-price-variance"')&&library.includes('benchmark')],
 ["runner config",config.includes('"fuel-price-variance": {')&&config.includes('apiPath: "/api/v1/reports/fuel-price-variance"')],
 ["runner range submit",runner.includes('reportId === "fuel-price-variance"')&&runner.includes('q.set("from"')&&runner.includes('q.set("to"')],
 ["authenticated company scope",b.includes("currentAuthUser(req, reply)")&&b.includes("withCompanyScope(user.uuid, parsed.data.operating_company_id")],
 ["canonical actual source",b.includes("FROM fuel.fuel_transactions ft")&&b.includes("ft.price_per_gallon")],
 ["canonical benchmark source",b.includes("FROM fuel.loves_prices_daily")&&b.includes("benchmark_price_per_gallon")],
 ["same company/date/state comparison",b.includes("operating_company_id = $1::uuid")&&b.includes("b.effective_date = ft.transaction_at::date")&&b.includes("b.state IS NOT DISTINCT FROM")],
 ["vendor label transaction scoped",fuel.includes("v.operating_company_id = ft.operating_company_id")&&!fuel.includes("v.operating_company_id = l.operating_company_id")],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const mutated=backend.replace("b.effective_date = ft.transaction_at::date","b.effective_date = current_date");if(!failures(mutated).includes("same company/date/state comparison"))process.exit(1);console.log("verify-reports-fuel-price-variance-connectivity selftest PASS — date-scope mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-reports-fuel-price-variance-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-reports-fuel-price-variance-connectivity PASS — runner→scoped actuals+daily state benchmark+labels");
