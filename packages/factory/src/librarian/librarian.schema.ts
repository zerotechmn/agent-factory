import { z } from "zod";

import { LESSON_STEPS } from "./librarian.constants";

/**
 * Added to the output of agents that repair things. The agent already traced
 * the root cause, so writing it down costs a few output tokens and no extra
 * call. The factory keeps a lesson only after a later verify proves the fix.
 */
export const lessonsField = z
  .array(
    z.object({
      fix: z.string().describe("What change made it pass, stated generally (file kinds, config, pattern), not this app's code"),
      problem: z.string().describe("The symptom the factory reported, stated generally, e.g. \"words split mid-word on every screen\""),
      rootCause: z.string().describe("The general cause, e.g. \"global overflow-wrap: anywhere on body\""),
      step: z.enum(LESSON_STEPS).describe("Which check reported it: a verify step, or review"),
      tags: z.array(z.string()).describe("Technologies involved, lowercase, e.g. [\"css\", \"antd\", \"express\"]"),
    }),
  )
  .describe(
    "Reusable lessons for future apps, one per distinct problem the factory reported to you and you fixed. Engineering knowledge only: never include the product, its data, names or the user's wording. Empty when nothing was reported or nothing generalises.",
  );
