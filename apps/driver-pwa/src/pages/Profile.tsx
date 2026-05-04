import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { signOut } from "../api/identity";
import { useAuth } from "../auth/useAuth";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";

export function ProfilePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <Link to="/home" className="inline-flex min-h-11 items-center gap-2 text-sm text-pwa-text-secondary">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <PwaCard title="Profile" subtitle="Driver settings foundation">
          <p className="text-base text-pwa-text-primary">{auth.user?.email ?? "unknown"}</p>
          <p className="mt-1 text-sm text-pwa-text-secondary">Role: {auth.user?.role ?? "Driver"}</p>
          <PwaButton
            className="mt-4 w-full"
            onClick={async () => {
              try {
                await signOut(window.location.origin);
              } finally {
                queryClient.removeQueries({ queryKey: ["auth", "me"] });
                window.location.href = "/login";
              }
            }}
          >
            Sign out
          </PwaButton>
        </PwaCard>
      </div>
    </div>
  );
}
