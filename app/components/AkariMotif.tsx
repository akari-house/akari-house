type Motif = "blossom" | "invitation" | "lantern" | "nameplate" | "thread";

export function AkariMotif({
  motif,
  className = "",
  label,
}: {
  motif: Motif;
  className?: string;
  label?: string;
}) {
  const accessibility = label
    ? { role: "img", "aria-label": label }
    : { "aria-hidden": true as const };

  if (motif === "blossom") {
    return (
      <svg
        {...accessibility}
        className={`akari-motif ${className}`}
        viewBox="0 0 64 64"
      >
        <path d="M32 31C15 27 13 11 22 7c7-3 11 6 10 17C31 13 37 4 44 8c9 5 6 20-10 23 16-1 25 10 19 17-5 7-17 1-21-13 1 15-10 23-17 17-8-6 1-19 17-21Z" />
        <circle cx="32" cy="32" r="5" />
      </svg>
    );
  }

  if (motif === "lantern") {
    return (
      <svg
        {...accessibility}
        className={`akari-motif ${className}`}
        viewBox="0 0 64 64"
      >
        <path d="M23 10h18M20 18c8-5 16-5 24 0l-2 31c-7 5-13 5-20 0l-2-31Z" />
        <path d="M24 25h16M23 40h18M32 18v31M28 55h8" />
      </svg>
    );
  }

  if (motif === "invitation") {
    return (
      <svg
        {...accessibility}
        className={`akari-motif ${className}`}
        viewBox="0 0 64 64"
      >
        <path d="M10 18h44v33H10z" />
        <path d="m11 20 21 17 21-17M11 49l15-17M53 49 38 32" />
        <path d="M27 12c2-4 8-4 10 0-2 3-8 3-10 0Z" />
      </svg>
    );
  }

  if (motif === "nameplate") {
    return (
      <svg
        {...accessibility}
        className={`akari-motif ${className}`}
        viewBox="0 0 64 64"
      >
        <path d="M8 17h48v31H8zM14 23h36v19H14z" />
        <path d="M21 33h22M32 27v12" />
      </svg>
    );
  }

  return (
    <svg
      {...accessibility}
      className={`akari-motif ${className}`}
      viewBox="0 0 96 32"
      preserveAspectRatio="none"
    >
      <path d="M2 17c13-22 22 20 36-2S61 28 74 9c8-11 13-5 20 5" />
      <circle cx="38" cy="15" r="3" />
      <circle cx="74" cy="9" r="3" />
    </svg>
  );
}
