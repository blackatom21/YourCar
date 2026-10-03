"use client";

import { useEffect, useRef, useState } from "react";

interface Picked {
  file: File;
  url: string;
}

/**
 * Two entry points because `capture` forces the camera on phones and hides the
 * photo library: "Take photo" (camera) and "Choose photos" (library / files).
 */
export function PhotoPicker({
  onChange,
  multiple = true,
  label = "Photos",
}: {
  onChange: (files: File[]) => void;
  multiple?: boolean;
  label?: string;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Picked[]>([]);
  const live = useRef<Picked[]>([]);

  // Release preview object URLs when the picker goes away.
  useEffect(() => () => live.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function update(next: Picked[]) {
    for (const old of items) if (!next.includes(old)) URL.revokeObjectURL(old.url);
    live.current = next;
    setItems(next);
    onChange(next.map((p) => p.file));
  }

  function add(list: FileList | null) {
    if (!list?.length) return;
    const picked = Array.from(list)
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    update(multiple ? [...items, ...picked] : picked.slice(0, 1));
  }

  const btn =
    "flex min-h-12 flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-400 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={() => cameraRef.current?.click()}>
          📷 Take photo
        </button>
        <button type="button" className={btn} onClick={() => libraryRef.current?.click()}>
          🖼️ Choose {multiple ? "photos" : "photo"}
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {items.map(({ url: src }, i) => (
            <li key={src} className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => update(items.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
