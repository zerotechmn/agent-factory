import {
  IconArrowDown,
  IconArrowRight,
  IconExternalLink,
  type Icon as TablerIcon,
  type IconProps as TablerIconProps,
} from "@tabler/icons-react";
import { cn } from "../lib/cn";

export type IconSize = "sm" | "md" | "lg";

const sizePx: Record<IconSize, number> = {
  sm: 14,
  md: 16,
  lg: 20,
};

const sizeClass: Record<IconSize, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
};

export type DsIconProps = Omit<TablerIconProps, "size"> & {
  size?: IconSize;
  title?: string;
};

/** Wrap any Tabler icon with design-system size tokens (sm/md/lg). */
export function Icon({
  icon: Comp,
  size = "md",
  className,
  title,
  stroke = 1.75,
  ...props
}: DsIconProps & { icon: TablerIcon }) {
  return (
    <Comp
      size={sizePx[size]}
      stroke={stroke}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      className={cn("shrink-0 text-current", sizeClass[size], className)}
      {...props}
    />
  );
}

export function ArrowDownIcon(props: DsIconProps) {
  return <Icon icon={IconArrowDown} {...props} />;
}

export function ArrowRightIcon(props: DsIconProps) {
  return <Icon icon={IconArrowRight} {...props} />;
}

export function ExternalLinkIcon(props: DsIconProps) {
  return <Icon icon={IconExternalLink} {...props} />;
}
