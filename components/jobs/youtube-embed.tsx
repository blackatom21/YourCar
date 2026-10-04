import { youTubeEmbedUrl } from "@/lib/youtube";

export function YouTubeEmbed({ videoId, start, title }: { videoId: string; start?: number | null; title?: string | null }) {
  return (
    <div className="aspect-video overflow-hidden rounded-lg bg-black">
      <iframe
        src={youTubeEmbedUrl(videoId, start)}
        title={title ?? "YouTube video"}
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}
