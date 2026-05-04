import type { AuthMeResponse } from "../types/api";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type Props = {
  auth: AuthMeResponse["user"];
  children: ReactNode;
};

export function Shell({ auth, children }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <Topbar auth={auth} />
      <div className="flex min-h-[calc(100vh-48px)]">
        <Sidebar />
        <main className="flex-1 bg-white p-4">{children}</main>
      </div>
    </div>
  );
}
