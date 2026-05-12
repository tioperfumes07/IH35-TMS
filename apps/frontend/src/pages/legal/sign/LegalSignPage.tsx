import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useParams } from "react-router-dom";
import {
  completePublicLegalSign,
  confirmPublicLegalSignVerification,
  getPublicLegalSignDetails,
  startPublicLegalSignVerification,
  type PublicLegalSignDetails,
} from "../../../api/legal-sign";
import { ApiError } from "../../../api/client";

function renderTemplate(html: string, fields: Record<string, unknown>) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = fields[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function LegalSignPage() {
  const { token = "" } = useParams();
  const [details, setDetails] = useState<PublicLegalSignDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verificationPassed, setVerificationPassed] = useState(false);
  const [typedSignature, setTypedSignature] = useState("");
  const [signedByName, setSignedByName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingVerify, setIsStartingVerify] = useState(false);
  const [isConfirmingVerify, setIsConfirmingVerify] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getPublicLegalSignDetails(token);
        if (!active) return;
        setDetails(response);
        setSignedByName(response.signer_name ?? "");
        if (!response.requires_code) setVerificationPassed(true);
      } catch (err) {
        if (!active) return;
        const message = err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "sign_link_unavailable") : "sign_link_unavailable";
        setError(message);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    if (token) {
      void run();
    } else {
      setIsLoading(false);
      setError("invalid_sign_link");
    }
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  const renderedHtml = useMemo(() => {
    if (!details) return "";
    if (details.language === "en") return renderTemplate(details.content_html_en, details.filled_variables ?? {});
    if (details.language === "es") return renderTemplate(details.content_html_es, details.filled_variables ?? {});
    return `
      <section>
        <h2>English (controlling)</h2>
        ${renderTemplate(details.content_html_en, details.filled_variables ?? {})}
      </section>
      <hr />
      <section>
        <h2>Español</h2>
        ${renderTemplate(details.content_html_es, details.filled_variables ?? {})}
      </section>
    `;
  }, [details]);

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = canvasPoint(event);
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = canvasPoint(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function getSignatureSvg() {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    const data = canvas.toDataURL("image/png");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${data}" width="${canvas.width}" height="${canvas.height}" /></svg>`;
  }

  async function startVerification() {
    if (!token || !details) return;
    setIsStartingVerify(true);
    setError(null);
    try {
      await startPublicLegalSignVerification(token, details.verification_channel === "email" ? "email" : "sms");
    } catch (err) {
      const message = err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "verify_start_failed") : "verify_start_failed";
      setError(message);
    } finally {
      setIsStartingVerify(false);
    }
  }

  async function confirmVerification() {
    if (!token) return;
    setIsConfirmingVerify(true);
    setError(null);
    try {
      await confirmPublicLegalSignVerification(token, code);
      setVerificationPassed(true);
    } catch (err) {
      const message = err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "verify_confirm_failed") : "verify_confirm_failed";
      setError(message);
    } finally {
      setIsConfirmingVerify(false);
    }
  }

  async function submitSignature() {
    if (!details || !token) return;
    const drawnSignatureSvg = getSignatureSvg();
    if (!signedByName.trim() || !typedSignature.trim() || !drawnSignatureSvg || !acceptedTerms) {
      setError("signature_fields_required");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await completePublicLegalSign(token, {
        signed_by_name: signedByName.trim(),
        typed_signature: typedSignature.trim(),
        drawn_signature_svg: drawnSignatureSvg,
        signer_language: details.language,
        accepted_terms: true,
      });
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "sign_submit_failed") : "sign_submit_failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading contract...</div>;
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold text-green-700">Signature Recorded</h1>
        <p className="mt-2 text-sm text-gray-700">Your electronic signature was captured successfully. You may close this page.</p>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold text-red-700">Link unavailable</h1>
        <p className="mt-2 text-sm text-gray-700">{error ?? "This signing link is invalid or expired."}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="rounded border border-gray-200 bg-white p-4 md:p-6">
        <h1 className="text-2xl font-semibold text-gray-900">{details.display_name_en}</h1>
        <p className="mt-1 text-sm text-gray-600">Signer: {details.signer_name}</p>
        <p className="text-xs text-gray-500">Template {details.template_code} v{details.template_version}</p>
      </div>

      <div className="mt-4 rounded border border-gray-200 bg-white p-4 md:p-6">
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      </div>

      {!verificationPassed && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-lg font-semibold text-amber-900">Identity Verification</h2>
          <p className="mt-1 text-sm text-amber-800">
            A verification code is required before signing.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-amber-300"
              type="button"
              disabled={isStartingVerify}
              onClick={startVerification}
            >
              {isStartingVerify ? "Sending..." : "Send Code"}
            </button>
            <input
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Enter 6-digit code"
            />
            <button
              className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
              type="button"
              disabled={isConfirmingVerify || code.trim().length !== 6}
              onClick={confirmVerification}
            >
              {isConfirmingVerify ? "Checking..." : "Verify Code"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 rounded border border-gray-200 bg-white p-4 md:p-6">
        <h2 className="text-lg font-semibold text-gray-900">Sign electronically</h2>
        <div className="mt-3 grid gap-3">
          <label className="text-sm text-gray-700">
            Legal name
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={signedByName}
              onChange={(event) => setSignedByName(event.target.value)}
              disabled={!verificationPassed}
            />
          </label>
          <label className="text-sm text-gray-700">
            Type your signature
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={typedSignature}
              onChange={(event) => setTypedSignature(event.target.value)}
              disabled={!verificationPassed}
            />
          </label>
          <div>
            <p className="text-sm text-gray-700">Draw signature</p>
            <canvas
              ref={canvasRef}
              width={680}
              height={180}
              className="mt-1 w-full rounded border border-dashed border-gray-400 bg-white touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
            />
            <button className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700" type="button" onClick={clearSignature} disabled={!verificationPassed}>
              Clear signature
            </button>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
              disabled={!verificationPassed}
            />
            <span>I acknowledge this electronic signature is legally binding.</span>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <button
          type="button"
          className="mt-4 rounded bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-green-300"
          disabled={!verificationPassed || isSubmitting}
          onClick={submitSignature}
        >
          {isSubmitting ? "Submitting..." : "Sign Contract"}
        </button>
      </div>
    </div>
  );
}
