import { RunCard } from "../../runs/components/run-card";
import { useRunLibrarian } from "../librarian.hooks";
import { plural, runTotals } from "../librarian.utils";

/** A rail card on the status page; the full timeline is a click away. Hidden until the library was used. */
export function RunLibrarianSummary({ id, live }: { id: string; live: boolean }) {
  const { data } = useRunLibrarian(id, { live });
  if (!data) return null;
  const totals = runTotals(data);
  if (totals.asked + totals.handed === 0 && data.lessonsLearned.length === 0) return null;
  return (
    <RunCard href={`/runs/${id}/librarian`} linkLabel="Library" title="Library">
      <dl className="mt-2 grid grid-cols-2 gap-3 text-xs text-ds-fg-sec">
        <Stat label={totals.asked === 1 ? "lookup" : "lookups"} value={totals.asked} />
        <Stat label="handed over" value={totals.handed} />
      </dl>
      {data.lessonsLearned.length > 0 && (
        <p className="mt-3 text-xs text-ds-fg-sec">{plural(data.lessonsLearned.length, "lesson")} learned from this build</p>
      )}
    </RunCard>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse">
      <dt>{label}</dt>
      <dd className="text-2xl tabular-nums text-ds-fg">{value}</dd>
    </div>
  );
}
