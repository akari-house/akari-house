import { useEffect, useState } from "react";

const petals = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  depth: index % 7 === 0 ? "front" : index % 3 === 0 ? "back" : "mid",
  shape: index % 5 === 0 ? "maple" : "sakura",
}));

export function PetalField() {
  const [paused, setPaused] = useState(false);
  const [density, setDensity] = useState(petals.length);

  useEffect(() => {
    const update = () =>
      setPaused(
        document.hidden ||
          window.scrollY > Math.max(window.innerHeight * 5.5, 3200),
      );
    const densityTimer = window.setTimeout(() => {
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
        setDensity(18);
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
          className={`petal petal-${petal.depth} petal-${petal.shape}`}
          key={petal.id}
          style={
            {
              "--petal-index": petal.id,
              "--petal-start": `${(petal.id * 37 + 11) % 100}%`,
              "--petal-drift": `${(petal.id % 2 ? 1 : -1) * (12 + ((petal.id * 7) % 29))}vw`,
              "--petal-end": `${(petal.id % 3 ? 1 : -1) * (6 + ((petal.id * 11) % 22))}vw`,
              "--petal-duration": `${9 + ((petal.id * 1.7) % 13)}s`,
              "--petal-delay": `${-((petal.id * 2.3) % 19)}s`,
              "--petal-turn": `${260 + ((petal.id * 47) % 360)}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
