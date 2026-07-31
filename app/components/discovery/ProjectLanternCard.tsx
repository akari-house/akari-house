import { Link } from "react-router";
import { ProjectNeedChips } from "~/components/projects/ProjectNeedChips";
import {
  projectHasAnyClosedNeed,
  projectHasAnyOpenNeed,
} from "~/lib/project-need-status";

export type ProjectLantern = {
  slug: string;
  title: string;
  summary: string;
  stage: string;
  seeking: string;
  supportStatus?: string | null;
  founderName: string;
  founderUsername: string;
  followerCount: number;
  logoKey?: string | null;
};

export function ProjectLanternCard({
  project,
  compact = false,
}: {
  project: ProjectLantern;
  compact?: boolean;
}) {
  const hasOpenNeeds = projectHasAnyOpenNeed(
    project.seeking,
    project.supportStatus,
  );
  const hasClosedNeeds = projectHasAnyClosedNeed(
    project.seeking,
    project.supportStatus,
  );

  return (
    <article className={`project-lantern-card${compact ? " is-compact" : ""}`}>
      {project.logoKey ? (
        <div
          className="project-logo-mark"
          style={{
            position: "relative",
            width: compact ? "52px" : "66px",
            height: compact ? "68px" : "84px",
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
            padding: "7px",
            border: "1px solid rgba(255, 209, 102, 0.4)",
            borderRadius: "18px",
            background: "rgba(8, 11, 19, 0.82)",
            boxShadow:
              "inset 0 0 18px rgba(255, 209, 102, 0.09), 0 12px 30px rgba(0, 0, 0, 0.45)",
          }}
        >
          <img
            src={`/media/projects/${project.slug}/logo`}
            alt={`${project.title} logo`}
            loading="lazy"
            decoding="async"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              borderRadius: "12px",
            }}
          />
        </div>
      ) : (
        <div className="project-lantern-mark" aria-hidden="true">
          <span />
        </div>
      )}
      <div className="project-lantern-body">
        <div className="discovery-card-meta">
          <span>{project.stage.replaceAll("_", " ")}</span>
          <span>
            {hasOpenNeeds
              ? "Approved project"
              : "Not currently seeking support"}
          </span>
        </div>
        <h3>
          <Link to={`/projects/${project.slug}`}>{project.title}</Link>
        </h3>
        <p>{project.summary}</p>
        {hasOpenNeeds && (
          <div className="project-lantern-seeking">
            <strong>Looking for</strong>
            <ProjectNeedChips
              value={project.seeking}
              statusValue={project.supportStatus}
              compact
              mode="open"
            />
          </div>
        )}
        {hasClosedNeeds && (
          <div className="project-lantern-seeking is-progress">
            <strong>Progress</strong>
            <ProjectNeedChips
              value={project.seeking}
              statusValue={project.supportStatus}
              compact
              mode="closed"
            />
          </div>
        )}
        <footer>
          <Link to={`/profiles/${project.founderUsername}`}>
            <span className="founder-nameplate" aria-hidden="true">
              {project.founderName.slice(0, 1).toUpperCase()}
            </span>
            {project.founderName}
          </Link>
          <span>{project.followerCount} following</span>
        </footer>
      </div>
    </article>
  );
}
