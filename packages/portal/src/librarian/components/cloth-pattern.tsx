import { useId } from "react";

import type { BINDINGS, ClothPatternKind } from "../librarian.constants";

// The animations.dev Motion Passport's four cover patterns, on its 360-wide canvas.
// Each shape is all but transparent; the filter presses it into the cloth: a white
// lip where light catches the edge and a shadow, in the cloth's own hue, in the crease.

const WIDTH = 360;

function rect(x0: number, y0: number, x1: number, y1: number): string {
  return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
}

/** 2px rules on a 40px pitch; the edge columns run off the cover. */
function grid(): string {
  const columns = [[0, 40], ...Array.from({ length: 7 }, (_, k) => [42 + 40 * k, 80 + 40 * k]), [322, 360]] as const;
  const cells = columns.flatMap(([x0, x1]) => Array.from({ length: 7 }, (_, r) => rect(x0, 2 + 40 * r, x1, 40 + 40 * r)));
  return rect(0, 0, WIDTH, 282) + cells.join("");
}

/** Diamonds of side 12, in rows that alternate 15px and 17px apart. */
function diamonds(): string {
  const h = 8.485;
  const diamond = (x: number, y: number) => `M${x} ${y - h}L${x + h} ${y}L${x} ${y + h}L${x - h} ${y}Z`;
  const rowA = Array.from({ length: 9 }, (_, m) => Array.from({ length: 6 }, (_, k) => diamond(20.485 + 64 * k, 11.485 + 32 * m)));
  const rowB = Array.from({ length: 8 }, (_, m) => Array.from({ length: 5 }, (_, k) => diamond(52.485 + 64 * k, 26.485 + 32 * m)));
  return [...rowA, ...rowB].flat().join("");
}

/** Rings 8px wide on a 40px pitch. */
function rings(): string {
  const circle = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  return Array.from({ length: 7 }, (_, j) =>
    Array.from({ length: 9 }, (_, i) => circle(20 + 40 * i, 20 + 40 * j, 20) + circle(20 + 40 * i, 20 + 40 * j, 12)),
  )
    .flat()
    .join("");
}

const CHEVRONS =
  "M166.496 141.207 25.703 282h-2.578l-.125-.125 140.668-140.668L23 .54l.54-.54h1.748zM307.288 282h-2.829L180.207 157.747 55.955 282h-2.83l127.082-127.081zm-30 0h-2.829l-94.252-94.253L85.955 282h-2.83l97.082-97.081zm-30 0h-2.828l-64.253-64.253L115.954 282h-2.828l67.081-67.081zm-30 0h-2.828l-34.253-34.253L145.954 282h-2.828l37.081-37.081zm-30 0h-2.828l-4.253-4.253-4.253 4.253h-2.828l7.081-7.081zM337.414.54 196.747 141.207l140.667 140.668-.125.125h-2.578L193.919 141.207 335.126 0h1.748zM136.496 141.207 0 277.703v-2.828l133.668-133.668L0 7.539V4.711zM360 7.954 226.747 141.207 360 274.46v2.828L223.919 141.207 360 5.126zM106.496 141.207 0 247.703v-2.828l103.668-103.668L0 37.539v-2.828zM360 37.954 256.747 141.207 360 244.46v2.828L253.919 141.207 360 35.126zM76.496 141.207 0 217.703v-2.828l73.668-73.668L0 67.539v-2.828zM360 67.954l-73.253 73.253L360 214.46v2.828l-76.081-76.081L360 65.126zM46.496 141.207 0 187.703v-2.828l43.668-43.668L0 97.539v-2.828zM360 97.954l-43.253 43.253L360 184.46v2.828l-46.081-46.081L360 95.126zM16.496 141.207 0 157.703v-2.828l13.668-13.668L0 127.539v-2.828zM360 127.954l-13.253 13.253L360 154.46v2.828l-16.081-16.081L360 125.126zm-179.793-.458L52.71 0h2.83l124.667 124.668L304.875 0h2.828zm0-30L82.71 0h2.83l94.667 94.668L274.875 0h2.828zm0-30L112.711 0h2.828l64.668 64.668L244.875 0h2.828zm0-30L142.711 0h2.828l34.668 34.668L214.875 0h2.828zm0-30L172.711 0h2.828l4.668 4.668L184.875 0h2.828z";

/** Path, canvas height, and which way the light falls (the diamonds are lit from below). */
const PATTERNS: Record<ClothPatternKind, { d: string; dy: number; height: number }> = {
  chevrons: { d: CHEVRONS, dy: 1, height: 283 },
  diamonds: { d: diamonds(), dy: -1, height: 282 },
  grid: { d: grid(), dy: 1, height: 283 },
  rings: { d: rings(), dy: 1, height: 281 },
};

export function ClothPattern({ binding, className, kind }: { binding: (typeof BINDINGS)[number]; className?: string; kind: ClothPatternKind }) {
  const filterId = useId();
  const { d, dy, height } = PATTERNS[kind];
  const [r, g, b, a] = binding.crease;

  return (
    <svg aria-hidden="true" className={className} fill="none" preserveAspectRatio="xMidYMid slice" viewBox={`0 0 ${WIDTH} ${height}`}>
      <g filter={`url(#${CSS.escape(filterId)})`}>
        <path d={d} fill="#fff" fillOpacity={0.01} fillRule="evenodd" shapeRendering="crispEdges" />
      </g>
      <defs>
        <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height={height + 4} id={filterId} width={WIDTH} x={0} y={-2}>
          <feFlood floodOpacity={0} result="clear" />
          <feColorMatrix in="SourceAlpha" result="alpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
          <feOffset dy={dy} />
          <feComposite in2="alpha" operator="out" />
          <feColorMatrix values={`0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${binding.lip} 0`} />
          <feBlend in2="clear" result="lip" />
          <feBlend in="SourceGraphic" in2="lip" result="shape" />
          <feColorMatrix in="SourceAlpha" result="alphaInner" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
          <feOffset dy={dy} />
          <feGaussianBlur stdDeviation={0.5} />
          <feComposite in2="alphaInner" k2={-1} k3={1} operator="arithmetic" />
          <feColorMatrix values={`0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${a} 0`} />
          <feBlend in2="shape" />
        </filter>
      </defs>
    </svg>
  );
}
