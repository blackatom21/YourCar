"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import * as tus from "tus-js-client";
import { createManualUpload, finishManualUpload } from "@/app/(app)/vehicles/[vehicleId]/manuals/actions";
import { buttonClass } from "@/components/ui/button-styles";
import { Field, FormError, Input } from "@/components/ui/form";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/browser";

const MAX_BYTES = 500 * 1024 * 1024;

/**
 * Resumable (TUS) upload straight to Supabase Storage — manuals can be hundreds
 * of MB, far beyond what a serverless request body allows, and a dropped phone
 * connection resumes instead of restarting.
 */
export function ManualUploader({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setError("Choose a PDF file.");
    if (f.size > MAX_BYTES) return setError("Manuals can be up to 500 MB.");
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim());
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress(0);

    const created = await createManualUpload(vehicleId, { title, filename: file.name, size: file.size }).catch(
      () => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }),
    );
    if (!created.ok) {
      setProgress(null);
      return setError(created.error);
    }
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setProgress(null);
      return setError("Your session expired. Please sign in again.");
    }

    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: "manuals",
        objectName: created.data.path,
        contentType: "application/pdf",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // Supabase requires exactly 6 MB chunks
      onError: (err) => {
        setProgress(null);
        setError(`Upload failed: ${err.message}`);
      },
      onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
      onSuccess: async () => {
        const done = await finishManualUpload(created.data.manualId);
        setProgress(null);
        if (!done.ok) return setError(done.error);
        setFile(null);
        setTitle("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      },
    });
    uploadRef.current = upload;
    const previous = await upload.findPreviousUploads();
    if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
  }

  const busy = progress !== null;

  return (
    <form onSubmit={start} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-semibold">Upload a manual (PDF)</h2>
      <p className="text-sm text-zinc-500">
        Manuals stay private to you. Large files are fine; processing runs in the background.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => pick(e.target.files?.[0])}
        disabled={busy}
        className="text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:font-medium dark:file:bg-zinc-800"
      />
      {file && (
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} disabled={busy} />
        </Field>
      )}
      <FormError message={error} />
      {busy && (
        <div className="flex flex-col gap-1">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Uploading… {progress}%</span>
            <button type="button" onClick={() => uploadRef.current?.abort()} className="underline">
              Pause
            </button>
          </div>
        </div>
      )}
      <button type="submit" disabled={!file || busy} className={buttonClass()}>
        {busy ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
