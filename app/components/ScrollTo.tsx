import type { ReactNode } from "react";

export function ScrollTo({
  targetId,
  className,
  children,
  ariaLabel,
}: {
  targetId: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={() =>
        document.getElementById(targetId)?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        })
      }
    >
      {children}
    </button>
  );
}
