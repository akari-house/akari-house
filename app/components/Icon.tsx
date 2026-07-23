import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "close"
  | "external"
  | "menu"
  | "sparkle";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
};

const paths: Record<IconName, ReactNode> = {
  "arrow-left": <path d="m13.5 5-7 7 7 7M7 12h11" />,
  "arrow-right": <path d="m10.5 5 7 7-7 7M17 12H6" />,
  check: <path d="m5 12.5 4.25 4.25L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  external: (
    <path d="M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  ),
  menu: <path d="M5 7h14M5 12h14M5 17h14" />,
  sparkle: (
    <path d="M12 3c.8 4.8 3.2 7.2 8 8-4.8.8-7.2 3.2-8 8-.8-4.8-3.2-7.2-8-8 4.8-.8 7.2-3.2 8-8Z" />
  ),
};

export function Icon({ name, className = "", ...props }: IconProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      className={`icon icon-${name}${className ? ` ${className}` : ""}`}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}
