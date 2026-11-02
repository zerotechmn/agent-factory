import { IconArrowLeft, IconArrowRight, IconArrowUp, IconCheck, IconChevronRight, IconCopy, IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { BINDINGS, STEP_CODES, STEP_LABELS, SYNC_DOCS_COMMAND } from "../librarian.constants";
import { useLibrarian } from "../librarian.hooks";
import type { LibraryOverview } from "../librarian.types";
import { binding, moduleTitle, patternOf, plural, shelfOf, shelfOfTags, shelve, spineSize } from "../librarian.utils";
import { ClothPattern } from "./cloth-pattern";
import { ShelfIcon } from "./shelf-icon";

// Laid out like an encyclopedia's front page: a wordmark and search, a featured
// volume, the stacks as one long shelf, then the card catalog and reference shelf.
// Everything is still plain text: no information lives only in the picture.

type Doc = LibraryOverview["docs"][number];
type Binding = (typeof BINDINGS)[number];

/** What the factory knows: shared knowledge and usage counts only, never another customer's lookups. */
export function LibrarianPage() {
  const { data, error, isLoading } = useLibrarian();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-16 pb-12 sm:px-8">
      {isLoading && <p className="py-24 text-center font-serif text-lg text-ds-fg-sec italic">Opening the doors…</p>}
      {error && <p className="py-24 text-center text-ds-error">{error instanceof Error ? error.message : "Could not load the library"}</p>}
      {data && <Library data={data} />}
    </main>
  );
}

function clothStyle(cloth: Binding): CSSProperties {
  return {
    "--cloth": cloth.cloth,
    "--cloth-base": cloth.base,
    "--cloth-emboss": cloth.emboss,
    "--cloth-ink": cloth.ink,
  } as CSSProperties;
}

function splitName(library: string): { title: string; version?: string } {
  const [title, version] = library.split("@");
  return { title: title!, version };
}

function matches(query: string, ...fields: string[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || fields.some((field) => field.toLowerCase().includes(q));
}

function Library({ data }: { data: LibraryOverview }) {
  const [query, setQuery] = useState("");
  const shelves = useMemo(() => shelve(data.docs), [data.docs]);
  // Bindings follow shelf order rather than a name hash, so neighbouring books never share a cloth.
  const bindings = useMemo(() => new Map(shelves.flatMap((s) => s.books).map((doc, i) => [doc.library, BINDINGS[i % BINDINGS.length]!])), [shelves]);
  const largest = useMemo(() => [...data.docs].sort((a, b) => b.sections - a.sections).slice(0, 5), [data.docs]);
  const [featured, setFeatured] = useState(largest[0]?.library);
  const featuredDoc = data.docs.find((d) => d.library === featured);
  const stacksRef = useRef<HTMLElement>(null);

  const modules = data.catalog.filter((m) => matches(query, m.name, moduleTitle(m.name), m.summary, ...m.tags));
  const lessons = data.lessons.filter((l) => matches(query, l.problem, l.rootCause, l.fix, STEP_LABELS[l.step], ...l.tags));
  const volumeHits = data.docs.filter((d) => matches(query, d.library)).length;

  const { totals } = data;
  const hitRate = totals.lookups ? Math.round((totals.lookupsWithHits / totals.lookups) * 100) : null;

  return (
    <>
      <section className="grid items-center gap-14 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <h1 className="flex items-baseline gap-3 font-serif text-[clamp(3.75rem,9vw,6.5rem)] leading-none tracking-[-0.03em] text-ds-fg italic">
            Librarian
            <span className="text-2xl tracking-normal text-ds-fg-ter">{plural(data.docs.length, "vol.", "vols.")}</span>
          </h1>
          <p className="mt-6 max-w-md text-base text-ds-fg-sec">
            Version-pinned documentation, proven code, and lessons from earlier builds. Every agent reads here before it guesses.
          </p>
          <SearchBox
            onChange={setQuery}
            onSubmit={() =>
              stacksRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            value={query}
          />
          {query.trim() ? (
            <p aria-live="polite" className="mt-4 text-xs text-ds-fg-sec">
              {plural(volumeHits, "volume")}, {plural(modules.length, "module")} and {plural(lessons.length, "lesson")} match “{query.trim()}”.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ds-fg-ter">
              <span>Largest</span>
              {largest.slice(0, 3).map((doc) => (
                <button
                  className="rounded-full border border-ds-line px-3 py-1 text-ds-fg-sec transition-colors hover:border-ds-line-strong hover:text-ds-fg"
                  key={doc.library}
                  onClick={() => setQuery(splitName(doc.library).title)}
                  type="button"
                >
                  {doc.library}
                </button>
              ))}
            </div>
          )}
        </div>

        {featuredDoc && (
          <div className="grid items-center gap-10 sm:grid-cols-[auto_minmax(0,1fr)]">
            <Cover cloth={bindings.get(featuredDoc.library)!} doc={featuredDoc} />
            <Featured
              doc={featuredDoc}
              largest={largest}
              onSelect={setFeatured}
              onShowOnShelf={() =>
                stacksRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
            />
          </div>
        )}
      </section>

      <div className="mt-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-y border-ds-line py-3 text-xs text-ds-fg-sec">
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ds-fg" />
          <span className="text-ds-fg">{totals.docSections.toLocaleString()} sections</span> indexed across {plural(data.docs.length, "volume")}
        </p>
        <p>
          <span className="text-ds-fg tabular-nums">{totals.lookups.toLocaleString()}</span> lookups across {plural(totals.runs, "build")}
          {hitRate !== null && ` · ${hitRate}% found an answer`}
        </p>
      </div>

      <section className="mt-8 scroll-mt-8" ref={stacksRef}>
        <Stacks bindings={bindings} onFeature={setFeatured} query={query} shelves={shelves} />
      </section>

      <section className="mt-24">
        <SectionHeader
          note="One card per lesson. When a check fails and a fix makes it pass, the factory files a card; later builds draw it before repeating the mistake."
          title="Card catalog"
        />
        {data.lessons.length === 0 ? (
          <Empty>No cards filed yet. The first one is written the next time a fix is proven by a passing check.</Empty>
        ) : lessons.length === 0 ? (
          <Empty>No lesson matches “{query.trim()}”.</Empty>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Card
                  aside={`${STEP_CODES[lesson.step]}-${String(lesson.id).padStart(4, "0")}`}
                  meta={`${STEP_LABELS[lesson.step]} · drawn by ${plural(lesson.seen, "build")}`}
                  title={lesson.problem}
                >
                  <span className="text-ds-fg-sec">Cause:</span> {lesson.rootCause} <span className="text-ds-fg-sec">Fix:</span> {lesson.fix}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-20">
        <SectionHeader
          note="Working code saved from earlier builds that passed every check. Agents copy it into a new app and change it to fit, instead of writing it from scratch."
          title="Reference section"
        />
        {data.catalog.length === 0 ? (
          <Empty>Nothing on the reference shelf yet.</Empty>
        ) : modules.length === 0 ? (
          <Empty>No module matches “{query.trim()}”.</Empty>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((item) => (
              <li key={item.name}>
                <Folder cloth={binding(item.name)} meta={item.tags.slice(0, 4).join(" · ")} name={item.name} shelf={shelfOfTags(item.tags)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <SomethingMissing />
    </>
  );
}

function SearchBox({ onChange, onSubmit, value }: { onChange: (value: string) => void; onSubmit: () => void; value: string }) {
  return (
    <form
      className="mt-8 flex max-w-xl items-center gap-3 rounded-full border border-ds-line bg-white/80 py-2 pr-2 pl-5 shadow-[0_1px_2px_#0000000a,0_8px_24px_-12px_#0000001f] transition-colors focus-within:border-ds-line-strong dark:bg-ds-card"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      role="search"
    >
      <IconSearch aria-hidden="true" className="shrink-0 text-ds-fg-ter" size={18} />
      <input
        aria-label="Search the library"
        className="min-w-0 flex-1 bg-transparent text-base text-ds-fg outline-none placeholder:text-ds-fg-ter"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && onChange("")}
        placeholder="Search volumes, modules, lessons"
        type="search"
        value={value}
      />
      <button
        aria-label="Show on the shelf"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-ds-card-2 text-ds-fg-sec transition-colors hover:bg-ds-card-3 hover:text-ds-fg active:scale-95"
        type="submit"
      >
        <IconArrowUp size={16} />
      </button>
    </form>
  );
}

/** The featured volume face-on, bound in its cloth with its shelf's pressed pattern. */
function Cover({ cloth, doc }: { cloth: Binding; doc: Doc }) {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-[18/25] w-52 sm:w-56">
      <CoverFace cloth={cloth} doc={doc} key={doc.library} />
      <div className="absolute inset-x-6 -bottom-5 h-5 rounded-[50%] bg-black/20 blur-xl dark:bg-black/50" />
    </div>
  );
}

/** A front cover after the Motion Passport: masthead, pressed pattern, title. Fills its box. */
function CoverFace({ cloth, compact, doc }: { cloth: Binding; compact?: boolean; doc: Doc }) {
  const { title, version } = splitName(doc.library);
  return (
    <div
      className="cloth absolute inset-0 flex flex-col overflow-hidden rounded-tl-[2px] rounded-tr-[18px] rounded-br-[18px] rounded-bl-[2px]"
      style={clothStyle(cloth)}
    >
      <div className={cn("flex items-start justify-between", compact ? "px-3 pt-3" : "px-4 pt-4")}>
        {/* Pressed into the cloth like the passport's logo: the glyph in the binding's ink, with its emboss. */}
        <ShelfIcon shelf={shelfOf(doc.library)} size={compact ? 22 : 28} style={{ filter: "drop-shadow(var(--cloth-emboss))" }} />
        <span className={cn("text-right font-semibold tracking-[-0.02em] cloth-text", compact ? "text-[10px]" : "text-xs")}>
          Librarian
          <br />
          {doc.sections.toLocaleString()} sections
          {version && (
            <>
              <br />
              Version {version}
            </>
          )}
        </span>
      </div>
      <div className={cn("relative flex-1", compact ? "mt-3" : "mt-4")}>
        <ClothPattern binding={cloth} className="absolute inset-0 size-full" kind={patternOf(doc.library)} />
      </div>
      <p
        className={cn(
          "leading-none font-semibold tracking-[-0.04em] break-words cloth-text",
          compact ? "px-3 pt-2 pb-3 text-xl" : "px-4 pt-3 pb-4 text-[1.75rem]",
        )}
      >
        {title}
      </p>
    </div>
  );
}

function Featured({
  doc,
  largest,
  onSelect,
  onShowOnShelf,
}: {
  doc: Doc;
  largest: Doc[];
  onSelect: (library: string) => void;
  onShowOnShelf: () => void;
}) {
  const { title, version } = splitName(doc.library);
  return (
    <div>
      <p className="text-xs text-ds-fg-sec">Featured volume</p>
      <h2 className="mt-1 font-serif text-4xl tracking-tight break-words text-ds-fg">{title}</h2>
      <p className="mt-4 text-sm text-ds-fg-sec">
        {doc.sections.toLocaleString()} sections of {title} documentation
        {version ? `, pinned to version ${version}` : ", kept current"}. Shelved under {shelfOf(doc.library)}; agents search it before writing code
        that uses it.
      </p>
      <button
        className="mt-3 inline-flex items-center gap-1 text-sm text-ds-fg-sec transition-colors hover:text-ds-fg"
        onClick={onShowOnShelf}
        type="button"
      >
        Find it on the shelf <IconChevronRight size={14} />
      </button>
      <ol aria-label="Largest volumes" className="mt-6 border-t border-ds-line">
        {largest.map((item, i) => {
          const active = item.library === doc.library;
          return (
            <li key={item.library}>
              <button
                aria-current={active || undefined}
                className={cn(
                  "flex w-full items-center gap-4 border-b py-2.5 text-left text-sm transition-colors",
                  active ? "border-ds-fg text-ds-fg" : "border-ds-line text-ds-fg-sec hover:text-ds-fg",
                )}
                onClick={() => onSelect(item.library)}
                type="button"
              >
                <span className="w-5 text-xs tabular-nums text-ds-fg-ter">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1 truncate">{item.library}</span>
                {active && <IconChevronRight aria-hidden="true" size={14} />}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Every volume on one long board, grouped by shelf. Taller, thicker books hold more.
 * Hovering lifts a book; picking one turns it to face out, pushing its neighbours aside.
 */
function Stacks({
  bindings,
  onFeature,
  query,
  shelves,
}: {
  bindings: Map<string, Binding>;
  onFeature: (library: string) => void;
  query: string;
  shelves: { books: Doc[]; label: string }[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ end: true, start: true });
  const [pulled, setPulled] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const books = shelves.flatMap((s) => s.books);
  const captioned = books.find((b) => b.library === (hovered ?? pulled));

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    setEdges({
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
      start: el.scrollLeft <= 0,
    });
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const scrollBy = (direction: 1 | -1) =>
    scroller.current?.scrollBy({
      behavior: "smooth",
      left: direction * scroller.current.clientWidth * 0.8,
    });

  const toggle = (library: string) => {
    if (pulled === library) return setPulled(null);
    setPulled(library);
    onFeature(library);
  };

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <SectionHeader note="Documentation pinned to the versions the factory builds with. Pull a book out to see its cover." title="The stacks" />
        <div className="mb-6 flex gap-1">
          <ScrollButton disabled={edges.start} label="Scroll the shelf left" onClick={() => scrollBy(-1)}>
            <IconArrowLeft size={14} />
          </ScrollButton>
          <ScrollButton disabled={edges.end} label="Scroll the shelf right" onClick={() => scrollBy(1)}>
            <IconArrowRight size={14} />
          </ScrollButton>
        </div>
      </div>

      {shelves.length === 0 ? (
        <Empty>The shelves are empty. Run the docs sync below to stock them.</Empty>
      ) : (
        <>
          <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pt-8 [contain:inline-size] sm:mx-0 sm:px-0" onScroll={measure} ref={scroller}>
            <div className="flex w-max min-w-full items-end">
              {shelves.map((shelf) => (
                <div key={shelf.label}>
                  <ul aria-label={`${shelf.label} shelf`} className="flex items-end gap-1 pr-6">
                    {shelf.books.map((doc) => (
                      <ShelfBook
                        cloth={bindings.get(doc.library)!}
                        dimmed={!matches(query, doc.library)}
                        doc={doc}
                        key={doc.library}
                        onHover={(on) => setHovered(on ? doc.library : null)}
                        onToggle={() => toggle(doc.library)}
                        onTurned={measure}
                        pulled={doc.library === pulled}
                      />
                    ))}
                  </ul>
                  <Board />
                  <p className="mt-2 flex h-4 items-center gap-1.5 pr-6 text-[11px] whitespace-nowrap text-ds-fg-ter">
                    <ShelfIcon shelf={shelf.label} size={12} />
                    {shelf.label}
                  </p>
                </div>
              ))}
              <div className="flex-1">
                <Board />
                <div className="mt-2 h-4" />
              </div>
            </div>
          </div>

          <div aria-live="polite" className="mt-6 flex h-8 items-center justify-center gap-4 text-sm">
            {captioned && (
              <p className="shelf-caption flex items-baseline gap-2" key={captioned.library}>
                <span className="text-[11px] text-ds-fg-ter tabular-nums">{books.indexOf(captioned) + 1}</span>
                <span className="font-serif text-xl text-ds-fg">{splitName(captioned.library).title}</span>
                <span className="text-xs text-ds-fg-sec">
                  {captioned.sections.toLocaleString()} sections
                  {splitName(captioned.library).version && ` · v${splitName(captioned.library).version}`}
                </span>
              </p>
            )}
            {pulled && captioned?.library === pulled && (
              <button className="text-xs text-ds-fg-sec transition-colors hover:text-ds-fg" onClick={() => setPulled(null)} type="button">
                Put back
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Board() {
  return <div aria-hidden="true" className="relative z-10 h-[3px] bg-ds-line-strong shadow-[0_8px_12px_-6px_#00000040]" />;
}

/**
 * A book in 3D: its spine faces out on the shelf, its cover hinged to the spine's right edge
 * running back into the shelf. Pulling it out turns the book on the spine's left edge.
 */
function ShelfBook({
  cloth,
  dimmed,
  doc,
  onHover,
  onToggle,
  onTurned,
  pulled,
}: {
  cloth: Binding;
  dimmed: boolean;
  doc: Doc;
  onHover: (on: boolean) => void;
  onToggle: () => void;
  onTurned: () => void;
  pulled: boolean;
}) {
  const { title, version } = splitName(doc.library);
  const { height, width } = spineSize(doc.sections);
  const ref = useRef<HTMLLIElement>(null);

  return (
    <li
      className={cn("shelf-book", dimmed && "opacity-25")}
      data-pulled={pulled || undefined}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onTransitionEnd={(event) => {
        if (event.target !== ref.current || event.propertyName !== "width") return;
        onTurned();
        if (pulled)
          ref.current.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
          });
      }}
      ref={ref}
      style={
        {
          "--c": `${height * 0.72}rem`,
          "--h": `${height}rem`,
          "--s": `${width}rem`,
        } as CSSProperties
      }
    >
      <button
        aria-label={`${doc.library}, ${doc.sections} sections`}
        aria-pressed={pulled}
        className="book-lift focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ds-fg"
        onBlur={() => onHover(false)}
        onClick={onToggle}
        onFocus={() => onHover(true)}
        title={`${doc.library} · ${doc.sections.toLocaleString()} sections`}
        type="button"
      >
        <span aria-hidden="true" className="book-top" style={clothStyle(cloth)} />
        <span aria-hidden="true" className="book">
          <span className="book-spine cloth cloth-spine" style={clothStyle(cloth)}>
            <span className="text-sm font-semibold tracking-[-0.02em] whitespace-nowrap cloth-text [writing-mode:vertical-rl]">{title}</span>
            <span className="font-serif text-xs italic cloth-text">{version ?? "§"}</span>
          </span>
          <span className="book-cover">
            <CoverFace cloth={cloth} compact doc={doc} />
          </span>
        </span>
      </button>
    </li>
  );
}

function ScrollButton({ children, disabled, label, onClick }: { children: ReactNode; disabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="grid size-8 place-items-center rounded-full border border-ds-line text-ds-fg-sec transition-colors hover:border-ds-line-strong hover:text-ds-fg disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SectionHeader({ note, title }: { note: string; title: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-medium tracking-tight text-ds-fg">{title}</h2>
      <p className="mt-1 max-w-2xl text-xs text-ds-fg-sec">{note}</p>
    </div>
  );
}

/** A reference module as a Finder folder, tinted in its cloth. */
function Folder({ cloth, meta, name, shelf }: { cloth: Binding; meta: string; name: string; shelf: string }) {
  return (
    <article className="folder h-full" style={clothStyle(cloth)}>
      <span aria-hidden="true" className="folder-back" />
      <span aria-hidden="true" className="folder-paper" />
      <div className="cloth folder-front min-w-0 px-5 pt-24 pb-4">
        <header className="flex items-center gap-2">
          <ShelfIcon className="shrink-0" shelf={shelf} size={18} style={{ filter: "drop-shadow(var(--cloth-emboss))" }} />
          {/* The slug stays on hover: it's the name agents copy the module by. */}
          <h3 className="min-w-0 flex-1 truncate font-serif text-lg cloth-text" title={name}>
            {moduleTitle(name)}
          </h3>
        </header>
        {meta && <p className="mt-0.5 truncate pl-[26px] text-xs opacity-75">{meta}</p>}
      </div>
    </article>
  );
}

function Card({ aside, children, meta, title }: { aside: string; children: ReactNode; meta: string; title: string }) {
  return (
    <article className="flex h-full overflow-hidden rounded-xl border border-ds-line bg-white/70 dark:bg-ds-card">
      <div className="min-w-0 flex-1 p-5">
        <header className="flex items-baseline justify-between gap-3">
          <h3 className="truncate font-serif text-lg text-ds-fg" title={title}>
            {title}
          </h3>
          <span className="shrink-0 font-mono text-[11px] text-ds-fg-ter">{aside}</span>
        </header>
        {meta && <p className="mt-0.5 truncate text-xs text-ds-fg-ter">{meta}</p>}
        <p className="mt-3 line-clamp-4 text-sm break-words text-ds-fg">{children}</p>
      </div>
    </article>
  );
}

function SomethingMissing() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(SYNC_DOCS_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="mt-24 grid gap-8 border-t border-ds-line pt-10 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-end">
      <div>
        <h2 className="font-serif text-3xl text-ds-fg">Something missing?</h2>
        <p className="mt-2 max-w-sm text-sm text-ds-fg-sec">
          Pin a library in the docs sync script and stock the shelves. The factory indexes it on its next start.
        </p>
      </div>
      <div>
        <div className="flex items-center gap-3 border-b border-ds-line-strong pb-3">
          <code className="min-w-0 flex-1 truncate font-mono text-sm text-ds-fg" title={SYNC_DOCS_COMMAND}>
            {SYNC_DOCS_COMMAND}
          </code>
          <button
            aria-label={copied ? "Copied" : "Copy command"}
            className="grid size-8 shrink-0 place-items-center rounded-full text-ds-fg-sec transition-colors hover:bg-ds-hover hover:text-ds-fg active:scale-95"
            onClick={copy}
            type="button"
          >
            {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
          </button>
        </div>
        <p className="mt-4 text-xs text-ds-fg-ter">
          Add library names to sync only those, e.g. <code className="font-mono">vite@6 vitest@3</code>
        </p>
      </div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-ds-line-strong p-6 text-center font-serif text-base text-ds-fg-sec italic">{children}</p>
  );
}
