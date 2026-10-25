import { apiRequest } from "./client";
import { confirmUpload, requestUploadUrlFromFile, uploadFileToR2 } from "./docs";

export type DriverPhotoCandidate = {
  id: string;
  original_filename: string;
  signed_url: string | null;
  created_at: string;
};

export async function listDriverPhotoCandidates(driverId: string, companyId: string): Promise<DriverPhotoCandidate[]> {
  const params = new URLSearchParams({ operating_company_id: companyId });
  const res = await apiRequest<{ candidates: DriverPhotoCandidate[] }>(
    `/api/v1/mdata/drivers/${driverId}/photo-candidates?${params.toString()}`
  );
  return res.candidates;
}

export async function setDriverPhotoFromFile(driverId: string, companyId: string, docsFileId: string) {
  return apiRequest<{ driver_id: string }>(`/api/v1/mdata/drivers/${driverId}/photo?operating_company_id=${encodeURIComponent(companyId)}`, {
    method: "POST",
    body: { docs_file_id: docsFileId },
  });
}

export async function clearDriverPhoto(driverId: string, companyId: string) {
  return apiRequest<{ driver_id: string }>(`/api/v1/mdata/drivers/${driverId}/photo?operating_company_id=${encodeURIComponent(companyId)}`, {
    method: "DELETE",
  });
}

/** Upload a file for a driver, confirm it, then set it as the driver's profile photo. Returns docs file id. */
export async function uploadAndSetDriverPhoto(driverId: string, companyId: string, file: File): Promise<string> {
  const { file_id, presigned_url } = await requestUploadUrlFromFile(file, {
    operating_company_id: companyId,
    entity_links: [{ entity_type: "driver", entity_id: driverId }],
  });
  await uploadFileToR2(presigned_url, file, file.type || "application/octet-stream");
  await confirmUpload(file_id);
  await setDriverPhotoFromFile(driverId, companyId, file_id);
  return file_id;
}
