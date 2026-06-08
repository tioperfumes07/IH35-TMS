import http from "k6/http";
import { check, sleep } from "k6";

const SMOKE_MODE = __ENV.K6_SMOKE === "1";
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || __ENV.BASE_URL || "https://api.ih35dispatch.com";
const AUTH_TOKEN = __ENV.LOAD_TEST_DRIVER_BEARER_TOKEN || __ENV.LOAD_TEST_BEARER_TOKEN || "";
const DRIVER_COOKIE = __ENV.LOAD_TEST_DRIVER_COOKIE || "";
const REQUEST_TIMEOUT = __ENV.LOAD_TEST_TIMEOUT || "10s";

if (SMOKE_MODE) {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));
}

export const options = {
  scenarios: {
    driver_pwa_sync: {
      executor: "constant-vus",
      vus: SMOKE_MODE ? 5 : 300,
      duration: SMOKE_MODE ? "45s" : "10m",
      gracefulStop: "20s",
    },
  },
  thresholds: {
    "http_req_duration{endpoint_type:get}": ["p(95)<500"],
    "http_req_failed{scenario:driver_pwa_sync}": [SMOKE_MODE ? "rate<0.60" : "rate<0.05"],
    checks: [SMOKE_MODE ? "rate>0.40" : "rate>0.95"],
  },
};

function headers() {
  return {
    Accept: "application/json",
    ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
    ...(DRIVER_COOKIE ? { Cookie: DRIVER_COOKIE } : {}),
  };
}

function isExpected(status) {
  if (SMOKE_MODE) {
    return status >= 200 && status < 500;
  }
  return status >= 200 && status < 300;
}

export default function () {
  const hos = http.get(`${BASE_URL}/api/v1/driver-pwa/hos-clocks`, {
    headers: headers(),
    timeout: REQUEST_TIMEOUT,
    tags: { endpoint_type: "get", workload: "driver-pwa-sync" },
  });
  check(hos, {
    "driver-pwa hos returned expected status": (res) => isExpected(res.status),
  });

  const fuel = http.get(`${BASE_URL}/api/v1/driver-pwa/recent-fuel-transactions`, {
    headers: headers(),
    timeout: REQUEST_TIMEOUT,
    tags: { endpoint_type: "get", workload: "driver-pwa-sync" },
  });
  check(fuel, {
    "driver-pwa fuel sync returned expected status": (res) => isExpected(res.status),
  });

  const equipment = http.get(`${BASE_URL}/api/v1/driver-pwa/equipment`, {
    headers: headers(),
    timeout: REQUEST_TIMEOUT,
    tags: { endpoint_type: "get", workload: "driver-pwa-sync" },
  });
  check(equipment, {
    "driver-pwa equipment sync returned expected status": (res) => isExpected(res.status),
  });

  sleep(SMOKE_MODE ? 0.1 : 0.5);
}
