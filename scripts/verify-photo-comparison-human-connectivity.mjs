#!/usr/bin/env node
import fs from "node:fs";

const SERVICE_PATH = "apps/backend/src/safety/photo-comparison/session.service.ts";
const LIST_PATH = "apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx";
const DETAIL_PATH = "apps/frontend/src/pages/safety/photo-comparison/SessionDetail.tsx";

function errorsFor(service, list, detail) {
  const errors = [];
  const require = (source, token, message) => {
    if (!source.includes(token)) errors.push(message);
  };
  require(service, "mdata.resolve_driver_label_same_company(s.driver_uuid, s.operating_company_id)", "driver label must survive archival through the canonical same-company resolver");
  require(service, "u.owner_company_id = s.operating_company_id OR u.currently_leased_to_company_id = s.operating_company_id", "unit label lookup must be explicitly company scoped");
  require(service, "l.operating_company_id = s.operating_company_id", "load label lookup must be explicitly company scoped");
  require(service, "SELECT ${SESSION_COLUMNS}, ${SESSION_HUMAN_LABEL_COLUMNS}", "list/detail readers must project human labels");
  require(list, 'kind="driver"', "list must keep the driver drill-through");
  require(list, 'kind="unit"', "list must keep the unit drill-through");
  require(detail, 'data-testid="photo-comparison-session-links"', "detail must mount the relationship strip");
  require(detail, 'kind="driver"', "detail must drill to the driver");
  require(detail, 'kind="unit"', "detail must drill to the unit");
  require(detail, 'kind="load"', "detail must drill to the load when present");
  require(detail, 'kind="damage_report"', "detail must drill to the generated damage report");
  require(detail, "No linked load", "detail must name the honest no-load state");
  return errors;
}

const service = fs.readFileSync(SERVICE_PATH, "utf8");
const list = fs.readFileSync(LIST_PATH, "utf8");
const detail = fs.readFileSync(DETAIL_PATH, "utf8");
const errors = errorsFor(service, list, detail);
if (errors.length) {
  console.error(`verify-photo-comparison-human-connectivity FAIL\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [service.replace("mdata.resolve_driver_label_same_company", "concat_ws"), list, detail],
    [service.replace("u.owner_company_id = s.operating_company_id OR u.currently_leased_to_company_id = s.operating_company_id", "u.id = s.unit_uuid"), list, detail],
    [service.replace("l.operating_company_id = s.operating_company_id", "l.id = s.load_uuid"), list, detail],
    [service.replaceAll("SELECT ${SESSION_COLUMNS}, ${SESSION_HUMAN_LABEL_COLUMNS}", "SELECT ${SESSION_COLUMNS}"), list, detail],
    [service, list.replace('kind="driver"', 'kind="user"'), detail],
    [service, list.replace('kind="unit"', 'kind="asset"'), detail],
    [service, list, detail.replace('data-testid="photo-comparison-session-links"', 'data-testid="removed"')],
    [service, list, detail.replace('kind="driver"', 'kind="user"')],
    [service, list, detail.replace('kind="unit"', 'kind="asset"')],
    [service, list, detail.replace('kind="load"', 'kind="trip"')],
    [service, list, detail.replace('kind="damage_report"', 'kind="claim"')],
    [service, list, detail.replace("No linked load", "")],
  ];
  const escaped = mutations
    .map(([s, l, d], index) => ({ index, errors: errorsFor(s, l, d) }))
    .filter((result) => result.errors.length === 0);
  if (escaped.length) {
    console.error(`verify-photo-comparison-human-connectivity --selftest FAIL ${escaped.length}/${mutations.length} mutation(s) escaped: ${escaped.map((result) => result.index + 1).join(",")}`);
    process.exit(1);
  }
  console.log(`verify-photo-comparison-human-connectivity --selftest PASS ${mutations.length}/${mutations.length}`);
} else {
  console.log("verify-photo-comparison-human-connectivity PASS — list/detail resolve scoped labels and drill driver/unit/load/damage report");
}
