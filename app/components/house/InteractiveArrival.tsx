import { useEffect, useRef } from "react";

export function InteractiveArrival() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frame = scene.closest<HTMLElement>(".arrival-frame");
    const section = scene.closest<HTMLElement>(".arrival");
    let scrollFrame = 0;
    let visible = true;

    const updateScroll = () => {
      if (reduceMotion.matches || !visible) return;
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        if (!section) return;
        const bounds = section.getBoundingClientRect();
        const travel = section.offsetHeight - window.innerHeight;
        if (travel <= 4) {
          scene.style.setProperty("--hero-scroll", "0");
          frame?.style.setProperty("--hero-progress", "0");
          return;
        }
        const progress = Math.min(1, Math.max(0, -bounds.top / travel));
        scene.style.setProperty("--hero-scroll", progress.toFixed(3));
        frame?.style.setProperty("--hero-progress", progress.toFixed(3));
      });
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 },
    );

    window.addEventListener("scroll", updateScroll, { passive: true });
    observer.observe(scene);
    scene.dataset.interactive = "true";
    updateScroll();
    return () => {
      window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", updateScroll);
      observer.disconnect();
      delete scene.dataset.interactive;
    };
  }, []);

  return (
    <div className="arrival-media" ref={sceneRef}>
      <img
        className="arrival-scene"
        src="/assets/optimized/arrival.webp"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        width={1672}
        height={941}
      />
    </div>
  );
}
