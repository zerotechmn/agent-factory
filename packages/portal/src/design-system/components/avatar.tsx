import { cn } from "../lib/cn";
import type { HTMLAttributes } from "react";

export type AvatarSize = "sm" | "md" | "lg";

const sizes: Record<AvatarSize, string> = {
  sm: "size-6 text-[length:var(--ds-text-xs)]",
  md: "size-10 text-[length:var(--ds-text-sm)]",
  lg: "size-12 text-[length:var(--ds-text-base)]",
};

export type AvatarProps = HTMLAttributes<HTMLDivElement> & {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: AvatarSize;
  shape?: "circle" | "square";
};

export function Avatar({
  className,
  src,
  alt = "",
  fallback,
  size = "md",
  shape = "circle",
  ...props
}: AvatarProps) {
  const initials =
    fallback ||
    alt
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    "?";

  return (
    <div
      className={cn(
        "avatar-border-container relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-[var(--ds-card-02)] text-[var(--ds-text-sec)]",
        sizes[size],
        shape === "circle" ? "rounded-full" : "rounded-[var(--ds-radius-xs)]",
        className,
      )}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={!alt || undefined}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <span className="select-none font-medium">{initials}</span>
      )}
    </div>
  );
}

export function AvatarGroup({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center -space-x-2", className)} {...props}>
      {children}
    </div>
  );
}
