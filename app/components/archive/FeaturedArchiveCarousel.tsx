import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { caseStudies } from "~/data/case-studies";

export function FeaturedArchiveCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);

  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(caseStudies.length - 1, index));
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    slideRefs.current[next]?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
    setActive(next);
    setHasInteracted(true);
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const center =
          track.getBoundingClientRect().left + track.clientWidth / 2;
        const distances = slideRefs.current.map((slide) => {
          if (!slide) return Number.POSITIVE_INFINITY;
          const bounds = slide.getBoundingClientRect();
          return Math.abs(bounds.left + bounds.width / 2 - center);
        });
        setActive(distances.indexOf(Math.min(...distances)));
      });
    };
    track.addEventListener("scroll", update, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      track.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <section
      className="featured-archive"
      aria-label="Featured case studies"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveTo(active - 1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveTo(active + 1);
        }
      }}
    >
      <div className="archive-shelf-heading">
        <div>
          <span>The Archive Keeper · Authorized field notes</span>
          <strong>Choose a record</strong>
        </div>
        <p aria-live="polite">
          {hasInteracted
            ? caseStudies[active].title
            : "Five records to explore"}
        </p>
      </div>

      <div className="archive-carousel-track" ref={trackRef} tabIndex={0}>
        {caseStudies.map((study, index) => (
          <article
            className="archive-carousel-slide"
            key={study.slug}
            ref={(element) => {
              slideRefs.current[index] = element;
            }}
            aria-label={`${index + 1} of ${caseStudies.length}: ${study.title}`}
          >
            <img
              src={`/assets/case-studies/thumbs/${study.slug}.webp`}
              alt=""
              width={720}
              height={450}
              loading="lazy"
            />
            <div className="archive-slide-shade" />
            <div className="archive-slide-content">
              <span className="archive-category">{study.category}</span>
              <span className="evidence-seal">
                Evidence dossier · {study.images.length} record
                {study.images.length === 1 ? "" : "s"}
              </span>
              <h3>{study.title}</h3>
              <p>{study.summary}</p>
              <dl>
                {study.metrics.slice(0, 2).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <Link to={`/archive/${study.slug}`}>Open the record</Link>
            </div>
          </article>
        ))}
      </div>

      <div className="archive-carousel-controls">
        <button
          type="button"
          onClick={() => moveTo(active - 1)}
          disabled={active === 0}
          aria-label="Previous case study"
        >
          Previous
        </button>
        <div className="archive-position" aria-hidden="true">
          <strong>{String(active + 1).padStart(2, "0")}</strong>
          <span>/ {String(caseStudies.length).padStart(2, "0")}</span>
        </div>
        <div className="archive-dots" aria-label="Choose a case study">
          {caseStudies.map((study, index) => (
            <button
              type="button"
              key={study.slug}
              aria-label={`Show ${study.title}`}
              aria-pressed={active === index}
              onClick={() => moveTo(index)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => moveTo(active + 1)}
          disabled={active === caseStudies.length - 1}
          aria-label="Next case study"
        >
          Next
        </button>
      </div>
    </section>
  );
}
