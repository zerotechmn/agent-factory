import { Link } from "wouter";

import { useRunLibrarian } from "../librarian.hooks";
import { plural, runTotals } from "../librarian.utils";

/** One line on the status page; the full timeline is a click away. Hidden until the library was used. */
export function RunLibrarianSummary({ id, live }: { id: string; live: boolean }) {
  const { data } = useRunLibrarian(id, { live });
  if (!data) return null;
  const totals = runTotals(data);
  if (totals.asked + totals.handed === 0 && data.lessonsLearned.length === 0) return null;
  return (
    <Link href={`/runs/${id}/librarian`} className="mt-6 block rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400">
      <div className="flex flex-wrap justify-between gap-2 text-sm text-stone-600">
        <span>Library</span>
        <span className="tabular-nums">
          {plural(totals.asked, "lookup")} · {totals.handed} handed over
          {data.lessonsLearned.length > 0 && ` · ${plural(data.lessonsLearned.length, "lesson")} learned`}
        </span>
      </div>
    </Link>
  );
}
