import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuth } from "./auth/useAuth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { HomePage } from "./pages/Home";
import { InviteRedeemPage } from "./pages/InviteRedeem";
import { LoginPage } from "./pages/Login";
import { MyDocumentsPage } from "./pages/MyDocuments";
import { ProfilePage } from "./pages/Profile";
import { startSyncService, stopSyncService } from "./lib/upload-sync";
import { initDB } from "./lib/upload-queue";

function SyncBootstrap() {
  useEffect(() => {
    void initDB();
    startSyncService();
    return () => {
      stopSyncService();
    };
  }, []);
  return null;
}

function RootRedirect() {
  const auth = useAuth();
  if (auth.isLoading) return <div className="flex min-h-screen items-center justify-center text-pwa-text-secondary">Loading...</div>;
  if (!auth.user || auth.isUnauthenticated) return <Navigate to="/login" replace />;
  return <Navigate to="/home" replace />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.isLoading) return <div className="flex min-h-screen items-center justify-center text-pwa-text-secondary">Loading...</div>;
  if (!auth.user || auth.isUnauthenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <SyncBootstrap />
      {children}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/invite" element={<InviteRedeemPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <MyDocumentsPage />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
