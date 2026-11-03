/**
 * Vendored from https://github.com/jeremy-prt/bloub (MIT, see LICENSE) at b4bb3c1,
 * `src/bot/` minus its tests. Framework-free and clock-free: `engine.sample(t)` is a
 * pure function of time. Keep these files untouched so they can be re-synced; the
 * React side lives in `../components/bloub.tsx`.
 */
export { BotEngine, type BotFrame } from "./engine";
export { EXPRESSION_BY_ID, type ExpressionId } from "./expressions";
export { liveliness } from "./face";
export { RAYON } from "./repere";
export { SHAPE_BY_ID, type ShapeId } from "./skins";
export { POSES, STATE_BY_ID, type StateId } from "./states";
