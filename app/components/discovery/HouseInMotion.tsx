import { Link } from "react-router";
import type { CaseStudy } from "~/data/case-studies";
import {
  EventInvitationCard,
  type EventInvitation,
} from "./EventInvitationCard";
import { ProjectLanternCard, type ProjectLantern } from "./ProjectLanternCard";

export function HouseInMotion({
  project,
  event,
  caseStudy,
}: {
  project: ProjectLantern | null;
  event: EventInvitation | null;
  caseStudy: CaseStudy;
}) {
  return (
    <div className="house-in-motion">
      <div className="house-motion-wing">
        <header>
          <span>Project lanterns</span>
          <Link to="/projects">Explore projects</Link>
        </header>
        {project ? (
          <ProjectLanternCard project={project} compact />
        ) : (
          <div className="discovery-empty is-project">
            <span className="empty-lantern" aria-hidden="true" />
            <div>
              <strong>The first lanterns are being prepared.</strong>
              <p>Approved Founder projects will appear in this gallery.</p>
            </div>
          </div>
        )}
      </div>

      <div className="house-motion-wing">
        <header>
          <span>Upcoming gatherings</span>
          <Link to="/events">Open the calendar</Link>
        </header>
        {event ? (
          <EventInvitationCard event={event} compact />
        ) : (
          <div className="discovery-empty is-event">
            <span className="empty-date-seal" aria-hidden="true" />
            <div>
              <strong>The next gathering is taking shape.</strong>
              <p>Approved online and in-person events will appear here.</p>
            </div>
          </div>
        )}
      </div>

      <Link className="house-motion-proof" to={`/archive/${caseStudy.slug}`}>
        <span>From the Archive</span>
        <strong>{caseStudy.title}</strong>
        <small>
          {caseStudy.metrics[0][1]} {caseStudy.metrics[0][0].toLowerCase()} ·
          View the authorized record
        </small>
      </Link>
    </div>
  );
}
