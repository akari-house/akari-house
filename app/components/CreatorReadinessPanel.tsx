import { Link } from "react-router";
import { isXProfileUrl } from "~/lib/validation";

type CreatorSocialAccount = {
  platform: string;
  profileUrl: string;
  followerCount: number | null;
};

type CreatorReputationSignals = {
  xScore: number | null;
  xScoreSource: string;
  sorsaScore: number | null;
  sorsaSource: string;
};

type CreatorReadinessPanelProps = {
  socialAccounts: CreatorSocialAccount[];
  reputationSignals: CreatorReputationSignals;
  accessTier: string;
};

export function CreatorReadinessPanel({
  socialAccounts,
  reputationSignals,
  accessTier,
}: CreatorReadinessPanelProps) {
  const xAccount = socialAccounts.find((account) => account.platform === "x");
  const checks = [
    {
      label: "Primary X profile",
      detail: "A valid X profile identifies you for campaign applications.",
      complete: Boolean(
        xAccount?.profileUrl && isXProfileUrl(xAccount.profileUrl),
      ),
      href: "#social-links",
    },
    {
      label: "X follower count",
      detail: "A recorded follower count is required; zero is a valid value.",
      complete:
        xAccount?.followerCount !== null &&
        xAccount?.followerCount !== undefined,
      href: "#social-links",
    },
    {
      label: "XScore",
      detail: "Your current XScore must be present and available.",
      complete:
        reputationSignals.xScore !== null &&
        reputationSignals.xScoreSource !== "unavailable",
      href: "#creator-readiness",
    },
    {
      label: "Sorsa score",
      detail: "Your current Sorsa score must be present and available.",
      complete:
        reputationSignals.sorsaScore !== null &&
        reputationSignals.sorsaSource !== "unavailable",
      href: "#creator-readiness",
    },
  ];
  const completed = checks.filter((check) => check.complete).length;
  const percent = Math.round((completed / checks.length) * 100);
  const ready = completed === checks.length;

  return (
    <section
      className={`creator-readiness-overview ${ready ? "is-ready" : "needs-data"}`}
      aria-labelledby="creator-readiness-title"
    >
      <div className="creator-readiness-heading">
        <div>
          <span className="chapter">Creator campaign readiness</span>
          <h2 id="creator-readiness-title">
            {ready
              ? "You are campaign-ready."
              : "Complete your campaign profile."}
          </h2>
          <p>
            Campaign eligibility is based on Creator profile data, not AKARI
            membership approval. There is no minimum follower threshold.
          </p>
        </div>
        <div
          className="creator-readiness-score"
          aria-label={`${percent}% ready`}
        >
          <strong>{percent}%</strong>
          <span>{completed}/4 signals</span>
        </div>
      </div>

      <div
        className="creator-readiness-track"
        role="progressbar"
        aria-label="Creator campaign readiness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="creator-readiness-checks">
        {checks.map((check) => (
          <a
            key={check.label}
            className={check.complete ? "is-complete" : "is-missing"}
            href={check.href}
          >
            <span aria-hidden="true">{check.complete ? "✓" : "○"}</span>
            <span>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </span>
          </a>
        ))}
      </div>

      <div className="creator-readiness-actions">
        {ready ? (
          <Link className="button button-primary" to="/campaigns">
            Explore campaigns
          </Link>
        ) : (
          <a className="button button-primary" href="#creator-readiness">
            Complete Creator data
          </a>
        )}
        <span className="status-pill">
          {accessTier === "member"
            ? "Membership approved"
            : "Membership review separate"}
        </span>
      </div>
    </section>
  );
}
