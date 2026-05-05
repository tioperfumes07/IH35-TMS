function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

export async function compressImage(file: File, maxDimension = 1920, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const image = await loadImage(file);
    const largestDimension = Math.max(image.width, image.height);
    const scale = largestDimension > maxDimension ? maxDimension / largestDimension : 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const compressedBlob = await canvasToBlob(canvas, quality);
    if (!compressedBlob) {
      return file;
    }

    const compressed = new File([compressedBlob], file.name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    console.info(
      `Compressed ${(file.size / 1024 / 1024).toFixed(1)}MB -> ${(compressed.size / 1024 / 1024).toFixed(1)}MB`
    );
    return compressed;
  } catch {
    return file;
  }
}
