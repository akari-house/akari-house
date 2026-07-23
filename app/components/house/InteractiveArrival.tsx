import { useEffect, useRef } from "react";

export function InteractiveArrival() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    const frame = scene.closest<HTMLElement>(".arrival-frame");
    const section = scene.closest<HTMLElement>(".arrival");
    let pointerFrame = 0;
    let scrollFrame = 0;
    let visible = true;

    const updatePointer = (event: PointerEvent) => {
      if (reduceMotion.matches || !finePointer.matches || !visible) return;
      window.cancelAnimationFrame(pointerFrame);
      pointerFrame = window.requestAnimationFrame(() => {
        const bounds = scene.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
        const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
        scene.style.setProperty("--hero-x", x.toFixed(3));
        scene.style.setProperty("--hero-y", y.toFixed(3));
      });
    };
    const updateScroll = () => {
      if (reduceMotion.matches || !visible) return;
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        if (!section) return;
        const bounds = section.getBoundingClientRect();
        const travel = Math.max(1, section.offsetHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, -bounds.top / travel));
        scene.style.setProperty("--hero-scroll", progress.toFixed(3));
        frame?.style.setProperty("--hero-progress", progress.toFixed(3));
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
      window.cancelAnimationFrame(pointerFrame);
      window.cancelAnimationFrame(scrollFrame);
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
