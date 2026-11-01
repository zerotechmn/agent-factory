import { z } from "zod";

export const createRunSchema = z.object({
  prompt: z.string().trim().min(10, "Describe the app in at least 10 characters").max(4_000),
});

export type CreateRunInput = z.infer<typeof createRunSchema>;

// Run ids double as subdomains, so keep them lowercase alphanumeric.
export const runIdSchema = z.string().regex(/^[a-z0-9]{10}$/);
