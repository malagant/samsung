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
  onChange,
  disabled,
}: {
  checked: boolean;
  label: string;
  color: string;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled ?? !onChange}
      onClick={() => onChange?.(!checked)}
      className="flex h-7 w-12 shrink-0 items-center rounded-full p-[3px] disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: checked ? color : "var(--idle)",
        justifyContent: checked ? "flex-end" : "flex-start",
      }}
    >
      <span className="h-[22px] w-[22px] rounded-full bg-white" />
    </button>
  );
}

export function Button({
  children,
  variant = "primary",
  type = "button",
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "quiet" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const look =
    variant === "primary"
      ? "bg-accent text-on-accent"
      : variant === "danger"
        ? "border border-border bg-surface text-warn"
        : "border border-border bg-surface text-text";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 rounded-[var(--control-radius)] px-4 font-medium text-sm disabled:opacity-60 ${look} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  minLength,
  hint,
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium text-sm">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="min-h-11 rounded-[var(--control-radius)] border border-border bg-bg px-3 text-base text-text"
      />
      {hint ? (
        <span id={`${id}-hint`} className="text-muted text-xs">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="m-0 text-sm text-warn">
      {message}
    </p>
  ) : null;
}
