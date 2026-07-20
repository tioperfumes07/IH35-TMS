import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsPage } from "../../../pages/Documents";
import { VersionHistoryModal } from "../VersionHistoryModal";

const COMPANY = "22222222-2222-4222-8222-222222222222";

const uploadModalSpy = vi.fn((_props: Record<string, unknown>) => (
  <div data-testid="upload-modal-mock">upload-modal</div>
));

vi.mock("../UploadModal", () => ({
  UploadModal: (props: Record<string, unknown>) => uploadModalSpy(props),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner", id: "user-1" } }),
}));

vi.mock("../../../api/docs", () => ({
  listFileCategories: vi.fn().mockResolvedValue({ categories: [] }),
  listFiles: vi.fn().mockResolvedValue({ files: [], total: 0 }),
  getDownloadUrl: vi.fn(),
  getFile: vi.fn().mockResolvedValue({ file: { id: "f1", version_number: 1 }, versions: [] }),
}));

vi.mock("../../../api/identity", () => ({
  listUsers: vi.fn().mockResolvedValue({ users: [] }),
}));

vi.mock("../../Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../PreviewModal", () => ({
  PreviewModal: () => null,
}));

vi.mock("../../Modal", () => ({
  Modal: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="modal-mock">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("docs upload company scope (0441-mod12)", () => {
  beforeEach(() => {
    uploadModalSpy.mockClear();
  });

  it("DocumentsPage forwards selectedCompanyId to UploadModal", async () => {
    wrap(<DocumentsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    await waitFor(() => expect(uploadModalSpy).toHaveBeenCalled());
    expect(uploadModalSpy.mock.calls[0]?.[0]).toMatchObject({
      operatingCompanyId: COMPANY,
    });
  });

  it("VersionHistoryModal forwards operatingCompanyId to UploadModal", async () => {
    wrap(
      <VersionHistoryModal
        rootFileId="root-file-1"
        entityType="driver"
        entityId="driver-1"
        entityName="Driver One"
        operatingCompanyId={COMPANY}
        onClose={vi.fn()}
        onVersionUploaded={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload New Version" }));

    await waitFor(() => expect(uploadModalSpy).toHaveBeenCalled());
    expect(uploadModalSpy.mock.calls[0]?.[0]).toMatchObject({
      operatingCompanyId: COMPANY,
      parentFileId: "root-file-1",
    });
  });
});
