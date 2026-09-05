import type { CSSProperties, ReactNode } from "react";

export type CalloutVariant = "tip" | "warning" | "lore";

const VARIANT_META: Record<CalloutVariant, { icon: string; color: string; label: string }> = {
  tip: { icon: "💡", color: "var(--tip)", label: "Tip" },
  warning: { icon: "⚠️", color: "var(--warning)", label: "Warning" },
  lore: { icon: "📜", color: "var(--lore)", label: "Lore" },
};

interface CalloutProps {
  variant: CalloutVariant;
  title?: string;
  children: ReactNode;
}

/**
 * Full bordered box with a tinted background — deliberately not a
 * colored-left-border strip, which reads as a generic template pattern.
 */
export function Callout({ variant, title, children }: CalloutProps) {
  const { icon, color, label } = VARIANT_META[variant];

  const boxStyle: CSSProperties = {
    border: `1px solid ${color}`,
    background: `color-mix(in srgb, ${color} 7%, transparent)`,
    padding: "18px 20px",
  };

  const labelStyle: CSSProperties = {
    color,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };

  return (
    <div role="note" className="my-6" style={boxStyle}>
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden="true">{icon}</span>
        <span className="font-display" style={labelStyle}>
          {title ?? label}
        </span>
      </div>
      <div className="text-sm leading-relaxed text-text-secondary [&>p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}
