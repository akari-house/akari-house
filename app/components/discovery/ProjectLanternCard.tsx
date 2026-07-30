import { Link } from "react-router";
import { ProjectNeedChips } from "~/components/projects/ProjectNeedChips";

export type ProjectLantern = {
  slug: string;
  title: string;
  summary: string;
  stage: string;
  seeking: string;
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
  return (
    <article className={`project-lantern-card${compact ? " is-compact" : ""}`}>
      {project.logoKey ? (
        <div className="project-lantern-mark has-project-logo">
          <img
            src={`/media/projects/${project.slug}/logo`}
            alt={`${project.title} logo`}
            loading="lazy"
            decoding="async"
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
          <span>Approved project</span>
        </div>
        <h3>
          <Link to={`/projects/${project.slug}`}>{project.title}</Link>
        </h3>
        <p>{project.summary}</p>
        {project.seeking && (
          <div className="project-lantern-seeking">
            <strong>Looking for</strong>
            <ProjectNeedChips value={project.seeking} compact />
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
