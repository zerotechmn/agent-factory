import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

import type { ExpressionId } from "../../agents/bloub";
import { AGENT_LOOKS, FALLBACK_LOOK } from "../../agents/agents.constants";
import { Bloub, type BloubState } from "../../agents/components/bloub";
import { PLANNED_STAGES } from "../runs.constants";

type CrewMember = {
  /** Its line in the dialogue box, in its own voice; the dry facts live in `STAGE_DESCRIPTIONS`. */
  hello: string;
  /** Face while it talks. */
  talking: ExpressionId;
  /** Face while anyone else talks, unless it has a view on that colleague. */
  listening: ExpressionId;
  /** Professional bias: how it looks while a particular colleague talks. */
  toward?: Partial<Record<string, ExpressionId>>;
};

const CREW: Record<string, CrewMember> = {
  research: {
    hello: "I look at apps like yours first, so we copy what works and skip what doesn't.",
    talking: "excite",
    listening: "curieux",
    toward: { uiDesign: "excite", verify: "blase" },
  },
  requirements: {
    hello: "I write the spec, down to what every button does.",
    talking: "fier",
    listening: "attentif",
    toward: { prdReview: "effraye", development: "mefiant", testCases: "heureux" },
  },
  prdReview: {
    hello: "I poke holes in the spec until it's testable. Sorry in advance.",
    talking: "mefiant",
    listening: "mefiant",
    toward: { requirements: "colere", research: "blase", acceptance: "heureux" },
  },
  testCases: {
    hello: "I turn every line of the spec into a test case. Including the boring ones.",
    talking: "attentif",
    listening: "attentif",
    toward: { requirements: "excite", uiDesign: "confus", acceptance: "heureux" },
  },
  architecture: {
    hello: "I pick the stack and sketch the database before anyone writes code.",
    talking: "fier",
    listening: "blase",
    toward: { development: "mefiant", research: "attentif", uiDesign: "blase" },
  },
  uiDesign: {
    hello: "I design every screen, including the empty and error states everyone forgets.",
    talking: "heureux",
    listening: "timide",
    toward: { development: "effraye", architecture: "blase", research: "excite" },
  },
  development: {
    hello: "I write the code and its tests. Then I run it, because compiling isn't working.",
    talking: "excite",
    listening: "attentif",
    toward: { review: "timide", acceptance: "effraye", verify: "effraye", uiDesign: "confus", prdReview: "somnolent" },
  },
  acceptance: {
    hello: "I test it like a stranger would. I never peek at the code.",
    talking: "fier",
    listening: "mefiant",
    toward: { development: "mefiant", verify: "heureux", testCases: "attentif" },
  },
  verify: {
    hello: "Beep. I run the tests and open every screen. No AI, no feelings.",
    talking: "neutre",
    listening: "neutre",
  },
  review: {
    hello: "I read every line looking for bugs. I'll also have opinions about the developer's variable names.",
    talking: "fier",
    listening: "blase",
    toward: { development: "mefiant", architecture: "curieux", acceptance: "heureux", uiDesign: "somnolent" },
  },
};

/** What an agent's face does while `speaker` (or nobody) talks. */
function faceOf(agent: string, speaker: string | null, resting: ExpressionId): ExpressionId {
  const member = CREW[agent];
  if (!member || speaker === null) return resting;
  if (speaker === agent) return member.talking;
  return member.toward?.[speaker] ?? member.listening;
}

/** Body size, resting tilt and bob period per seat, varied so the lineup looks like a crowd, not a grid. */
const SEATS = [
  { drop: 6, float: 4.4, size: 42, tilt: -8 },
  { drop: 0, float: 5.2, size: 38, tilt: 6 },
  { drop: 10, float: 4.8, size: 34, tilt: -4 },
  { drop: 2, float: 5.6, size: 40, tilt: 10 },
  { drop: 0, float: 4.2, size: 50, tilt: -6 },
  { drop: 8, float: 5, size: 44, tilt: 8 },
  { drop: 0, float: 4.6, size: 52, tilt: 0 },
  { drop: 6, float: 5.4, size: 38, tilt: -10 },
  { drop: 12, float: 4.9, size: 32, tilt: 4 },
  { drop: 2, float: 5.8, size: 40, tilt: -5 },
];

const GREETING: BloubState[] = ["wink", "idle"];

/**
 * The crew lines up and bobs in place. Hovering, focusing or tapping one makes it hop up and
 * say hello, and the rest pull a face that shows what they think of that colleague.
 */
export function TeamIntro() {
  const [active, setActive] = useState<number | null>(null);
  const seats = useRef<(HTMLButtonElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const [tailX, setTailX] = useState<number | null>(null);

  // The bubble's tail points at whoever is talking, wherever the row wrapped them.
  useLayoutEffect(() => {
    const seat = active === null ? null : seats.current[active];
    if (!seat || !box.current) return setTailX(null);
    const from = box.current.getBoundingClientRect();
    const to = seat.getBoundingClientRect();
    setTailX(to.left + to.width / 2 - from.left);
  }, [active]);

  const stage = active === null ? null : PLANNED_STAGES[active];
  const look = stage ? (AGENT_LOOKS[stage.key] ?? FALLBACK_LOOK) : null;

  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label="The team"
        className="flex flex-wrap items-start justify-center gap-x-1.5 gap-y-3"
        onPointerLeave={() => setActive(null)}
        onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setActive(null)}
      >
        {PLANNED_STAGES.map((agent, i) => {
          const seat = SEATS[i % SEATS.length]!;
          const agentLook = AGENT_LOOKS[agent.key] ?? FALLBACK_LOOK;
          const talking = active === i;
          return (
            <li
              key={agent.key}
              className="motion-safe:animate-[template-enter_600ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
              style={{ animationDelay: `${300 + i * 70}ms`, marginTop: seat.drop }}
            >
              <div
                className="motion-safe:animate-[template-float_var(--float)_ease-in-out_infinite]"
                style={{ "--float": `${seat.float}s`, animationDelay: `${-i * 0.9}s` } as CSSProperties}
              >
                <button
                  ref={(el) => {
                    seats.current[i] = el;
                  }}
                  type="button"
                  aria-pressed={talking}
                  onClick={() => setActive(talking ? null : i)}
                  onFocus={() => setActive(i)}
                  onPointerEnter={(event) => event.pointerType !== "touch" && setActive(i)}
                  style={{ "--tilt": talking ? "0deg" : `${seat.tilt}deg` } as CSSProperties}
                  className={cn(
                    "block rounded-full p-1 rotate-(--tilt) transition-[rotate,scale,translate] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                    "focus-visible:outline-2 focus-visible:outline-ds-fg active:scale-95",
                    talking && "-translate-y-2 scale-115",
                  )}
                >
                  <Bloub
                    color={agentLook.color}
                    expression={faceOf(agent.key, stage?.key ?? null, agentLook.expression)}
                    play={talking ? GREETING : undefined}
                    shape={agentLook.shape}
                    size={seat.size}
                  />
                  <span className="sr-only">
                    {agentLook.name}: {CREW[agent.key]?.hello}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* A game-style dialogue box, only while someone talks; screen readers get each line from its button instead. */}
      {stage && look && (
        <div
          ref={box}
          aria-hidden="true"
          className="relative rounded-2xl border bg-[var(--ds-white)] px-4 py-3 text-sm shadow-[var(--ds-shadow-card)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 dark:bg-card"
        >
          <span
            className={cn(
              "absolute -top-[7px] size-3 -translate-x-1/2 rotate-45 border-t border-l bg-inherit transition-[left] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
              tailX === null && "opacity-0",
            )}
            style={{ left: tailX ?? 0 }}
          />
          <p key={stage.key} className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1">
            <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: look.color }} />
            <span className="font-medium">{look.name}:</span> {CREW[stage.key]?.hello}
          </p>
        </div>
      )}
    </div>
  );
}
