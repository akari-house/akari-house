import { useEffect, useRef } from "react";

export function InteractiveArrival() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    let frame = 0;
    let visible = true;

    const updatePointer = (event: PointerEvent) => {
      if (reduceMotion.matches || !finePointer.matches || !visible) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const bounds = scene.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
        const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
        scene.style.setProperty("--hero-x", x.toFixed(3));
        scene.style.setProperty("--hero-y", y.toFixed(3));
      });
    };
    const updateScroll = () => {
      if (reduceMotion.matches || !visible) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const bounds = scene.getBoundingClientRect();
        const progress = Math.min(
          1,
          Math.max(0, -bounds.top / Math.max(1, bounds.height * 0.72)),
        );
        scene.style.setProperty("--hero-scroll", progress.toFixed(3));
      });
    };
    const reset = () => {
      scene.style.setProperty("--hero-x", "0");
      scene.style.setProperty("--hero-y", "0");
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 },
    );

    window.addEventListener("pointermove", updatePointer, { passive: true });
    scene.addEventListener("pointerleave", reset);
    window.addEventListener("scroll", updateScroll, { passive: true });
    observer.observe(scene);
    scene.dataset.interactive = "true";
    updateScroll();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", updatePointer);
      scene.removeEventListener("pointerleave", reset);
      window.removeEventListener("scroll", updateScroll);
      observer.disconnect();
      delete scene.dataset.interactive;
    };
  }, []);

  return (
    <div className="arrival-media" ref={sceneRef}>
      <img
        className="arrival-scene"
        src="/assets/house/arrival-v3.webp"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
      />
      <div className="arrival-sanctuary-light" aria-hidden="true" />
      <div className="arrival-lantern-path" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <a
        className="arrival-crest-hotspot"
        href="#hall"
        aria-label="Enter the Hall through the illuminated crest"
      >
        <span />
      </a>
    </div>
  );
}
