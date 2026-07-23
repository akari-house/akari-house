import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const steps = [
  ["Entrance", "Create one trusted identity"],
  ["Strategy Room", "Name the support you need"],
  ["Network Terrace", "Discover relevant people"],
  ["Common Table", "Collaborate with context"],
  ["Launch Deck", "Turn relationships into evidence"],
] as const;

export function BlossomJourney() {
  const listRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const items = Array.from(listRef.current?.children ?? []);
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (current) setActive(items.indexOf(current.target));
      },
      { rootMargin: "-38% 0px -38% 0px", threshold: [0.2, 0.6] },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <ol
      className="blossom-trail"
      ref={listRef}
      style={{ "--journey-step": active } as CSSProperties}
    >
      {steps.map(([title, copy], index) => (
        <li
          key={title}
          className={`${index === active ? "is-active " : ""}${index < active ? "is-complete" : ""}`}
        >
          <span aria-hidden="true">{index + 1}</span>
          <div>
            <strong>{title}</strong>
            <small>{copy}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}
