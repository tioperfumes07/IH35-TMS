import { resolveApiUrl } from "../api/client";

const ACCESS = "ih35_driver_access_token";
const EXP = "ih35_driver_access_exp";
const COMPANY = "ih35_driver_operating_company_id";
const IDB_NAME = "ih35-driver-auth";
const IDB_STORE = "kv";
const REFRESH_ROW = "refresh_token";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  const value = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const r = tx.objectStore(IDB_STORE).get(key);
    r.onsuccess = () => resolve(typeof r.result === "string" ? r.result : null);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return value;
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export type DriverAuthBundle = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export function persistDriverAuth(bundle: DriverAuthBundle) {
  localStorage.setItem(ACCESS, bundle.access_token);
  localStorage.setItem(EXP, String(Math.floor(Date.now() / 1000) + Number(bundle.expires_in ?? 0)));
  void idbSet(REFRESH_ROW, bundle.refresh_token);
}

export function persistOperatingCompanyId(id: string) {
  localStorage.setItem(COMPANY, id);
}

export function getOperatingCompanyId(): string | null {
  return localStorage.getItem(COMPANY);
}

export function clearDriverAuth() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(EXP);
  localStorage.removeItem(COMPANY);
  void idbDelete(REFRESH_ROW);
}

export function hasDriverAccessToken(): boolean {
  return Boolean(localStorage.getItem(ACCESS));
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = await idbGet(REFRESH_ROW);
  if (!refresh) return null;
  const res = await fetch(resolveApiUrl("/api/v1/driver/auth/refresh"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    clearDriverAuth();
    return null;
  }
  const data = (await res.json()) as DriverAuthBundle;
  persistDriverAuth(data);
  return data.access_token;
}

export async function getValidDriverAccessToken(): Promise<string | null> {
  const access = localStorage.getItem(ACCESS);
  const exp = Number(localStorage.getItem(EXP) ?? "0");
  const now = Math.floor(Date.now() / 1000);
  if (access && exp > now + 120) return access;
  return refreshAccessToken();
}

export async function bumpDriverSessionIfVisible(): Promise<void> {
  if (typeof document === "undefined") return;
  if (document.visibilityState !== "visible") return;
  if (!hasDriverAccessToken()) return;
  await getValidDriverAccessToken();
}
