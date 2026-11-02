import { useEffect, useId, useRef, useState } from "react";

import { cn } from "../../design-system";
import {
  BotEngine,
  EXPRESSION_BY_ID,
  liveliness,
  POSES,
  RAYON as R,
  SHAPE_BY_ID,
  STATE_BY_ID,
  type BotFrame,
  type ExpressionId,
  type ShapeId,
  type StateId,
} from "../bloub";

/** How long the loop keeps running once nothing asks for motion, so a mood change or the last wink can land. */
const SETTLE_S = 0.8;
/** rAF pauses in background tabs; cap each step so coming back doesn't fast-forward. */
const MAX_STEP_S = 0.064;
/** Every avatar starts on the pose bloub uses for its stills: eyes open, gaze settled. */
const START_S = POSES.idle;
/**
 * Half the viewBox. bloub's own (158) leaves room for orbit rings, which aren't drawn here;
 * the widest body (squircle) reaches 1.15 radii, so this frames the body itself.
 */
const VB = R * 1.18;
const HOVER_SEQUENCE: BloubState[] = ["wink", "idle"];
const REST: BloubState[] = [];

/** States this renderer draws: body, eyes and dots. Ring and notification states (orbit, comet, notify…) are left out. */
export type BloubState = Extract<StateId, "idle" | "thinking" | "wink" | "wide">;

export type BloubProps = {
  className?: string;
  /** Body colour, any hex. */
  color: string;
  /** Resting face; only shows on states with a resting face (idle). */
  expression: ExpressionId;
  /** States to loop through, each held for its measured duration. Omit to hold still; hovering then winks. */
  play?: BloubState[];
  shape: ShapeId;
  size: number;
};

type Sim = {
  block: number;
  clock: number;
  engine: BotEngine;
  nextAt: number;
  sequence: BloubState[];
  settleUntil: number;
};

function createSim(shape: ShapeId, expression: ExpressionId): Sim {
  const engine = new BotEngine(R, "idle", SHAPE_BY_ID.get(shape)?.radii ?? null, EXPRESSION_BY_ID.get(expression) ?? null);
  return { block: 0, clock: START_S, engine, nextAt: Infinity, sequence: REST, settleUntil: 0 };
}

function enterBlock(sim: Sim) {
  const state = sim.sequence[sim.block]!;
  sim.engine.setState(state, sim.clock);
  sim.nextAt = sim.clock + (STATE_BY_ID.get(state)?.duration ?? 2);
}

/**
 * Animated SVG avatar from bloub: one body that morphs between states, eyes cut out of it
 * with a mask so they show whatever is behind the avatar. Only animates while `play` is
 * set, it is hovered, or a change is settling, so a page of resting avatars costs nothing.
 */
export function Bloub({ className, color, expression, play, shape, size }: BloubProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  const sim = useRef<Sim>(null);
  sim.current ??= createSim(shape, expression);
  const [frame, setFrame] = useState<BotFrame>(() => sim.current!.engine.sample(START_S));
  const [awake, setAwake] = useState(false);
  const maskId = `bloub-${useId().replace(/[^\w-]/g, "")}`;

  const sequence = reducedMotion ? REST : play?.length ? play : hovered ? HOVER_SEQUENCE : REST;
  const sequenceKey = sequence.join();

  // Shape, mood or sequence changed: morph towards it, or jump straight there without motion.
  useEffect(() => {
    if (reducedMotion) {
      sim.current = createSim(shape, expression);
      setFrame(sim.current.engine.sample(START_S));
      return;
    }
    const s = sim.current!;
    s.engine.setShape(SHAPE_BY_ID.get(shape)?.radii ?? null, s.clock);
    s.engine.setExpression(EXPRESSION_BY_ID.get(expression) ?? null, s.clock);
    if (sequenceKey !== s.sequence.join()) {
      s.sequence = sequence;
      s.block = 0;
      if (sequence.length) enterBlock(s);
      else s.engine.setState("idle", s.clock);
    }
    s.settleUntil = s.clock + SETTLE_S;
    setAwake(true);
    // `sequence` is a fresh array each render; its key is what matters.
  }, [expression, reducedMotion, sequenceKey, shape]);

  useEffect(() => {
    if (!awake) return;
    let raf = 0;
    let last = 0;
    const tick = (ms: number) => {
      const s = sim.current!;
      s.clock += last ? Math.min((ms - last) / 1_000, MAX_STEP_S) : 0;
      last = ms;
      if (s.sequence.length && s.clock >= s.nextAt) {
        s.block = (s.block + 1) % s.sequence.length;
        enterBlock(s);
      }
      setFrame(s.engine.sample(s.clock));
      // Never freeze mid-blink: a still with closed eyes reads as asleep.
      if (!s.sequence.length && s.clock >= s.settleUntil && liveliness(s.clock).lid === 1) {
        setAwake(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [awake]);

  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
      height={size}
      onPointerEnter={(event) => event.pointerType !== "touch" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      width={size}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} fill="#000" opacity={eye.alpha} transform={eye.matrix} />
          ))}
          {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} fill="#000" r={frame.notch.r} />}
        </mask>
      </defs>
      <g mask={`url(#${maskId})`} opacity={frame.bodyAlpha}>
        <rect fill={color} height={VB * 2} width={VB * 2} x={-VB} y={-VB} />
      </g>
      {frame.dots.map((dot, i) =>
        dot.d ? (
          <path
            key={i}
            d={dot.d}
            fill={dot.color ?? color}
            opacity={dot.opacity * (dot.depth ?? 1)}
            transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`}
          />
        ) : (
          <circle key={i} cx={dot.x} cy={dot.y} fill={dot.color ?? color} opacity={dot.opacity * (dot.depth ?? 1)} r={dot.r} />
        ),
      )}
    </svg>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
