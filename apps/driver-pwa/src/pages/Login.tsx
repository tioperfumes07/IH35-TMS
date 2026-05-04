import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { PwaButton } from "../components/PwaButton";

export function LoginPage() {
  const auth = useAuth();
  const authBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
  const loginHref = authBase ? `${authBase}/api/v1/auth/google/login` : "/api/v1/auth/google/login";

  if (auth.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-pwa-text-secondary">Checking session...</div>;
  }

  if (auth.user) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-pwa-bg px-4 py-3">
      <div className="w-full max-w-sm rounded-2xl border border-pwa-border bg-pwa-card p-6">
        <h1 className="text-3xl font-semibold text-pwa-text-primary">IH 35 Driver</h1>
        <p className="mt-2 text-base text-pwa-text-secondary">Sign in to continue</p>
        <a href={loginHref} className="mt-6 block">
          <PwaButton className="w-full text-base">Sign in with Google</PwaButton>
        </a>
        <p className="mt-4 text-sm text-pwa-text-secondary">Phone number sign-in coming soon</p>
        <p className="mt-8 text-xs text-pwa-text-secondary">IH 35 Transportation LLC</p>
      </div>
    </div>
  );
}
