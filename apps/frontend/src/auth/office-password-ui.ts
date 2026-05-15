const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const OFFICE_PASSWORD_HINT =
  "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.";

export function isValidEmailFormat(email: string): boolean {
  const t = email.trim();
  if (t.length < 5) return false;
  return EMAIL_RE.test(t);
}

export type PasswordStrength = {
  score: number;
  max: number;
  label: string;
  meetsPolicy: boolean;
};

export function evaluatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const max = 5;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const meetsPolicy = score === max;
  const label =
    score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : score === 4 ? "Strong" : "Excellent";
  return { score, max, label, meetsPolicy };
}
