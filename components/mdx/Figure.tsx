import Image from "next/image";

interface FigureProps {
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
  width?: number;
  height?: number;
}

export function Figure({ src, alt, caption, credit, width = 1200, height = 675 }: FigureProps) {
  return (
    <figure className="my-8 overflow-hidden border border-border bg-surface">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="h-auto w-full"
        sizes="(min-width: 768px) 720px, 100vw"
      />
      {(caption ?? credit) && (
        <figcaption className="border-t border-border px-4 py-2 text-sm text-text-secondary">
          {caption}
          {credit && <span className="ml-2 text-xs text-text-secondary/70">— {credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}
