import exec from "k6/execution";
import http from "k6/http";
import { check, sleep } from "k6";

const SMOKE_MODE = __ENV.K6_SMOKE === "1";
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || __ENV.BASE_URL || "https://api.ih35dispatch.com";
const OPERATING_COMPANY_ID = __ENV.OPERATING_COMPANY_ID || "00000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = __ENV.LOAD_TEST_CUSTOMER_ID || "00000000-0000-4000-8000-000000000002";
const AUTH_TOKEN = __ENV.LOAD_TEST_BEARER_TOKEN || "";
const REQUEST_TIMEOUT = __ENV.LOAD_TEST_TIMEOUT || "15s";

if (SMOKE_MODE) {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));
}

export const options = {
  scenarios: {
    invoice_creation_burst: {
      executor: "constant-arrival-rate",
      rate: SMOKE_MODE ? 5 : 100,
      timeUnit: "1m",
      duration: SMOKE_MODE ? "1m" : "10m",
      preAllocatedVUs: SMOKE_MODE ? 2 : 30,
      maxVUs: SMOKE_MODE ? 10 : 120,
    },
  },
  thresholds: {
    "http_req_duration{endpoint_type:post}": ["p(95)<1000"],
    "http_req_failed{scenario:invoice_creation_burst}": [SMOKE_MODE ? "rate<0.60" : "rate<0.05"],
    checks: [SMOKE_MODE ? "rate>0.40" : "rate>0.95"],
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
  const payload = JSON.stringify({
    customer_id: CUSTOMER_ID,
    internal_notes: `k6 invoice burst run ${exec.scenario.iterationInTest}`,
    customer_notes: "Load-test generated draft invoice",
    currency_code: "USD",
  });

  const response = http.post(
    `${BASE_URL}/api/v1/accounting/invoices?operating_company_id=${OPERATING_COMPANY_ID}`,
    payload,
    {
      headers: headers(),
      timeout: REQUEST_TIMEOUT,
      tags: { endpoint_type: "post", workload: "invoice-creation-burst" },
    }
  );

  check(response, {
    "invoice creation returned expected status": (res) => isExpected(res.status),
  });

  sleep(SMOKE_MODE ? 0 : 0.1);
}
