import { Routes } from "react-router-dom";
import { CompanyProvider } from "./contexts/CompanyContext";
import { ROUTES } from "./routes/manifest";

export default function App() {
  return (
    <CompanyProvider>
      <Routes>{ROUTES.map((route) => route)}</Routes>
    </CompanyProvider>
  );
}
