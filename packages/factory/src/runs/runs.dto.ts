import { z } from "zod";

import { DEFAULT_DESIGN_SYSTEM, DESIGN_SYSTEMS } from "../pipeline/pipeline.types";
import { CHECKPOINTS } from "../questions/questions.types";

export const createRunSchema = z.object({
  designSystem: z.enum(DESIGN_SYSTEMS).default(DEFAULT_DESIGN_SYSTEM),
  /** false: never pause for the customer's answers (benchmark and scripted runs). */
  interactive: z.boolean().default(true),
  prompt: z.string().trim().min(10, "Describe the app in at least 10 characters").max(4_000),
});

export type CreateRunInput = z.infer<typeof createRunSchema>;

export const feedbackSchema = z.object({
  feedback: z.string().trim().min(10, "Describe the change in at least 10 characters").max(2_000),
});

export const answerSchema = z.object({
  answers: z.array(z.object({ id: z.string().max(20), value: z.string().trim().min(1).max(500) })).max(20).default([]),
  checkpoint: z.enum(CHECKPOINTS),
  feedback: z.string().trim().max(2_000).nullish(),
});

// Run ids double as subdomains, so keep them lowercase alphanumeric.
export const runIdSchema = z.string().regex(/^[a-z0-9]{10}$/);
