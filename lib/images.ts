/**
 * Browser-side image preparation: decode (honouring EXIF rotation), downscale to
 * a sensible size, and re-encode as JPEG. Phone photos shrink from 3–12 MB to
 * roughly 300–800 KB, which matters on a garage's patchy signal.
 */
export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function prepareImage(file: File, maxDimension = 2048, quality = 0.82): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      `Couldn't read "${file.name}". Try a JPEG or PNG (on iPhone, set Camera → Formats → Most Compatible).`,
    );
  }
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error(`Couldn't compress "${file.name}".`);
  return { blob, width, height };
}
