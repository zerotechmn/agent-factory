
import { cn } from "../lib/cn";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabItem = {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
};

export function Tabs({
  items,
  defaultValue,
  variant = "underline",
  equalWidth,
  className,
}: {
  items: TabItem[];
  defaultValue?: string;
  variant?: "underline" | "pill";
  equalWidth?: boolean;
  className?: string;
}) {
  const baseId = useId();
  const firstEnabled = items.find((i) => !i.disabled)?.id;
  const [value, setValue] = useState(defaultValue || firstEnabled || items[0]?.id);

  function onKeyDown(e: KeyboardEvent, index: number) {
    const enabled = items.map((item, i) => ({ item, i })).filter(({ item }) => !item.disabled);
    const current = enabled.findIndex(({ i }) => i === index);
    if (current < 0) return;
    let next = current;
    if (e.key === "ArrowRight") next = (current + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    else return;
    const target = enabled[next];
    if (!target) return;
    e.preventDefault();
    setValue(target.item.id);
    document.getElementById(`${baseId}-tab-${target.item.id}`)?.focus();
  }

  const active = items.find((i) => i.id === value);

  return (
    <div className={className}>
      <div
        role="tablist"
        className={cn(
          "flex gap-1",
          variant === "underline" && "border-b border-[var(--ds-border)]",
          equalWidth && "w-full",
        )}
      >
        {items.map((item, index) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              disabled={item.disabled}
              tabIndex={selected ? 0 : -1}
              onClick={() => setValue(item.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[length:var(--ds-text-sm)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)] disabled:opacity-40",
                equalWidth && "flex-1",
                variant === "underline" &&
                  cn(
                    "border-b-2 -mb-px rounded-none",
                    selected
                      ? "border-[var(--ds-text)] text-[var(--ds-text)]"
                      : "border-transparent text-[var(--ds-text-sec)] hover:text-[var(--ds-text)]",
                  ),
                variant === "pill" &&
                  cn(
                    "rounded-full",
                    selected
                      ? "bg-[var(--ds-button-bg)] text-[var(--ds-button-text)]"
                      : "text-[var(--ds-text-sec)] hover:bg-[var(--ds-bg-hover)]",
                  ),
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>
      {active && (
        <div
          id={`${baseId}-panel-${active.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${active.id}`}
          className="pt-[var(--ds-g1-5)] text-[length:var(--ds-text-sm)] text-[var(--ds-text-sec)]"
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
