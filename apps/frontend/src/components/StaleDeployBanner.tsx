import { useEffect, useState } from "react";
import { STALE_DEPLOY_EVENT } from "../bootstrap/installStaleChunkRecovery";

const POLL_MS = 45_000;

function extractIndexAsset(html: string): string | null {
  const match = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
  return match?.[0] ?? null;
}

function runningIndexAsset(): string | null {
  const fromDom = document.querySelector('script[src*="index-"]')?.getAttribute("src");
  if (fromDom) {
    const match = fromDom.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    if (match) return match[0];
  }
  const fromModule = import.meta.url.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
  return fromModule?.[0] ?? null;
}

function blockingModalOpen(): boolean {
  return Boolean(document.querySelector("[data-ih35-blocking-modal]"));
}

export function StaleDeployBanner() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [modalBlocking, setModalBlocking] = useState(() => blockingModalOpen());
  const running = runningIndexAsset();

  useEffect(() => {
    const syncModal = () => setModalBlocking(blockingModalOpen());
    const observer = new MutationObserver(syncModal);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-ih35-blocking-modal"],
    });
    const tick = window.setInterval(syncModal, 1_000);
    return () => {
      observer.disconnect();
      window.clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    let queued = false;
    const mark = () => {
      if (dismissed) return;
      if (blockingModalOpen()) {
        queued = true;
        return;
      }
      setAvailable(true);
    };

    const onStale = () => mark();
    window.addEventListener(STALE_DEPLOY_EVENT, onStale);

    const poll = window.setInterval(() => {
      if (queued && !blockingModalOpen()) {
        queued = false;
        mark();
        return;
      }
      void fetch(`/?deployProbe=${Date.now()}`, { cache: "no-store", credentials: "same-origin" })
        .then((res) => res.text())
        .then((html) => {
          const next = extractIndexAsset(html);
          if (running && next && next !== running) mark();
        })
        .catch(() => undefined);
    }, POLL_MS);

    return () => {
      window.removeEventListener(STALE_DEPLOY_EVENT, onStale);
      window.clearInterval(poll);
    };
  }, [dismissed, running]);

  if (!available || dismissed || modalBlocking) return null;

  return (
    <div
      role="status"
      data-testid="stale-deploy-banner"
      className="fixed left-1/2 top-2 z-[240] flex max-w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-sm border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-md"
    >
      <span>A new version is available — Reload.</span>
      <button
        type="button"
        className="rounded-sm border border-slate-400 bg-white px-2 py-0.5 text-xs font-semibold"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
      <button type="button" className="text-xs text-slate-600 underline" onClick={() => setDismissed(true)}>
        Dismiss
      </button>
    </div>
  );
}
