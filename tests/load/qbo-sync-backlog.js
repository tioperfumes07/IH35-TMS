import exec from "k6/execution";
import http from "k6/http";
import { check, sleep } from "k6";

const SMOKE_MODE = __ENV.K6_SMOKE === "1";
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || __ENV.BASE_URL || "https://api.ih35dispatch.com";
const OPERATING_COMPANY_ID = __ENV.OPERATING_COMPANY_ID || "00000000-0000-4000-8000-000000000001";
const AUTH_TOKEN = __ENV.LOAD_TEST_BEARER_TOKEN || "";
const REQUEST_TIMEOUT = __ENV.LOAD_TEST_TIMEOUT || "30s";

const QBO_BACKLOG_ENDPOINTS = [
  "/api/v1/qbo-sync/chart-of-accounts/reconcile-now",
  "/api/v1/qbo-sync/customers/reconcile-now",
  "/api/v1/qbo-sync/vendors/reconcile-now",
  "/api/v1/qbo-sync/items/reconcile-now",
];

if (SMOKE_MODE) {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));
}

export const options = {
  scenarios: {
    qbo_sync_backlog: {
      executor: "shared-iterations",
      vus: SMOKE_MODE ? 4 : 40,
      iterations: SMOKE_MODE ? 40 : 1000,
      maxDuration: SMOKE_MODE ? "2m" : "30m",
    },
  },
  thresholds: {
    "http_req_duration{endpoint_type:qbo}": ["p(95)<5000"],
    "http_req_failed{scenario:qbo_sync_backlog}": [SMOKE_MODE ? "rate<0.70" : "rate<0.05"],
    checks: [SMOKE_MODE ? "rate>0.30" : "rate>0.95"],
  },
};

function headers() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
  };
}

function isExpected(status) {
  if (SMOKE_MODE) {
    return status >= 200 && status < 500;
  }
  return status === 200 || status === 201;
}

export default function () {
  const index = exec.scenario.iterationInTest % QBO_BACKLOG_ENDPOINTS.length;
  const endpoint = QBO_BACKLOG_ENDPOINTS[index];
  const payload = JSON.stringify({ operating_company_id: OPERATING_COMPANY_ID });

  const response = http.post(`${BASE_URL}${endpoint}`, payload, {
    headers: headers(),
    timeout: REQUEST_TIMEOUT,
    tags: { endpoint_type: "qbo", workload: "qbo-sync-backlog" },
  });

  check(response, {
    "qbo backlog sync returned expected status": (res) => isExpected(res.status),
  });

  sleep(SMOKE_MODE ? 0 : 0.05);
}
