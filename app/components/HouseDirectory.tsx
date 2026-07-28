import { useId, useState } from "react";
import { Link } from "react-router";
import type {
  HouseDirectoryCategory,
  HouseDirectoryEntry,
} from "~/lib/house-directory";
import { houseDirectoryImageUrl } from "~/lib/house-directory";

const socialLabels = {
  xUrl: "X",
  linkedinUrl: "LinkedIn",
  instagramUrl: "Instagram",
  tiktokUrl: "TikTok",
  youtubeUrl: "YouTube",
  telegramUrl: "Telegram",
} as const;

export function DirectorySocials({ entry }: { entry: HouseDirectoryEntry }) {
  const links = Object.entries(socialLabels).flatMap(([key, label]) => {
    const url = entry[key as keyof typeof socialLabels];
    return typeof url === "string" && url ? [{ url, label }] : [];
  });
  if (!links.length && !entry.websiteUrl) return null;
  return (
    <nav className="directory-socials" aria-label={`${entry.name} links`}>
      {links.map(({ url, label }) => (
        <a key={label} href={url} target="_blank" rel="noreferrer">
          <span aria-hidden="true">{label === "X" ? "𝕏" : label[0]}</span>
          <span className="sr-only">{label}</span>
        </a>
      ))}
      {entry.websiteUrl && (
        <a href={entry.websiteUrl} target="_blank" rel="noreferrer">
          <span aria-hidden="true">↗</span>
          <span className="sr-only">Website</span>
        </a>
      )}
    </nav>
  );
}

export function PeopleCard({ entry }: { entry: HouseDirectoryEntry }) {
  const biographyId = useId();
  const [biographyExpanded, setBiographyExpanded] = useState(false);
  const hasLongBiography = Boolean(
    entry.biography && entry.biography.length > 110,
  );

  return (
    <article className="people-card">
      <div className="people-card__portrait">
        {entry.imageKey ? (
          <img
            className="people-card__image"
            src={houseDirectoryImageUrl(entry)}
            alt=""
            width={640}
            height={640}
            loading="lazy"
          />
        ) : (
          <img
            className="people-card__flower"
            src="/assets/optimized/akari-mark.webp"
            alt=""
            width={160}
            height={150}
            loading="lazy"
          />
        )}
        <span className="people-card__petal" aria-hidden="true" />
      </div>
      <div className="people-card__copy">
        <h3>{entry.name}</h3>
        {entry.title && <p className="people-card__title">{entry.title}</p>}
        {entry.biography && (
          <>
            <p
              className={
                biographyExpanded
                  ? "people-card__biography is-expanded"
                  : "people-card__biography"
              }
              id={biographyId}
            >
              {entry.biography}
            </p>
            {hasLongBiography && (
              <button
                className="people-card__bio-toggle"
                type="button"
                aria-controls={biographyId}
                aria-expanded={biographyExpanded}
                onClick={() => setBiographyExpanded((current) => !current)}
              >
                {biographyExpanded ? "Show less" : "Read more"}
              </button>
            )}
          </>
        )}
        <DirectorySocials entry={entry} />
      </div>
    </article>
  );
}

export function PartnerStrip({
  entries,
  eyebrow = "The wider House",
}: {
  entries: HouseDirectoryEntry[];
  eyebrow?: string;
}) {
  const groups: {
    category: HouseDirectoryCategory;
    label: string;
  }[] = [
    { category: "partner", label: "Partners" },
    { category: "provider", label: "Value-Added & Solution Providers" },
  ];
  if (!entries.length) return null;
  return (
    <section
      className="partner-house chapter-section"
      aria-labelledby="partners-title"
    >
      <div className="section-intro">
        <div>
          <span className="chapter">{eyebrow}</span>
          <h2 id="partners-title">Built with trusted partners.</h2>
        </div>
        <p>
          Organizations and specialist providers who add practical value to the
          AKARI network.
        </p>
      </div>
      {groups.map(({ category, label }) => {
        const group = entries.filter((entry) => entry.category === category);
        if (!group.length) return null;
        return (
          <div className="partner-house__group" key={category}>
            <h3>{label}</h3>
            <div className="partner-house__grid">
              {group.map((entry) => (
                <article className="partner-mark" key={entry.id}>
                  {entry.imageKey ? (
                    <img
                      src={houseDirectoryImageUrl(entry)}
                      alt=""
                      width={220}
                      height={100}
                      loading="lazy"
                    />
                  ) : (
                    <span className="partner-mark__fallback" aria-hidden="true">
                      {entry.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <strong>{entry.name}</strong>
                </article>
              ))}
            </div>
          </div>
        );
      })}
      <Link className="quiet-link" to="/team">
        Meet the people and organizations behind AKARI →
      </Link>
    </section>
  );
}
