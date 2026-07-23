import { Link } from "react-router";

export type ProjectLantern = {
  slug: string;
  title: string;
  summary: string;
  stage: string;
  seeking: string;
  founderName: string;
  founderUsername: string;
  followerCount: number;
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
      <div className="project-lantern-mark" aria-hidden="true">
        <span />
      </div>
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
          <p className="project-lantern-seeking">
            <strong>Looking for</strong>
            <span>{project.seeking}</span>
          </p>
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
