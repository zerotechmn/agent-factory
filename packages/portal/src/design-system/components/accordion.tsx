
import { cn } from "../lib/cn";
import { useId, useState, type ReactNode } from "react";

export type AccordionItem = {
  id: string;
  trigger: ReactNode;
  content: ReactNode;
};

export function Accordion({
  items,
  type = "single",
  className,
}: {
  items: AccordionItem[];
  type?: "single" | "multiple";
  className?: string;
}) {
  const [open, setOpen] = useState<string[]>(type === "single" ? [] : []);
  const baseId = useId();

  function toggle(id: string) {
    setOpen((prev) => {
      const isOpen = prev.includes(id);
      if (type === "single") return isOpen ? [] : [id];
      return isOpen ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  return (
    <div className={cn("divide-y divide-[var(--ds-border)] border-y border-[var(--ds-border)]", className)}>
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        const triggerId = `${baseId}-${item.id}-trigger`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div key={item.id}>
            <h3>
              <button
                id={triggerId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 py-3 text-left text-[length:var(--ds-text-base)] text-[var(--ds-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)]"
              >
                {item.trigger}
                <span
                  aria-hidden
                  className={cn(
                    "text-[var(--ds-text-sec)] transition-transform duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-spring)]",
                    isOpen && "rotate-45",
                  )}
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!isOpen}
              className={cn(
                "overflow-hidden text-[length:var(--ds-text-sm)] text-[var(--ds-text-sec)] transition-[grid-template-rows] duration-[var(--ds-duration-slow)]",
                isOpen ? "pb-3" : "pb-0",
              )}
            >
              {isOpen && item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
