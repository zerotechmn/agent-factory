import { describe, expect, test } from "bun:test";

import { summarizeUiFailures, uiScreensFrom } from "./pipeline.ui-check";

describe("uiScreensFrom", () => {
  test("uses the developer's reachable screens and drops ones with no URL", () => {
    const dev = {
      screens: [
        { note: "", path: "/#/cars/1", screenId: "S-05" },
        { note: "needs an upload in progress", path: null, screenId: "S-07" },
        { note: "", path: "relative/no-slash", screenId: "S-08" },
      ],
    };
    expect(uiScreensFrom(dev)).toEqual([{ note: "", path: "/#/cars/1", screenId: "S-05" }] as never);
  });

  test("falls back to the home page when there is no screen map", () => {
    expect(uiScreensFrom(undefined)).toEqual([{ path: "/", screenId: "home" }]);
    expect(uiScreensFrom({ screens: [] })).toEqual([{ path: "/", screenId: "home" }]);
  });
});

describe("summarizeUiFailures", () => {
  test("lists failures per screen and viewport, skipping clean pages", () => {
    const text = summarizeUiFailures({
      pages: [
        {
          failures: [{ detail: 'Word "Viewing" is split across 2 lines', kind: "broken-word", selector: "header > label" }],
          path: "/#/",
          screenId: "S-01",
          screenshot: "S-01-desktop.png",
          viewport: "desktop",
          warnings: [],
        },
        { failures: [], path: "/#/", screenId: "S-01", screenshot: "S-01-mobile.png", viewport: "mobile", warnings: [] },
      ],
      skipped: null,
    });
    expect(text).toBe('S-01 /#/ @ desktop:\n  - [broken-word] Word "Viewing" is split across 2 lines (header > label)');
  });
});
