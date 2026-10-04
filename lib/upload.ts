"use client";

import { createClient } from "@/lib/supabase/browser";
import { prepareImage } from "@/lib/images";

export interface UploadedPhoto {
  storage_path: string;
  width: number;
  height: number;
}

/** Compresses and uploads images straight to Supabase Storage under `{folder}/`. */
export async function uploadPhotos(
  bucket: string,
  folder: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadedPhoto[]> {
  const supabase = createClient();
  const results: UploadedPhoto[] = [];
  for (const [i, file] of files.entries()) {
    const { blob, width, height } = await prepareImage(file);
    const path = `${folder}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
    });
    if (error) throw new Error(`Upload failed for "${file.name}": ${error.message}`);
    results.push({ storage_path: path, width, height });
    onProgress?.(i + 1, files.length);
  }
  return results;
}
