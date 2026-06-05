#!/usr/bin/env node
/**
 * CLOSURE-15-DEEP-AUDIT-B — Driver PWA mobile-at-375 CI guard.
 * Static markers for login, loads, geofence, POD camera, settlements, cash advance, logout, install, offline.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "deep-audit-b-driver-pwa-375";

const VIEWPORT_375_CHECKS = [
  {
    file: "apps/driver-pwa/src/pages/Login.tsx",
    markers: ["min-h-", "startPhoneLogin", "verifyPhoneLogin", "startEmailLogin"],
    note: "login flow (phone + email OTP)",
  },
  {
    file: "apps/driver-pwa/src/pages/LoadDetail.tsx",
    markers: ["max-w-md", "data-testid", "getLoadDetail"],
    note: "load assignment view",
  },
  {
    file: "apps/driver-pwa/src/pages/StopAction.tsx",
    markers: ["useGeofence", "geofence", "markStopArrived", "max-w-md"],
    note: "geo-fence triggers on stop actions",
  },
  {
    file: "apps/driver-pwa/src/components/PodCapture.tsx",
    markers: ["capture", "cameraInputRef", "data-testid=\"pod-capture-panel\"", "compressImage"],
    note: "POD upload from camera",
  },
  {
    file: "apps/driver-pwa/src/pages/Earnings.tsx",
    markers: ["max-w-md", "getMyCurrentCycle", "settlement_terms"],
    note: "settlement / earnings view",
  },
  {
    file: "apps/driver-pwa/src/pages/CashAdvanceListPage.tsx",
    markers: ["max-w-md", "listMyCashAdvanceRequests"],
    note: "cash advance list",
  },
  {
    file: "apps/driver-pwa/src/pages/CashAdvanceNewPage.tsx",
    markers: ["max-w-md", "createCashAdvanceRequest", "/cash-advance"],
    note: "cash advance request",
  },
  {
    file: "apps/driver-pwa/src/pages/Profile.tsx",
    markers: ["signOut", "max-w-md", "min-h-11"],
    note: "logout flow",
  },
  {
    file: "apps/driver-pwa/src/components/InstallPrompt.tsx",
    markers: ["beforeinstallprompt", "isiOS", "install.ios_hint", "install.default_hint"],
    note: "PWA install prompt (iOS Safari + Android Chrome)",
  },
  {
    file: "apps/driver-pwa/src/lib/upload-sync.ts",
    markers: ["navigator.onLine", "offline", "startSyncService", "RETRY_BACKOFF_MS"],
    note: "offline queue + sync backoff",
  },
  {
    file: "apps/driver-pwa/src/components/PendingSyncBar.tsx",
    markers: ["pendingCount", "subscribeSyncState", "sync.offline_waiting"],
    note: "offline pending sync UI",
  },
  {
    file: "apps/driver-pwa/src/components/BottomNav.tsx",
    markers: ["max-w-md", "grid-cols-7", "min-h-11", "safe-area-inset-bottom"],
    note: "375px bottom nav (7 tabs, touch targets, safe area)",
  },
  {
    file: "apps/driver-pwa/src/App.tsx",
    markers: ["/login", "/loads/:id", "/cash-advance", "PendingSyncBar", "ProtectedRoute"],
    note: "route wiring for audited flows",
  },
];

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

for (const check of VIEWPORT_375_CHECKS) {
  const source = read(check.file);
  for (const marker of check.markers) {
    if (!source.includes(marker)) {
      fail(`${check.file} missing marker "${marker}" (${check.note})`);
    }
  }
}

const acceptance = read("apps/driver-pwa/src/pages/Acceptance.tsx");
if (!acceptance.includes("useGeofence")) {
  fail("Acceptance.tsx must enforce pickup geofence before signature");
}

console.log(`[${LABEL}] PASS — ${VIEWPORT_375_CHECKS.length} mobile-375 flow markers guarded`);
console.log(`[${LABEL}] NOTE: Chrome DevTools 375×667 or real device required for visual/login QA (test driver account)`);
