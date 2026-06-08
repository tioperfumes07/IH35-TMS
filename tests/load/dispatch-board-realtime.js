import http from "k6/http";
import { check, sleep } from "k6";

const SMOKE_MODE = __ENV.K6_SMOKE === "1";
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || __ENV.BASE_URL || "https://api.ih35dispatch.com";
const OPERATING_COMPANY_ID = __ENV.OPERATING_COMPANY_ID || "00000000-0000-4000-8000-000000000001";
const AUTH_TOKEN = __ENV.LOAD_TEST_BEARER_TOKEN || "";
const REQUEST_TIMEOUT = __ENV.LOAD_TEST_TIMEOUT || "10s";

if (SMOKE_MODE) {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));
}

export const options = {
  scenarios: {
    dispatch_board_realtime: {
      executor: "constant-vus",
      vus: SMOKE_MODE ? 2 : 50,
      duration: SMOKE_MODE ? "45s" : "10m",
      gracefulStop: "20s",
    },
  },
  thresholds: {
    "http_req_duration{endpoint_type:get}": ["p(95)<500"],
    "http_req_failed{scenario:dispatch_board_realtime}": [SMOKE_MODE ? "rate<0.50" : "rate<0.05"],
    checks: [SMOKE_MODE ? "rate>0.50" : "rate>0.95"],
  },
};

function headers() {
  return {
    Accept: "application/json",
    ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
  };
}

function isExpected(status) {
  if (SMOKE_MODE) {
    return status >= 200 && status < 500;
  }
  return status >= 200 && status < 300;
}

export default function () {
  const dashboard = http.get(
    `${BASE_URL}/api/v1/dispatch/dashboard?operating_company_id=${OPERATING_COMPANY_ID}`,
    {
      headers: headers(),
      timeout: REQUEST_TIMEOUT,
      tags: { endpoint_type: "get", workload: "dispatch-board-realtime" },
    }
  );
  check(dashboard, {
    "dispatch dashboard returned expected status": (res) => isExpected(res.status),
  });

  const loads = http.get(
    `${BASE_URL}/api/v1/dispatch/loads?operating_company_id=${OPERATING_COMPANY_ID}&limit=50&offset=0`,
    {
      headers: headers(),
      timeout: REQUEST_TIMEOUT,
      tags: { endpoint_type: "get", workload: "dispatch-board-realtime" },
    }
  );
  check(loads, {
    "dispatch loads returned expected status": (res) => isExpected(res.status),
  });

  const planner = http.get(
    `${BASE_URL}/api/v1/dispatch/planner/week?operating_company_id=${OPERATING_COMPANY_ID}`,
    {
      headers: headers(),
      timeout: REQUEST_TIMEOUT,
      tags: { endpoint_type: "get", workload: "dispatch-board-realtime" },
    }
  );
  check(planner, {
    "dispatch planner returned expected status": (res) => isExpected(res.status),
  });

  sleep(SMOKE_MODE ? 0.2 : 1);
}
