import { useEffect, useState, type FormEvent } from "react";

import { Alert, Button, Textarea } from "../../design-system";
import { useAnswerQuestions } from "../runs.hooks";
import type { OpenQuestions, Question } from "../runs.types";

const OTHER = "__other__";

/**
 * The customer's side of a checkpoint: the agents' questions with their own
 * choice preselected, so "Use the suggestions" is always one click, and a
 * countdown to when the run continues on its own.
 */
export function RunQuestions({ open, runId }: { open: OpenQuestions; runId: string }) {
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(open.items.map((q) => [q.id, q.default])));
  const [other, setOther] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const answer = useAnswerQuestions(runId);
  const remaining = useCountdown(open.deadline);
  const spec = open.checkpoint === "prd";

  const submit = (event: FormEvent, useSuggestions = false) => {
    event.preventDefault();
    const answers = useSuggestions
      ? []
      : open.items.map((q) => ({ id: q.id, value: choices[q.id] === OTHER ? (other[q.id] ?? "").trim() || q.default : (choices[q.id] ?? q.default) }));
    answer.mutate({ answers, checkpoint: open.checkpoint, feedback: useSuggestions ? null : feedback.trim() || null });
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-[var(--ds-radius-xs)] border border-ds-accent/30 bg-ds-card-warm p-4" aria-labelledby="questions-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="questions-title" className="text-ds-fg">
          {spec ? (open.context?.changes ? "Please confirm the changes to your app" : "Please review the spec before we build") : "A few questions before we write the spec"}
        </h2>
        <span className="text-sm tabular-nums text-ds-accent" aria-live="polite">
          {remaining > 0 ? `Continuing on its own in ${formatSeconds(remaining)}` : "Continuing now…"}
        </span>
      </div>
      <p className="mt-1 text-sm text-ds-fg-sec">
        Our suggestion is already selected. Change what you'd like, or just use the suggestions.
      </p>

      {spec && open.context && <SpecSummary context={open.context} />}

      <div className="mt-4 space-y-4">
        {open.items.map((q) => (
          <QuestionField
            key={q.id}
            choice={choices[q.id] ?? q.default}
            onChoice={(value) => setChoices((c) => ({ ...c, [q.id]: value }))}
            onOther={(value) => setOther((o) => ({ ...o, [q.id]: value }))}
            other={other[q.id] ?? ""}
            question={q}
          />
        ))}
      </div>

      <div className="mt-4">
        <Textarea
          label={spec ? "Anything to add or change?" : "Anything else we should know?"}
          value={feedback}
          onValueChange={setFeedback}
          rows={3}
          maxLength={2_000}
          fieldSize="sm"
          className="min-h-0 resize-y bg-ds-card"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={answer.isPending}>
          {answer.isPending ? "Sending…" : "Send answers"}
        </Button>
        <Button variant="ghost" size="sm" disabled={answer.isPending} onClick={(event) => submit(event, true)}>
          {spec ? "Approve as is" : "Use the suggestions"}
        </Button>
      </div>
      {answer.error && (
        <Alert tone="error" className="mt-3">
          {answer.error instanceof Error ? answer.error.message : "Could not send your answers"}
        </Alert>
      )}
    </form>
  );
}

function QuestionField({
  choice,
  onChoice,
  onOther,
  other,
  question,
}: {
  choice: string;
  onChoice: (value: string) => void;
  onOther: (value: string) => void;
  other: string;
  question: Question;
}) {
  return (
    <fieldset className="rounded-[var(--ds-radius-xs)] bg-ds-card p-3 ring-1 ring-ds-line">
      <legend className="sr-only">{question.question}</legend>
      <p className="text-sm text-ds-fg">{question.question}</p>
      {question.why && <p className="mt-0.5 text-xs text-ds-fg-sec">{question.why}</p>}
      <div className="mt-2 space-y-1.5">
        {question.options.map((option) => (
          <label key={option} className="flex items-start gap-2 text-sm text-ds-fg">
            <input type="radio" name={question.id} checked={choice === option} onChange={() => onChoice(option)} className="mt-1 accent-[var(--ds-button-bg)]" />
            <span>
              {option}
              {option === question.default && <span className="ml-1.5 text-xs text-ds-fg-sec">(suggested)</span>}
            </span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-ds-fg">
          <input type="radio" name={question.id} checked={choice === OTHER} onChange={() => onChoice(OTHER)} className="accent-[var(--ds-button-bg)]" />
          <span className="shrink-0">Other:</span>
          <input
            type="text"
            value={other}
            maxLength={500}
            onFocus={() => onChoice(OTHER)}
            onChange={(event) => onOther(event.target.value)}
            aria-label={`Other answer to: ${question.question}`}
            className="min-w-0 flex-1 rounded-[var(--ds-radius-xs)] border border-ds-line bg-ds-bg px-2 py-1 text-sm outline-none placeholder:text-ds-fg-ter focus:border-ds-line-strong"
          />
        </label>
      </div>
    </fieldset>
  );
}

function SpecSummary({ context }: { context: NonNullable<OpenQuestions["context"]> }) {
  if (context.changes) {
    return (
      <div className="mt-4 rounded-[var(--ds-radius-xs)] bg-ds-card p-3 text-sm ring-1 ring-ds-line">
        <p className="text-ds-fg">What will change</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ds-fg">
          {context.changes.length ? context.changes.map((c) => <li key={c}>{c}</li>) : <li>No spec items change; the update is to how existing parts work.</li>}
        </ul>
      </div>
    );
  }
  return (
    <div className="mt-4 grid gap-3 rounded-[var(--ds-radius-xs)] bg-ds-card p-3 text-sm ring-1 ring-ds-line sm:grid-cols-3">
      <SpecList title="Features" items={context.features.map((f) => `${f.id} ${f.name}`)} />
      <SpecList title="Screens" items={context.screens.map((s) => `${s.id} ${s.name}`)} />
      <SpecList title="Roles" items={context.roles} />
    </div>
  );
}

function SpecList({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="min-w-0">
      <p className="text-ds-fg">{title}</p>
      <ul className="mt-1 space-y-0.5 text-ds-fg">
        {items.map((item) => (
          <li key={item} className="truncate" title={item}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function useCountdown(deadline: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(Math.round((Date.parse(deadline) - now) / 1_000), 0);
}

function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
