import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuth } from "./auth/useAuth";
import { BottomNav } from "./components/BottomNav";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PendingSyncBar } from "./components/PendingSyncBar";
import { AcceptancePage } from "./pages/Acceptance";
import { CashAdvanceListPage } from "./pages/CashAdvanceListPage";
import { CashAdvanceNewPage } from "./pages/CashAdvanceNewPage";
import { DvirPage } from "./pages/DVIR";
import { EquipmentPage } from "./pages/Equipment";
import { EquipmentTransferAckPage } from "./pages/EquipmentTransferAck";
import { EarningsPage } from "./pages/Earnings";
import { HomePage } from "./pages/Home";
import { HosPage } from "./pages/HOS";
import { IncidentReportPage } from "./pages/IncidentReport";
import { InviteRedeemPage } from "./pages/InviteRedeem";
import { LeaveRequestListPage } from "./pages/LeaveRequestList";
import { LeaveRequestNewPage } from "./pages/LeaveRequestNew";
import { LoadDetailPage } from "./pages/LoadDetail";
import { LoginPage } from "./pages/Login";
import { MyDocumentsPage } from "./pages/MyDocuments";
import { MyDisputesPage } from "./pages/MyDisputes";
import { MessagesPage } from "./pages/Messages";
import { ChatPage } from "./pages/Chat";
import { ProfilePage } from "./pages/Profile";
import { SchedulerHomePage } from "./pages/SchedulerHome";
import { StopActionPage } from "./pages/StopAction";
import { TodayPage } from "./pages/Today";
import { MyPositionScreen } from "./screens/MyPosition";
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
  return <Navigate to="/today" replace />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.isLoading) return <div className="flex min-h-screen items-center justify-center text-pwa-text-secondary">Loading...</div>;
  if (!auth.user || auth.isUnauthenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <SyncBootstrap />
      {children}
      <PendingSyncBar />
      <BottomNav />
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
        path="/today"
        element={
          <ProtectedRoute>
            <TodayPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages"
        element={
          <ProtectedRoute>
            <MessagesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-disputes"
        element={
          <ProtectedRoute>
            <MyDisputesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-position"
        element={
          <ProtectedRoute>
            <MyPositionScreen />
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
      <Route
        path="/loads"
        element={
          <ProtectedRoute>
            <TodayPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loads/:id"
        element={
          <ProtectedRoute>
            <LoadDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loads/:id/stops/:stopId"
        element={
          <ProtectedRoute>
            <StopActionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loads/:id/accept"
        element={
          <ProtectedRoute>
            <AcceptancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/equipment"
        element={
          <ProtectedRoute>
            <EquipmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/equipment-transfer-ack"
        element={
          <ProtectedRoute>
            <EquipmentTransferAckPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/earnings"
        element={
          <ProtectedRoute>
            <EarningsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hos"
        element={
          <ProtectedRoute>
            <HosPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dvir/pre/:loadId"
        element={
          <ProtectedRoute>
            <DvirPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dvir/post/:loadId"
        element={
          <ProtectedRoute>
            <DvirPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/incident/new"
        element={
          <ProtectedRoute>
            <IncidentReportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduler"
        element={
          <ProtectedRoute>
            <SchedulerHomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduler/requests"
        element={
          <ProtectedRoute>
            <LeaveRequestListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduler/request"
        element={
          <ProtectedRoute>
            <LeaveRequestNewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cash-advance"
        element={
          <ProtectedRoute>
            <CashAdvanceListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cash-advance/new"
        element={
          <ProtectedRoute>
            <CashAdvanceNewPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
