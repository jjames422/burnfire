import type { ComponentPropsWithoutRef } from "react";

export function Table(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="my-6 overflow-x-auto border border-border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  );
}

export function Thead(props: ComponentPropsWithoutRef<"thead">) {
  return (
    <thead
      className="bg-surface-raised text-left font-display text-xs tracking-wide text-text-secondary uppercase"
      {...props}
    />
  );
}

export function Tbody(props: ComponentPropsWithoutRef<"tbody">) {
  return <tbody {...props} />;
}

export function Tr(props: ComponentPropsWithoutRef<"tr">) {
  return <tr className="odd:bg-surface even:bg-surface-raised/40" {...props} />;
}

export function Th(props: ComponentPropsWithoutRef<"th">) {
  return <th className="border-b border-border px-4 py-2" {...props} />;
}

export function Td(props: ComponentPropsWithoutRef<"td">) {
  return <td className="border-b border-border px-4 py-2 text-text-secondary" {...props} />;
}
