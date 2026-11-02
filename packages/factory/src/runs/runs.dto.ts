import { z } from "zod";

import { DEFAULT_DESIGN_SYSTEM, DESIGN_SYSTEMS } from "../pipeline/pipeline.types";

export const createRunSchema = z.object({
  designSystem: z.enum(DESIGN_SYSTEMS).default(DEFAULT_DESIGN_SYSTEM),
  prompt: z.string().trim().min(10, "Describe the app in at least 10 characters").max(4_000),
});

export type CreateRunInput = z.infer<typeof createRunSchema>;

// Run ids double as subdomains, so keep them lowercase alphanumeric.
export const runIdSchema = z.string().regex(/^[a-z0-9]{10}$/);
