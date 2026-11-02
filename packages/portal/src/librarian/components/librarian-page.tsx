import type { ReactNode } from "react";
import { Link } from "wouter";

import { STEP_CODES, STEP_LABELS } from "../librarian.constants";
import { useLibrarian } from "../librarian.hooks";
import type { LibraryOverview } from "../librarian.types";
import { plural, shelve, spineColor, spineHeight } from "../librarian.utils";

// The page borrows a real library's furniture (catalog drawers, shelved books,
// index cards, a reference section) so a customer reads it at a glance.
// Everything is still plain text: no information lives only in the picture.

/** What the factory knows: shared knowledge and usage counts only, never another customer's lookups. */
export function LibrarianPage() {
  const { data, error, isLoading } = useLibrarian();

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">← New app</Link>

      <header className="mt-8 border-b-4 border-double border-stone-300 pb-6 text-center">
        <p className="text-xs font-medium tracking-[0.3em] text-stone-500 uppercase">Software Factory</p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight text-stone-900 sm:text-5xl">The Library</h1>
        <p className="mx-auto mt-3 max-w-2xl font-serif text-base text-stone-600 italic">
          Every agent reads here before it guesses. Version-pinned documentation, proven code, and lessons from earlier builds,
          kept and handed over at the moment they matter.
        </p>
      </header>

      {isLoading && <p className="mt-10 text-center text-stone-500">Opening the doors…</p>}
      {error && <p className="mt-10 text-center text-red-700">{error instanceof Error ? error.message : "Could not load the library"}</p>}
      {data && <Library data={data} />}
    </main>
  );
}

function Library({ data }: { data: LibraryOverview }) {
  const { totals } = data;
  const hitRate = totals.lookups ? Math.round((totals.lookupsWithHits / totals.lookups) * 100) : null;
  return (
    <>
      <dl className="mt-10 grid grid-cols-2 gap-3 rounded-xl bg-[#3f3026] p-3 shadow-inner sm:grid-cols-4">
        <Drawer label="Holdings" value={totals.docSections} detail={`sections in ${plural(data.docs.length, "volume")}`} />
        <Drawer label="Reference" value={data.catalog.length} detail="proven modules" />
        <Drawer label="Card catalog" value={totals.lessons} detail="lessons, each proven" />
        <Drawer
          label="Circulation"
          value={totals.lookups}
          detail={hitRate === null ? `lookups · ${plural(totals.runs, "build")}` : `lookups · ${hitRate}% found · ${plural(totals.runs, "build")}`}
        />
      </dl>

      <Room
        title="The stacks"
        note="Documentation pinned to the versions the factory builds with, so agents read pages that match the code they write. Taller books hold more."
      >
        {data.docs.length === 0 ? (
          <Empty>The shelves are empty. Run the docs sync script to stock them.</Empty>
        ) : (
          // A bookcase: wooden frame, back panel, shelves side by side on wider screens.
          <div className="grid gap-x-8 gap-y-8 rounded-md border-[6px] border-[#6b4f3a] bg-[#efe4d2] p-4 shadow-[inset_0_2px_8px_rgba(0,0,0,0.12)] sm:grid-cols-2 sm:p-6">
            {shelve(data.docs).map((shelf) => (
              <Shelf key={shelf.label} label={shelf.label}>
                {shelf.books.map((book) => (
                  <Book key={book.library} name={book.library} sections={book.sections} />
                ))}
              </Shelf>
            ))}
          </div>
        )}
      </Room>

      <Room
        title="Card catalog"
        note="One card per lesson. When a check fails and a fix makes it pass, the factory files a card. Later builds draw it before they repeat the mistake."
      >
        {data.lessons.length === 0 ? (
          <Empty>No cards filed yet. The first one is written the next time a fix is proven by a passing check.</Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {data.lessons.map((lesson) => (
              <li key={lesson.id}>
                <IndexCard
                  callNumber={`${STEP_CODES[lesson.step]}-${String(lesson.id).padStart(4, "0")}`}
                  cause={lesson.rootCause}
                  fix={lesson.fix}
                  seen={lesson.seen}
                  subject={STEP_LABELS[lesson.step]}
                  tags={lesson.tags}
                  title={lesson.problem}
                />
              </li>
            ))}
          </ul>
        )}
      </Room>

      <Room
        title="Reference section"
        note="Code taken from builds that passed every check, made generic and reviewed. Not for loan: agents copy it into their workspace and adapt it."
      >
        {data.catalog.length === 0 ? (
          <Empty>Nothing on the reference shelf yet.</Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {data.catalog.map((item) => (
              <li key={item.name}>
                <Cover files={item.files} name={item.name} summary={item.summary} tags={item.tags} />
              </li>
            ))}
          </ul>
        )}
      </Room>
    </>
  );
}

/** A card-catalog drawer front: brass label plate, big number, a pull handle. */
function Drawer({ detail, label, value }: { detail: string; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-md bg-[#6e5440] px-3 pt-3 pb-4 text-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)]">
      <dt className="w-full rounded-sm border border-[#a8823a] bg-[#f6ecd2] px-2 py-1 font-serif text-xs tracking-widest text-[#4a3423] uppercase shadow-sm">
        {label}
      </dt>
      <dd className="mt-3 font-serif text-3xl text-white tabular-nums">{value.toLocaleString()}</dd>
      <dd className="mt-1 text-xs text-[#f3e6d3]">{detail}</dd>
      <dd aria-hidden="true" className="mt-3 h-1.5 w-10 rounded-full bg-[#c9a24a] shadow-[0_1px_0_rgba(0,0,0,0.35)]" />
    </div>
  );
}

function Room({ children, note, title }: { children: ReactNode; note: string; title: string }) {
  return (
    <section className="mt-14">
      <div className="flex items-center gap-4">
        <h2 className="font-serif text-2xl tracking-tight text-stone-900">{title}</h2>
        <span aria-hidden="true" className="h-px flex-1 bg-stone-300" />
      </div>
      <p className="mt-2 mb-6 max-w-2xl text-sm text-stone-600">{note}</p>
      {children}
    </section>
  );
}

/** Books stand on a wooden board; the label plate names the shelf. */
function Shelf({ children, label }: { children: ReactNode; label: string }) {
  // Full height of its bookcase row, books pushed down, so neighbouring shelves' boards line up.
  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 self-start rounded-sm border border-[#a8823a] bg-[#f6ecd2] px-2 py-0.5 font-serif text-xs tracking-widest text-[#4a3423] uppercase">
        {label}
      </p>
      <ul aria-label={`${label} shelf`} className="flex flex-1 flex-wrap content-end items-end gap-1.5 px-2">
        {children}
      </ul>
      <div aria-hidden="true" className="h-3 rounded-sm bg-[#6b4f3a] shadow-[0_4px_6px_-2px_rgba(0,0,0,0.35)]" />
    </div>
  );
}

/** A spine with its title running up the side; height follows how much it holds. */
function Book({ name, sections }: { name: string; sections: number }) {
  const [title, version] = name.split("@");
  return (
    <li
      aria-label={`${name}, ${sections} sections`}
      className="group relative flex w-12 flex-col items-center justify-between rounded-t-sm py-2 text-white shadow-[inset_-3px_0_0_rgba(0,0,0,0.25),inset_2px_0_0_rgba(255,255,255,0.12)] transition-transform hover:-translate-y-1"
      style={{ backgroundColor: spineColor(name), height: `${spineHeight(sections)}rem` }}
      title={`${name} · ${sections} sections`}
    >
      <span aria-hidden="true" className="h-0.5 w-8 bg-[#d4b46a]/80" />
      <span className="font-serif text-sm whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{title}</span>
      <span className="flex flex-col items-center gap-1">
        {version && <span className="rounded-sm bg-black/25 px-1 text-[10px] tabular-nums">v{version}</span>}
        <span aria-hidden="true" className="h-0.5 w-8 bg-[#d4b46a]/80" />
      </span>
    </li>
  );
}

/** A ruled index card: call number and subject on top, the lesson in the body, a stamp per proving build. */
function IndexCard({
  callNumber,
  cause,
  fix,
  seen,
  subject,
  tags,
  title,
}: {
  callNumber: string;
  cause: string;
  fix: string;
  seen: number;
  subject: string;
  tags: string[];
  title: string;
}) {
  return (
    <article className="h-full rounded-sm border border-stone-300 bg-[#fffdf6] shadow-[0_1px_0_rgba(0,0,0,0.05),0_6px_12px_-8px_rgba(0,0,0,0.3)]">
      <header className="flex items-baseline justify-between gap-3 border-b-2 border-rose-300 px-4 pt-3 pb-1.5">
        <span className="font-mono text-xs font-semibold tracking-wider text-stone-700">{callNumber}</span>
        <span className="text-right text-xs text-stone-500 uppercase">{subject}</span>
      </header>
      {/* Every line is exactly 24px tall, so text sits on the card's 24px ruling instead of across it. */}
      <div className="bg-[repeating-linear-gradient(transparent_0,transparent_23px,#dbeafe_23px,#dbeafe_24px)] px-4 pb-0">
        <h3 className="font-serif text-base/6 font-semibold break-words text-stone-900">{title}</h3>
        <p className="text-sm/6 break-words text-stone-700"><span className="text-stone-500">Cause: </span>{cause}</p>
        <p className="text-sm/6 break-words text-stone-700"><span className="text-stone-500">Fix: </span>{fix}</p>
        {tags.length > 0 && <p className="text-xs/6 break-words text-stone-500">Subjects: {tags.join(" — ")}</p>}
      </div>
      <footer className="flex flex-wrap items-center gap-2 px-4 pt-2 pb-3">
        <span className="-rotate-2 rounded border-2 border-rose-700 px-1.5 text-[10px] font-bold tracking-widest text-rose-800 uppercase">Proven</span>
        <span className="text-xs text-stone-600">Drawn by {plural(seen, "build")}</span>
      </footer>
    </article>
  );
}

/** A hardcover in the reference section: cloth spine edge, title, subjects. */
function Cover({ files, name, summary, tags }: { files: number; name: string; summary: string; tags: string[] }) {
  return (
    <article className="flex h-full overflow-hidden rounded-r-md border border-stone-300 bg-white shadow-[0_6px_12px_-8px_rgba(0,0,0,0.35)]">
      <span aria-hidden="true" className="w-4 shrink-0" style={{ backgroundColor: spineColor(name) }} />
      <div className="min-w-0 p-4">
        <p className="text-[10px] font-semibold tracking-[0.25em] text-stone-500 uppercase">Reference · not for loan</p>
        <h3 className="mt-1 font-serif text-lg break-words text-stone-900">{name}</h3>
        <p className="mt-1 text-sm break-words text-stone-700">{summary}</p>
        <p className="mt-3 text-xs break-words text-stone-500">
          {plural(files, "file")}
          {tags.length > 0 && ` · Subjects: ${tags.join(", ")}`}
        </p>
      </div>
    </article>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-sm border border-dashed border-stone-300 bg-[#fffdf6] p-4 font-serif text-sm text-stone-600 italic">{children}</p>;
}
