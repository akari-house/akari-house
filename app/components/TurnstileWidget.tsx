import { useEffect, useRef, useState } from "react";

type TurnstileOptions = {
  sitekey: string;
  action: string;
  theme: "dark" | "light" | "auto";
  size: "normal" | "flexible" | "compact";
  retry: "auto" | "never";
  "refresh-expired": "auto" | "manual" | "never";
  callback: () => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: TurnstileOptions) => string;
      remove: (widgetId: string) => void;
    };
  }
}

type WidgetState = "loading" | "ready" | "verified" | "error";

function ensureTurnstilePreconnect() {
  if (document.querySelector('link[data-akari-turnstile-preconnect="true"]'))
    return;
  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = "https://challenges.cloudflare.com";
  link.dataset.akariTurnstilePreconnect = "true";
  document.head.appendChild(link);
}

export function TurnstileWidget({
  siteKey,
  action,
}: {
  siteKey?: string;
  action: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<WidgetState>("loading");

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let widgetId: string | undefined;
    let cancelled = false;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;

    ensureTurnstilePreconnect();

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (loadTimer) clearTimeout(loadTimer);
      setState("ready");
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: "dark",
        size: window.matchMedia("(max-width: 360px)").matches
          ? "compact"
          : "flexible",
        retry: "auto",
        "refresh-expired": "auto",
        callback: () => setState("verified"),
        "error-callback": () => setState("error"),
        "expired-callback": () => setState("loading"),
        "timeout-callback": () => setState("loading"),
      });
    };
    const onScriptError = () => {
      if (!cancelled) setState("error");
    };
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-akari-turnstile]",
    );

    setState("loading");
    loadTimer = setTimeout(() => {
      if (!cancelled && !window.turnstile) setState("error");
    }, 12_000);

    if (window.turnstile) render();
    else if (existing) {
      existing.addEventListener("load", render, { once: true });
      existing.addEventListener("error", onScriptError, { once: true });
    } else {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.akariTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", onScriptError, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (loadTimer) clearTimeout(loadTimer);
      existing?.removeEventListener("load", render);
      existing?.removeEventListener("error", onScriptError);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, siteKey]);

  if (!siteKey) return null;
  const status =
    state === "verified"
      ? "Security check complete."
      : state === "ready"
        ? "Security check ready."
        : state === "error"
          ? "Security check could not load. Check your connection and reload this page."
          : "Loading security check.";

  return (
    <div className="turnstile-shell" data-turnstile-state={state}>
      <div className="turnstile-slot" ref={containerRef} />
      <p className="turnstile-status" aria-live="polite" role="status">
        {status}
      </p>
    </div>
  );
}
