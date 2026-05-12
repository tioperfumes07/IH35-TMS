import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import {
  attorneyPortalApprove,
  attorneyPortalReject,
  attorneyPortalRequestChanges,
  getPublicAttorneyReviewDetails,
  type AttorneyReviewTemplateDetails,
} from "../../../api/legal-attorney-review";
import { Button } from "../../../components/Button";

export function LegalAttorneyReviewPortalPage() {
  const { token = "" } = useParams();
  const [details, setDetails] = useState<AttorneyReviewTemplateDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attorneyName, setAttorneyName] = useState("");
  const [barNumber, setBarNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "changes" | "reject" | null>(null);

  useEffect(() => {
    let active = true;
    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getPublicAttorneyReviewDetails(token);
        if (!active) return;
        setDetails(res);
      } catch (err: unknown) {
        if (!active) return;
        const code = err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "unavailable") : "unavailable";
        setError(code);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    if (token) void run();
    else {
      setIsLoading(false);
      setError("missing_token");
    }
    return () => {
      active = false;
    };
  }, [token]);

  const preview = useMemo(() => {
    if (!details) return { en: "", es: "" };
    return { en: details.content_html_en, es: details.content_html_es };
  }, [details]);

  async function onApprove() {
    if (!token) return;
    setBusy("approve");
    setError(null);
    try {
      await attorneyPortalApprove(token, {
        attorney_name: attorneyName,
        bar_number: barNumber,
        notes: notes.trim() || undefined,
      });
      setDoneMessage("Thank you. This template is approved and activated for contract use.");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "approve_failed") : "approve_failed");
    } finally {
      setBusy(null);
    }
  }

  async function onRequestChanges() {
    if (!token) return;
    setBusy("changes");
    setError(null);
    try {
      await attorneyPortalRequestChanges(token, {
        attorney_name: attorneyName,
        bar_number: barNumber,
        comments: feedback,
      });
      setDoneMessage(
        "Your revision request was recorded. The office has been notified; the template is back in draft for edits."
      );
    } catch (err: unknown) {
      setError(err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "request_failed") : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  async function onReject() {
    if (!token) return;
    setBusy("reject");
    setError(null);
    try {
      await attorneyPortalReject(token, {
        attorney_name: attorneyName,
        bar_number: barNumber,
        comments: feedback,
      });
      setDoneMessage("Your decision was recorded. The office has been notified; the template was returned to draft.");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "reject_failed") : "reject_failed");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-600">Loading review…</div>;
  }

  if (error && !details) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <h1 className="text-lg font-semibold text-gray-900">Attorney review</h1>
        <p className="mt-2 text-sm text-red-700">This review link is invalid, expired, or already used ({error}).</p>
      </div>
    );
  }

  if (!details) return null;

  if (doneMessage) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <h1 className="text-lg font-semibold text-gray-900">Attorney review</h1>
        <p className="mt-3 text-sm text-gray-800">{doneMessage}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl space-y-4 p-4 pb-24">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-semibold text-gray-900">Attorney review</h1>
        <p className="text-sm text-gray-600">
          {details.display_name_en} · {details.template_code} v{details.version}
        </p>
        {details.submitted_for_review_at ? (
          <p className="text-xs text-gray-500">Submitted {new Date(details.submitted_for_review_at).toLocaleString()}</p>
        ) : null}
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase text-gray-500">English (controlling)</h2>
          <div
            className="prose prose-sm max-h-[480px] max-w-none overflow-auto rounded border border-gray-200 bg-white p-3"
            dangerouslySetInnerHTML={{ __html: preview.en }}
          />
        </div>
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase text-gray-500">Español</h2>
          <div
            className="prose prose-sm max-h-[480px] max-w-none overflow-auto rounded border border-gray-200 bg-white p-3"
            dangerouslySetInnerHTML={{ __html: preview.es }}
          />
        </div>
      </section>

      <section className="space-y-3 rounded border border-gray-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-gray-900">Your attestation</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-medium text-gray-700">
            Attorney name
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={attorneyName}
              onChange={(e) => setAttorneyName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Bar number
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={barNumber}
              onChange={(e) => setBarNumber(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
        <label className="block text-xs font-medium text-gray-700">
          Notes (optional, approve only)
          <textarea
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Comments for request changes / reject
          <textarea
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Required when requesting changes or rejecting."
          />
        </label>

        {error ? <div className="text-sm text-red-700">{error}</div> : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void onApprove()} disabled={busy !== null}>
            {busy === "approve" ? "Saving…" : "Approve & activate"}
          </Button>
          <Button variant="secondary" onClick={() => void onRequestChanges()} disabled={busy !== null}>
            {busy === "changes" ? "Saving…" : "Request revisions"}
          </Button>
          <Button variant="secondary" onClick={() => void onReject()} disabled={busy !== null}>
            {busy === "reject" ? "Saving…" : "Reject (return to draft)"}
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Approval activates this version and retires any prior active version with the same template code. This link is single-use.
        </p>
      </section>
    </div>
  );
}
