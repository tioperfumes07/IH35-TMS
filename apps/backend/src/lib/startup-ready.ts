let appReady = false;

export function setAppReady(next: boolean) {
  appReady = next;
}

export function getAppReady(): boolean {
  return appReady;
}
