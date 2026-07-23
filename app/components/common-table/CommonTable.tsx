import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { Role } from "~/lib/domain";
import { workspaceData } from "~/data/house";

const roles: Role[] = ["founder", "creator", "investor"];
const columns = [
  "Project",
  "Sector",
  "Stage",
  "Region",
  "Opportunity",
  "Match reason",
  "Deadline",
  "Status",
];

export function CommonTable({ compact = false }: { compact?: boolean }) {
  const [role, setRole] = useState<Role>("founder");
  const data = workspaceData[role];

  function selectAdjacent(current: Role, direction: number) {
    const next =
      roles[(roles.indexOf(current) + direction + roles.length) % roles.length];
    setRole(next);
    document.getElementById(`workspace-${next}`)?.focus();
  }

  function handleTabKey(event: KeyboardEvent, item: Role) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      setRole(roles[0]);
      document.getElementById(`workspace-${roles[0]}`)?.focus();
      return;
    }
    if (event.key === "End") {
      const last = roles[roles.length - 1];
      setRole(last);
      document.getElementById(`workspace-${last}`)?.focus();
      return;
    }
    selectAdjacent(item, event.key === "ArrowRight" ? 1 : -1);
  }

  return (
    <div className={`product-demo${compact ? " product-demo-compact" : ""}`}>
      {!compact && (
        <div className="table-threshold">
          <span>Inside the House</span>
          <strong>A seat changes with your role.</strong>
          <p>
            Choose a seat to see the work, context and opportunities it brings
            into focus.
          </p>
        </div>
      )}
      <div className="product-bar">
        <span className="product-brand">
          <img
            src="/assets/optimized/akari-mark.webp"
            alt=""
            width={160}
            height={150}
          />{" "}
          AKARI
        </span>
        <span className="product-person">{data.person}</span>
      </div>
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="AKARI workspaces"
      >
        {roles.map((item) => (
          <button
            id={`workspace-${item}`}
            key={item}
            role="tab"
            aria-selected={role === item}
            aria-controls={`workspace-panel-${item}`}
            tabIndex={role === item ? 0 : -1}
            onClick={() => setRole(item)}
            onKeyDown={(event) => handleTabKey(event, item)}
          >
            {workspaceData[item].label}
          </button>
        ))}
      </div>
      <div className="product-body">
        <nav aria-label="Workspace navigation">
          {["Overview", "Profile", "Roles", "Visibility"].map((item, index) => (
            <span className={index === 0 ? "active" : ""} key={item}>
              {item}
            </span>
          ))}
        </nav>
        {roles.map((panelRole) => {
          const panel = workspaceData[panelRole];
          return (
            <section
              id={`workspace-panel-${panelRole}`}
              role="tabpanel"
              aria-labelledby={`workspace-${panelRole}`}
              hidden={role !== panelRole}
              key={panelRole}
            >
              <span className="status-pill">
                Foundation preview · Sample data
              </span>
              <p className="workspace-role-change" aria-live="polite">
                Your {panelRole} seat brings different work into focus while
                keeping the same AKARI identity.
              </p>
              <h3>{panel.heading}</h3>
              <div className="workspace-stats">
                {panel.stats.map(([label, value]) => (
                  <div key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div
                className="opportunity-table"
                role="table"
                aria-label={`${panel.label} opportunity`}
              >
                {columns.map((column, index) => (
                  <div role="row" key={column}>
                    <span role="columnheader">{column}</span>
                    <strong role="cell">{panel.opportunity[index]}</strong>
                  </div>
                ))}
              </div>
              <a className="button button-quiet" href="#membership">
                See what membership unlocks
              </a>
            </section>
          );
        })}
      </div>
    </div>
  );
}
