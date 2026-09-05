import clsx from "clsx";

interface TagChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

/** Flat rectangle, never a rounded pill — see the M1 design-system note. */
export function TagChip({ label, active, onClick }: TagChipProps) {
  const classes = clsx(
    "border px-2 py-1 text-xs font-medium tracking-wide uppercase transition-colors duration-150",
    active ? "border-toxic bg-toxic/20 text-toxic" : "border-toxic/40 bg-toxic/10 text-toxic",
    onClick && "cursor-pointer hover:border-toxic hover:bg-toxic/20",
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={classes}>
        {label}
      </button>
    );
  }

  return <span className={classes}>{label}</span>;
}
