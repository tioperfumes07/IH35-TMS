import { useCallback, useRef, useState } from "react";
import type { ZodIssue, ZodSchema } from "zod";
import { ApiError } from "../../api/client";
import { useToast } from "../Toast";

export function flattenZodFieldErrors(fieldErrors: Record<string, string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const first = messages?.[0];
    if (first) out[key] = first;
  }
  return out;
}

function firstFieldKeyFromIssues(issues: ZodIssue[]): string | null {
  for (const issue of issues) {
    if (issue.path.length === 0) continue;
    return issue.path.map(String).join(".");
  }
  return null;
}

export function parseApiErrorPayload(data: unknown): { message: string | null; fieldErrors: Record<string, string> } {
  if (!data || typeof data !== "object") {
    return { message: null, fieldErrors: {} };
  }
  const d = data as Record<string, unknown>;
  let message: string | null = typeof d.message === "string" ? d.message : null;
  const errCode = d.error;
  if (!message && typeof errCode === "string" && errCode !== "validation_error") {
    message = errCode;
  }

  let fieldErrors: Record<string, string> = {};

  if (d.fieldErrors && typeof d.fieldErrors === "object" && !Array.isArray(d.fieldErrors)) {
    for (const [key, val] of Object.entries(d.fieldErrors as Record<string, unknown>)) {
      if (typeof val === "string") fieldErrors[key] = val;
      else if (Array.isArray(val) && typeof val[0] === "string") fieldErrors[key] = val[0];
    }
  }

  const details = d.details;
  if (details && typeof details === "object" && details !== null) {
    const rawFe = (details as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors;
    if (rawFe) {
      fieldErrors = { ...fieldErrors, ...flattenZodFieldErrors(rawFe) };
    }
  }

  if (Array.isArray(d.errors)) {
    const parts = (d.errors as unknown[]).filter((x): x is string => typeof x === "string");
    if (parts.length && !message) message = parts.join("; ");
  }

  return { message, fieldErrors };
}

type UseFormValidationOpts<TFormShape> = {
  schema: ZodSchema<TFormShape>;
  onSubmit: (parsed: TFormShape) => Promise<void>;
  /** Return true if handled (hook skips default ApiError handling). */
  interceptApiError?: (error: unknown) => boolean;
};

export function useFormValidation<TFormShape>(opts: UseFormValidationOpts<TFormShape>): {
  fieldErrors: Record<string, string>;
  apiError: string | null;
  submit: (form: TFormShape) => Promise<void>;
  clearFieldError: (field: string) => void;
  resetErrors: () => void;
} {
  const { pushToast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const schemaRef = useRef(opts.schema);
  schemaRef.current = opts.schema;
  const onSubmitRef = useRef(opts.onSubmit);
  onSubmitRef.current = opts.onSubmit;
  const interceptRef = useRef(opts.interceptApiError);
  interceptRef.current = opts.interceptApiError;

  const resetErrors = useCallback(() => {
    setFieldErrors({});
    setApiError(null);
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const submit = useCallback(
    async (form: TFormShape) => {
      const parsed = schemaRef.current.safeParse(form);
      if (!parsed.success) {
        const flat = flattenZodFieldErrors(parsed.error.flatten().fieldErrors);
        setFieldErrors(flat);
        setApiError(null);
        const firstMsg = parsed.error.issues[0]?.message ?? "Validation failed";
        pushToast(firstMsg, "error");
        const firstKey = firstFieldKeyFromIssues(parsed.error.issues);
        if (firstKey) {
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-field="${firstKey}"]`)?.focus();
          });
        }
        return;
      }

      resetErrors();
      try {
        await onSubmitRef.current(parsed.data);
      } catch (error) {
        if (interceptRef.current?.(error)) return;
        if (error instanceof ApiError) {
          const { message, fieldErrors: fe } = parseApiErrorPayload(error.data);
          setFieldErrors(fe);
          const banner = message ?? error.message;
          setApiError(banner);
          pushToast(banner, "error");
          const firstKey = Object.keys(fe)[0];
          if (firstKey) {
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>(`[data-field="${firstKey}"]`)?.focus();
            });
          }
          return;
        }
        const msg = String((error as Error).message ?? "Request failed");
        setApiError(msg);
        pushToast(msg, "error");
      }
    },
    [pushToast, resetErrors]
  );

  return { fieldErrors, apiError, submit, clearFieldError, resetErrors };
}