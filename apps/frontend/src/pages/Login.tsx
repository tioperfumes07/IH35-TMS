import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { typography } from "../design/tokens";

export function LoginPage() {
  const { user, isLoading } = useAuth();
  const authBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
  const returnTo = encodeURIComponent(window.location.origin);
  const loginPath = `/api/v1/auth/google/login?returnTo=${returnTo}`;
  const loginHref = authBase ? `${authBase}${loginPath}` : loginPath;

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Checking session...</div>;
  }

  if (user) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
      <div className="w-full max-w-md rounded border border-gray-200 bg-white p-6 shadow-sm">
        <h1 style={{ fontFamily: typography.fontSerif }} className="text-[22px] font-semibold text-gray-900">IH 35 Office Login</h1>
        <p className="mt-2 text-sm text-gray-600">Use your Google account to sign in.</p>
        <div className="mt-5">
          <a href={loginHref}>
            <Button className="w-full">Sign in with Google</Button>
          </a>
        </div>
      </div>
    </div>
  );
}
