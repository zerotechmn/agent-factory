import { IconArrowUpRight, IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "../../design-system";
import { cn } from "@/lib/utils";

import type { RunStatus } from "../runs.types";
import { CARD_CLASS } from "./run-card";

const COPIED_MS = 1_500;

/** The point of the whole run: the app, one click away. Partial deploys say so. */
export function RunLiveBanner({
  appUrl,
  onStay,
  redirecting,
  status,
}: {
  appUrl: string;
  onStay: () => void;
  redirecting: boolean;
  status: RunStatus;
}) {
  const partial = status === "deployed_partial";
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(appUrl).then(() => setCopied(true));
  };

  return (
    <section className={cn(CARD_CLASS, "p-5", partial ? "border-ds-warning/40" : "border-ds-success/40")}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-medium">{partial ? "Your app is live, with known issues" : "Your app is live"}</h2>
          <a href={appUrl} className="mt-0.5 block break-all text-sm text-ds-fg-sec underline underline-offset-4 transition-colors hover:text-ds-fg">
            {appUrl}
          </a>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            aria-label={copied ? "Link copied" : "Copy link"}
            icon={copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
            onClick={copy}
            size="sm"
            variant="ghost"
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          <a href={appUrl} className={buttonVariants({ size: "sm" })}>
            Open app
            <IconArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
      {redirecting && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-ds-fg-sec">
          Opening your app in a moment.{" "}
          <button type="button" onClick={onStay} className="cursor-pointer text-ds-fg underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ds-accent">
            Stay on this page
          </button>
        </p>
      )}
    </section>
  );
}
