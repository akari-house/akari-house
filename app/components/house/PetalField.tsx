import { useEffect, useState } from "react";

const petals = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  depth: index % 7 === 0 ? "front" : index % 3 === 0 ? "back" : "mid",
}));

export function PetalField() {
  const [paused, setPaused] = useState(false);
  const [density, setDensity] = useState(petals.length);

  useEffect(() => {
    const update = () =>
      setPaused(
        document.hidden ||
          window.scrollY > Math.max(window.innerHeight * 1.75, 1200),
      );
    const densityTimer = window.setTimeout(() => {
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
        setDensity(10);
      }
    }, 0);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      window.clearTimeout(densityTimer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      className={`petal-field${paused ? " is-paused" : ""}`}
      aria-hidden="true"
    >
      {petals.slice(0, density).map((petal) => (
        <i
          className={`petal petal-${petal.depth}`}
          key={petal.id}
          style={{ "--petal-index": petal.id } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
