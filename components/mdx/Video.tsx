interface VideoProps {
  src: string;
  poster?: string;
  caption?: string;
  credit?: string;
  /** Use "portrait" for phone recordings so they don't fill the whole page height. */
  orientation?: "landscape" | "portrait";
}

export function Video({ src, poster, caption, credit, orientation = "landscape" }: VideoProps) {
  const portrait = orientation === "portrait";
  return (
    <figure className={`my-8 overflow-hidden border border-border bg-surface ${portrait ? "mx-auto max-w-sm" : ""}`}>
      <video
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        className="block h-auto w-full bg-black"
      />
      {(caption ?? credit) && (
        <figcaption className="border-t border-border px-4 py-2 text-sm text-text-secondary">
          {caption}
          {credit && <span className="ms-2 text-xs text-text-secondary/70">— {credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}
