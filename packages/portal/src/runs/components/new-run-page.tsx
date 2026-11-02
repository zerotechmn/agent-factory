import { IconArrowUpRight, IconPalette } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useLocation } from "wouter";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { SelectGroup, SelectLabel } from "@/components/ui/select";

import { Alert } from "../../design-system";
import { rememberRun } from "../recent-runs";
import { DESIGN_SYSTEM_OPTIONS } from "../runs.constants";
import { useCreateRun } from "../runs.hooks";
import type { DesignSystem } from "../runs.types";
import { TeamIntro } from "./team-intro";
import { TEMPLATE_CARDS, TemplateCards } from "./template-cards";

const MIN_PROMPT_LENGTH = 10;

const DESIGN_SYSTEM_ITEMS = DESIGN_SYSTEM_OPTIONS.map(({ label, value }) => ({ label, value }));

export function NewRunPage() {
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState<string | null>(null);
  const [designSystem, setDesignSystem] = useState<DesignSystem>("zt");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [, navigate] = useLocation();
  const createRun = useCreateRun();

  const trimmed = prompt.trim();

  const pickTemplate = (value: string | null) => {
    setTemplate(value);
    setPrompt(TEMPLATE_CARDS.find((t) => t.label === value)?.prompt ?? "");
    textareaRef.current?.focus();
  };

  // Resolves on success (PromptInput then clears) and rejects on failure, so the prompt stays for a retry.
  const submit = async () => {
    if (trimmed.length < MIN_PROMPT_LENGTH) return;
    const { id } = await createRun.mutateAsync({ designSystem, prompt: trimmed });
    rememberRun({ createdAt: new Date().toISOString(), id, prompt: trimmed });
    navigate(`/runs/${id}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pt-16 pb-12 md:pt-24">
      <div className="mb-6">
        <TemplateCards value={template} onPick={pickTemplate} />
      </div>

      {/* A raised white composer on the page background, as in Cursor; the card tone in dark mode.
          Focus only nudges the border and adds a faint halo, softer than the default input ring. */}
      <PromptInput
        onSubmit={submit}
        className="*:data-[slot=input-group]:rounded-xl *:data-[slot=input-group]:border-border *:data-[slot=input-group]:bg-[var(--ds-white)] *:data-[slot=input-group]:shadow-[var(--ds-shadow-card)] dark:*:data-[slot=input-group]:bg-card *:data-[slot=input-group]:has-[[data-slot=input-group-control]:focus-visible]:border-ring/40 *:data-[slot=input-group]:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/10"
      >
        <PromptInputBody>
          <PromptInputTextarea
            ref={textareaRef}
            autoFocus
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            aria-label="Describe your app"
            placeholder="Describe the app you want the factory to build"
            className="min-h-24"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputSelect
              items={DESIGN_SYSTEM_ITEMS}
              value={designSystem}
              onValueChange={(value) => value && setDesignSystem(value as DesignSystem)}
            >
              <PromptInputSelectTrigger aria-label="Design system" title="Design system">
                <IconPalette />
                <PromptInputSelectValue />
              </PromptInputSelectTrigger>
              <PromptInputSelectContent align="start" alignItemWithTrigger={false} className="w-80">
                <SelectGroup>
                  <SelectLabel>Design system</SelectLabel>
                  {DESIGN_SYSTEM_OPTIONS.map((option) => (
                    <PromptInputSelectItem key={option.value} value={option.value}>
                      <span className="flex flex-col gap-0.5 whitespace-normal">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </span>
                    </PromptInputSelectItem>
                  ))}
                </SelectGroup>
              </PromptInputSelectContent>
            </PromptInputSelect>
          </PromptInputTools>
          <PromptInputSubmit
            className="rounded-full"
            disabled={trimmed.length < MIN_PROMPT_LENGTH || createRun.isPending}
            status={createRun.isPending ? "submitted" : undefined}
          />
        </PromptInputFooter>
      </PromptInput>

      {createRun.error && (
        <Alert tone="error">{createRun.error instanceof Error ? createRun.error.message : "Something went wrong"}</Alert>
      )}

      <Suggestions>
        <Suggestion suggestion="What the factory knows" onClick={() => navigate("/librarian")}>
          What the factory knows
          <IconArrowUpRight data-icon="inline-end" />
        </Suggestion>
      </Suggestions>

      <div className="mt-10">
        <TeamIntro />
      </div>
    </div>
  );
}
