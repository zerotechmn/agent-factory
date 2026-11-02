import { useEffect, useState, type FormEvent } from "react";

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
    <form onSubmit={submit} className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4" aria-labelledby="questions-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="questions-title" className="font-medium text-amber-950">
          {spec ? (open.context?.changes ? "Please confirm the changes to your app" : "Please review the spec before we build") : "A few questions before we write the spec"}
        </h2>
        <span className="text-sm tabular-nums text-amber-900" aria-live="polite">
          {remaining > 0 ? `Continuing on its own in ${formatSeconds(remaining)}` : "Continuing now…"}
        </span>
      </div>
      <p className="mt-1 text-sm text-amber-900">
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

      <label className="mt-4 block text-sm font-medium text-amber-950">
        {spec ? "Anything to add or change?" : "Anything else we should know?"}
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          rows={3}
          maxLength={2_000}
          className="mt-1 w-full resize-y rounded-md border border-amber-300 bg-white p-2 font-normal text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={answer.isPending} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          {answer.isPending ? "Sending…" : "Send answers"}
        </button>
        <button
          type="button"
          disabled={answer.isPending}
          onClick={(event) => submit(event, true)}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-40"
        >
          {spec ? "Approve as is" : "Use the suggestions"}
        </button>
      </div>
      {answer.error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
          {answer.error instanceof Error ? answer.error.message : "Could not send your answers"}
        </p>
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
    <fieldset className="rounded-md bg-white p-3 ring-1 ring-amber-200">
      <legend className="sr-only">{question.question}</legend>
      <p className="text-sm font-medium text-stone-900">{question.question}</p>
      {question.why && <p className="mt-0.5 text-xs text-stone-500">{question.why}</p>}
      <div className="mt-2 space-y-1.5">
        {question.options.map((option) => (
          <label key={option} className="flex items-start gap-2 text-sm text-stone-800">
            <input type="radio" name={question.id} checked={choice === option} onChange={() => onChoice(option)} className="mt-1" />
            <span>
              {option}
              {option === question.default && <span className="ml-1.5 text-xs text-stone-500">(suggested)</span>}
            </span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-stone-800">
          <input type="radio" name={question.id} checked={choice === OTHER} onChange={() => onChoice(OTHER)} />
          <span className="shrink-0">Other:</span>
          <input
            type="text"
            value={other}
            maxLength={500}
            onFocus={() => onChoice(OTHER)}
            onChange={(event) => onOther(event.target.value)}
            aria-label={`Other answer to: ${question.question}`}
            className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-sm outline-none focus:border-stone-500"
          />
        </label>
      </div>
    </fieldset>
  );
}

function SpecSummary({ context }: { context: NonNullable<OpenQuestions["context"]> }) {
  if (context.changes) {
    return (
      <div className="mt-4 rounded-md bg-white p-3 text-sm ring-1 ring-amber-200">
        <p className="font-medium text-stone-900">What will change</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
          {context.changes.length ? context.changes.map((c) => <li key={c}>{c}</li>) : <li>No spec items change; the update is to how existing parts work.</li>}
        </ul>
      </div>
    );
  }
  return (
    <div className="mt-4 grid gap-3 rounded-md bg-white p-3 text-sm ring-1 ring-amber-200 sm:grid-cols-3">
      <SpecList title="Features" items={context.features.map((f) => `${f.id} ${f.name}`)} />
      <SpecList title="Screens" items={context.screens.map((s) => `${s.id} ${s.name}`)} />
      <SpecList title="Roles" items={context.roles} />
    </div>
  );
}

function SpecList({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-stone-900">{title}</p>
      <ul className="mt-1 space-y-0.5 text-stone-700">
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
