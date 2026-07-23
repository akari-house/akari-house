import { useEffect, useState } from "react";

const chapters = [
  ["arrival", "Arrival"],
  ["hall", "Hall"],
  ["common", "Table"],
  ["journey", "Path"],
  ["archive", "Archive"],
  ["membership", "Membership"],
] as const;

export function StoryProgress() {
  const [active, setActive] = useState("arrival");

  useEffect(() => {
    const sections = chapters
      .map(([id]) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const focusLine = window.innerHeight * 0.32;
        const current = sections
          .map((section) => ({
            id: section.id,
            distance: Math.abs(section.getBoundingClientRect().top - focusLine),
          }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (current) setActive(current.id);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const activeIndex = chapters.findIndex(([id]) => id === active);

  return (
    <nav className="story-progress" aria-label="Journey through AKARI House">
      <span className="story-progress-mobile" aria-live="polite">
        {String(activeIndex + 1).padStart(2, "0")} / 06 ·{" "}
        {chapters[activeIndex]?.[1]}
      </span>
      <ol>
        {chapters.map(([id, label], index) => (
          <li className={id === active ? "is-active" : ""} key={id}>
            <a
              href={`#${id}`}
              aria-current={id === active ? "step" : undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{label}</strong>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
