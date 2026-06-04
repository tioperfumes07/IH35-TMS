import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { getPublicApplyPortal, submitDriverApplication } from "../../api/applicants";
import { Button } from "../../components/Button";

function defaultDobForAge21() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 25);
  return d.toISOString().slice(0, 10);
}

export function ApplicationPage() {
  const { token = "" } = useParams();
  const portalQ = useQuery({
    queryKey: ["public-apply-portal", token],
    queryFn: () => getPublicApplyPortal(token),
    enabled: Boolean(token),
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState(defaultDobForAge21());
  const [cdlNumber, setCdlNumber] = useState("");
  const [cdlState, setCdlState] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [fcraConsent, setFcraConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submitM = useMutation({
    mutationFn: () =>
      submitDriverApplication(token, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        date_of_birth: dateOfBirth,
        cdl_number: cdlNumber.trim() || null,
        cdl_state: cdlState.trim().toUpperCase() || null,
        years_experience: yearsExperience ? Number(yearsExperience) : null,
        fcra_consent: true,
      }),
    onSuccess: () => {
      setSubmitted(true);
      setFormError(null);
    },
    onError: (err: unknown) => {
      const code = err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "submit_failed") : "submit_failed";
      setFormError(code);
    },
  });

  const portalError = useMemo(() => {
    if (!token) return "missing_token";
    if (portalQ.error instanceof ApiError) {
      return String((portalQ.error.data as { error?: string })?.error ?? "portal_unavailable");
    }
    return null;
  }, [portalQ.error, token]);

  if (portalQ.isLoading) {
    return (
      <div className="mx-auto max-w-lg p-6 text-sm text-gray-600" data-testid="application-page">
        Loading application form…
      </div>
    );
  }

  if (portalError || !portalQ.data) {
    return (
      <div className="mx-auto max-w-lg rounded border border-red-200 bg-red-50 p-6 text-sm text-red-800" data-testid="application-page">
        Application link is invalid or expired.
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded border bg-white p-6 shadow-sm" data-testid="application-page">
        <h1 className="text-xl font-semibold text-gray-900">Application received</h1>
        <p className="text-sm text-gray-600">
          Thank you for applying to {portalQ.data.company_name}. Our recruiting team will review your submission.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded border bg-white p-6 shadow-sm" data-testid="application-page">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-gray-900">Driver application</h1>
        <p className="text-sm text-gray-600">{portalQ.data.company_name}</p>
      </header>

      <p className="rounded bg-amber-50 p-3 text-xs text-amber-900" data-testid="application-fcra-notice">
        {portalQ.data.compliance.fcra_notice} Applicants must be at least {portalQ.data.compliance.minimum_age} years old for
        interstate CDL operations.
      </p>

      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!fcraConsent) {
            setFormError("fcra_consent_required");
            return;
          }
          submitM.mutate();
        }}
      >
        <label className="grid gap-1 text-sm">
          <span>First name</span>
          <input
            className="rounded border px-3 py-2"
            data-testid="application-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Last name</span>
          <input
            className="rounded border px-3 py-2"
            data-testid="application-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Phone</span>
          <input
            className="rounded border px-3 py-2"
            data-testid="application-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Email (optional)</span>
          <input
            type="email"
            className="rounded border px-3 py-2"
            data-testid="application-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Date of birth</span>
          <input
            type="date"
            className="rounded border px-3 py-2"
            data-testid="application-dob"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            required
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>CDL number (optional)</span>
            <input className="rounded border px-3 py-2" value={cdlNumber} onChange={(e) => setCdlNumber(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CDL state</span>
            <input
              className="rounded border px-3 py-2 uppercase"
              maxLength={2}
              value={cdlState}
              onChange={(e) => setCdlState(e.target.value)}
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm">
          <span>Years of experience</span>
          <input
            type="number"
            min={0}
            max={60}
            className="rounded border px-3 py-2"
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="application-fcra-consent"
            checked={fcraConsent}
            onChange={(e) => setFcraConsent(e.target.checked)}
          />
          <span>I authorize background screening under the FCRA.</span>
        </label>
        {formError ? <p className="text-sm text-red-700">{formError.replaceAll("_", " ")}</p> : null}
        <Button type="submit" data-testid="application-submit" disabled={submitM.isPending}>
          Submit application
        </Button>
      </form>
    </div>
  );
}
