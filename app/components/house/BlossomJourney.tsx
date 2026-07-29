import { Fragment, useState } from "react";

const steps = [
  {
    title: "Entrance",
    verb: "Be known",
    copy: "Create one trusted identity and choose exactly who can see it.",
    outcome: "A profile that carries context without making everything public.",
  },
  {
    title: "Strategy Room",
    verb: "Name the need",
    copy: "Turn a broad ambition into a clear request for support.",
    outcome: "Relevant goals that the House can use to guide introductions.",
  },
  {
    title: "Network Terrace",
    verb: "Find relevance",
    copy: "Discover people through shared intent rather than follower counts.",
    outcome: "A smaller, more useful set of relationships to consider.",
  },
  {
    title: "Common Table",
    verb: "Work together",
    copy: "Bring the right context into a private collaboration space.",
    outcome: "One identity, with the correct workspace for each role.",
  },
  {
    title: "Launch Deck",
    verb: "Leave evidence",
    copy: "Document what changed, what AKARI did and what can be verified.",
    outcome: "Proof that future members can inspect instead of vague claims.",
  },
] as const;

export function BlossomJourney() {
  const [active, setActive] = useState(0);

  function move(next: number) {
    const index = (next + steps.length) % steps.length;
    setActive(index);
    document.getElementById(`journey-step-${index}`)?.focus();
  }

  return (
    <div className="blossom-experience">
      <div className="blossom-branch" role="tablist" aria-label="AKARI journey">
        {steps.map((item, index) => (
          <Fragment key={item.title}>
            <button
              id={`journey-step-${index}`}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-controls={`journey-panel-${index}`}
              tabIndex={index === active ? 0 : -1}
              className={index <= active ? "is-lit" : ""}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                if (
                  !["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                if (event.key === "Home") move(0);
                else if (event.key === "End") move(steps.length - 1);
                else move(active + (event.key === "ArrowRight" ? 1 : -1));
              }}
            >
              <span aria-hidden="true">{index + 1}</span>
              <strong>{item.title}</strong>
            </button>
            {index < steps.length - 1 ? (
              <span
                className={`journey-connector${index < active ? " is-complete" : ""}`}
                aria-hidden="true"
              />
            ) : null}
          </Fragment>
        ))}
      </div>
      {steps.map((item, index) => (
        <section
          id={`journey-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`journey-step-${index}`}
          className="journey-outcome"
          hidden={index !== active}
          key={item.title}
        >
          <span>{item.verb}</span>
          <h3>{item.copy}</h3>
          <p>{item.outcome}</p>
          <small>
            Step {String(index + 1).padStart(2, "0")} of{" "}
            {String(steps.length).padStart(2, "0")}
          </small>
        </section>
      ))}
    </div>
  );
}
