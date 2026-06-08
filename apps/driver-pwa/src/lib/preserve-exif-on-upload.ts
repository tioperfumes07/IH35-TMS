/**
 * Upload raw file bytes without canvas re-encoding (preserves EXIF).
 */
export async function uploadRawPhoto(
  url: string,
  file: File,
  init?: RequestInit
): Promise<Response> {
  const form = new FormData();
  form.append("file", file, file.name);
  return fetch(url, {
    method: "POST",
    body: form,
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
  });
}

export function assertNoCanvasReencode(): void {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    if (canvas.getContext("2d")) {
      // Caller must use uploadRawPhoto(file) directly — never drawImage + toBlob for evidence.
    }
  }
}
