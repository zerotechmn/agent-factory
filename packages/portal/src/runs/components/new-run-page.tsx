import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";

import { DESIGN_SYSTEM_OPTIONS } from "../runs.constants";
import { useCreateRun } from "../runs.hooks";
import type { DesignSystem } from "../runs.types";

const EXAMPLES = [
  "A habit tracker where I can add habits and tick them off each day, with a weekly streak view",
  "A shared grocery list with categories and a 'bought' toggle",
  "A tiny link shortener with click counts",
];

export function NewRunPage() {
  const [prompt, setPrompt] = useState("");
  const [designSystem, setDesignSystem] = useState<DesignSystem>("zt");
  const [, navigate] = useLocation();
  const createRun = useCreateRun();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createRun.mutate({ designSystem, prompt: prompt.trim() }, { onSuccess: ({ id }) => navigate(`/runs/${id}`) });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Describe the app you want</h1>
      <p className="mt-2 text-stone-600">
        A team of AI agents will specify, design, build, review, test and deploy it. It usually takes 20–60 minutes;
        you'll be redirected when it's live.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={6}
          maxLength={4_000}
          placeholder="e.g. A recipe box where I can save recipes, tag them, and search by ingredient"
          className="w-full resize-y rounded-lg border border-stone-300 bg-white p-4 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
        />
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium text-stone-700">Design</legend>
          {DESIGN_SYSTEM_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-lg border bg-white p-3 text-sm ${
                designSystem === option.value ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-300"
              }`}
            >
              <input
                type="radio"
                name="designSystem"
                value={option.value}
                checked={designSystem === option.value}
                onChange={() => setDesignSystem(option.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-stone-900">{option.label}</span>
                <span className="text-stone-600">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-stone-500">{prompt.trim().length} / 4000</span>
          <button
            type="submit"
            disabled={prompt.trim().length < 10 || createRun.isPending}
            className="rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {createRun.isPending ? "Starting…" : "Build it"}
          </button>
        </div>
        {createRun.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {createRun.error instanceof Error ? createRun.error.message : "Something went wrong"}
          </p>
        )}
      </form>

      <div className="mt-10">
        <p className="text-sm font-medium text-stone-500">Try one of these</p>
        <ul className="mt-2 space-y-2">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => setPrompt(example)}
                className="text-left text-sm text-stone-700 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-600"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
