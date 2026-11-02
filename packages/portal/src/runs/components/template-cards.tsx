import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface Template {
  label: string;
  prompt: string;
}

interface TemplateCard extends Template {
  art: ReactNode;
  /** Resting tilt in degrees; the card straightens when hovered or picked. */
  tilt: number;
  /** Seconds for one bob, varied per card so the three never move in lockstep. */
  float: number;
}

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

export const TEMPLATE_CARDS: TemplateCard[] = [
  {
    label: "Habit tracker",
    prompt: "A habit tracker where I can add habits and tick them off each day, with a weekly streak view",
    tilt: -7,
    float: 4.2,
    art: (
      <div className="flex h-full flex-col justify-between bg-[#d7f25c] p-2.5 text-[#1f3d12]">
        <span className="text-[22px] leading-[0.85] font-bold tracking-tight uppercase">
          Every
          <br />
          day
        </span>
        <span className="flex justify-between">
          {WEEK.map((day, i) => (
            <span
              key={i}
              className={cn(
                "grid size-3 place-items-center rounded-full text-[6px] font-bold",
                i < 5 ? "bg-[#1f3d12] text-[#d7f25c]" : "border border-[#1f3d12]/40",
              )}
            >
              {i < 5 ? "✓" : day}
            </span>
          ))}
        </span>
      </div>
    ),
  },
  {
    label: "Grocery list",
    prompt: "A shared grocery list with categories and a 'bought' toggle",
    tilt: 4,
    float: 5.1,
    art: (
      <div className="flex h-full flex-col gap-1.5 bg-[#ffd9cf] p-2.5 text-[#c8341b]">
        <span className="font-serif text-[22px] leading-none italic">Groceries</span>
        <ul className="flex flex-col gap-1 text-[8px] font-medium">
          {["Lemons", "Sourdough", "Oat milk"].map((item, i) => (
            <li key={item} className="flex items-center gap-1">
              <span className={cn("size-2 rounded-[2px] border border-current", i === 0 && "bg-current")} />
              <span className={cn(i === 0 && "line-through opacity-60")}>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    label: "Link shortener",
    prompt: "A tiny link shortener with click counts",
    tilt: -3,
    float: 4.6,
    art: (
      <div className="flex h-full flex-col justify-between bg-[#2448ff] p-2.5 text-white">
        <span className="font-mono text-[9px] leading-tight opacity-70">
          https://so-
          <br />
          long.com/…
        </span>
        <span className="font-mono text-[17px] leading-none font-bold">sh.rt/x</span>
        <span className="self-start rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold text-[#2448ff] tabular-nums">
          128 clicks
        </span>
      </div>
    ),
  },
];

interface TemplateCardsProps {
  value: string | null;
  onPick: (label: string | null) => void;
}

/** Three poster-like starter cards that drift in place; picking one again goes back to scratch. */
export function TemplateCards({ value, onPick }: TemplateCardsProps) {
  return (
    <ul className="flex justify-center gap-3 sm:gap-6" aria-label="Start from a template">
      {TEMPLATE_CARDS.map((card, i) => {
        const picked = value === card.label;
        return (
          <li
            key={card.label}
            className="motion-safe:animate-[template-enter_700ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div
              className="motion-safe:animate-[template-float_var(--float)_ease-in-out_infinite]"
              style={{ "--float": `${card.float}s`, animationDelay: `${-i * 1.3}s` } as CSSProperties}
            >
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => onPick(picked ? null : card.label)}
                style={{ "--tilt": picked ? "0deg" : `${card.tilt}deg` } as CSSProperties}
                className={cn(
                  "group block w-24 rounded-2xl bg-[var(--ds-white)] p-1.5 text-left shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.04)] sm:w-32 dark:bg-card",
                  "rotate-(--tilt) transition-[rotate,scale,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                  "hover:scale-105 hover:rotate-0 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-fg",
                  picked && "scale-105 ring-2 ring-ds-fg",
                )}
              >
                <span className="block aspect-square overflow-hidden rounded-[10px]">{card.art}</span>
                <span className="mt-1.5 block truncate px-0.5 pb-0.5 text-xs text-muted-foreground group-aria-pressed:text-foreground">
                  {card.label}
                </span>
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
