import { useCallback, useEffect, useRef, useState } from "react";

/** How close to the end still counts as "at the bottom", so a pixel of rounding doesn't unstick it. */
const NEAR_BOTTOM_PX = 48;

/**
 * Keeps a scroll container pinned to its end while its content grows (a streaming
 * answer), until the reader scrolls up; then it leaves them where they are.
 * `scrollRef` goes on the scrolling element, `contentRef` on the element that grows.
 */
export function useStickToBottom<Scroll extends HTMLElement, Content extends HTMLElement>() {
  const scrollRef = useRef<Scroll>(null);
  const contentRef = useRef<Content>(null);
  const stuck = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    const update = (value: boolean) => {
      stuck.current = value;
      setAtBottom(value);
    };
    const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= NEAR_BOTTOM_PX;
    const onScroll = () => update(nearBottom());
    // A scroll event can't tell the reader from our own follow-scroll; an upward wheel or drag can, so let go at once.
    // Only when there is somewhere to scroll; otherwise nothing would ever re-stick it.
    const scrollable = () => scroller.scrollHeight > scroller.clientHeight;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && scrollable()) update(false);
    };
    const onTouchMove = () => {
      if (scrollable()) update(false);
    };
    // Content or viewport changed size: follow if stuck; otherwise re-check, since content that
    // shrank (or a taller window) can leave the reader at the end without any scroll event.
    const follow = new ResizeObserver(() => {
      if (stuck.current) scroller.scrollTop = scroller.scrollHeight;
      else if (nearBottom()) update(true);
    });

    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("wheel", onWheel, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: true });
    follow.observe(content);
    follow.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchmove", onTouchMove);
      follow.disconnect();
    };
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    stuck.current = true;
    setAtBottom(true);
    scroller.scrollTo({ behavior, top: scroller.scrollHeight });
  }, []);

  return { atBottom, contentRef, scrollRef, scrollToBottom };
}
