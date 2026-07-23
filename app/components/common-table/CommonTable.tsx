import { useState } from "react";
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
          <img src="/assets/brand/akari-mark.png" alt="" /> AKARI
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
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") selectAdjacent(item, 1);
              if (event.key === "ArrowLeft") selectAdjacent(item, -1);
            }}
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
        <section
          id={`workspace-panel-${role}`}
          role="tabpanel"
          aria-labelledby={`workspace-${role}`}
        >
          <span className="status-pill">Foundation preview · Sample data</span>
          <h3>{data.heading}</h3>
          <div className="workspace-stats">
            {data.stats.map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div
            className="opportunity-table"
            role="table"
            aria-label={`${data.label} opportunity`}
          >
            {columns.map((column, index) => (
              <div role="row" key={column}>
                <span role="columnheader">{column}</span>
                <strong role="cell">{data.opportunity[index]}</strong>
              </div>
            ))}
          </div>
          <button
            className="button button-quiet"
            type="button"
            disabled
            aria-describedby="demo-note"
          >
            Open workspace
          </button>
          <small id="demo-note" className="demo-note">
            Available after membership approval.
          </small>
        </section>
      </div>
    </div>
  );
}
