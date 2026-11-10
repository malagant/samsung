import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`rounded-[var(--radius)] border-[length:var(--card-border-width)] border-border bg-surface p-4 ${className}`}
    >
      {children}
    </section>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-muted text-xs [text-transform:var(--label-transform)] ${className}`}>
      {children}
    </span>
  );
}

export function Figure({ value, unit, color }: { value: string; unit?: string; color?: string }) {
  return (
    <div
      className="font-[family-name:var(--font-numerals)] font-semibold text-3xl tracking-tight"
      style={color ? { color } : undefined}
    >
      {value}
      {unit ? <span className="ml-1 font-normal text-base text-muted">{unit}</span> : null}
    </div>
  );
}

export function Switch({
  checked,
  label,
  color,
}: {
  checked: boolean;
  label: string;
  color: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="flex h-7 w-12 shrink-0 items-center rounded-full p-[3px]"
      style={{
        background: checked ? color : "var(--idle)",
        justifyContent: checked ? "flex-end" : "flex-start",
      }}
    >
      <span className="h-[22px] w-[22px] rounded-full bg-white" />
    </button>
  );
}
