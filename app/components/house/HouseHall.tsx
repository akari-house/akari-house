import { useState } from "react";
import { Link } from "react-router";
import { Icon } from "~/components/Icon";
import { rooms } from "~/data/house";

export function HouseHall() {
  const [activeRoom, setActiveRoom] = useState(rooms[0].role);
  const room = rooms.find((item) => item.role === activeRoom) ?? rooms[0];

  return (
    <section
      className="hall-section chapter-section story-chapter"
      id="hall"
      aria-labelledby="hall-title"
    >
      <div className="section-intro">
        <div>
          <span className="chapter">Chapter 02 · The Hall</span>
          <h2 id="hall-title">Your paths. One House.</h2>
        </div>
        <p>
          The courtyard is the heart of AKARI. Choose a room, understand its
          purpose, then return to the shared table.
        </p>
      </div>
      <div className="hall-stage" data-active-room={activeRoom}>
        <img
          src="/assets/house/hall-v2.webp"
          alt="An anime night view of three pavilions surrounding AKARI's glowing sakura courtyard."
          loading="lazy"
          width={1792}
          height={1024}
        />
        <div
          className="hall-room-list"
          aria-label="Choose a room in AKARI House"
        >
          {rooms.map((room) => (
            <button
              type="button"
              id={`hall-room-${room.role}`}
              className={`hall-room hall-room-${room.role}${activeRoom === room.role ? " is-active" : ""}`}
              key={room.role}
              aria-pressed={activeRoom === room.role}
              aria-label={`Preview ${room.title}`}
              onClick={() => setActiveRoom(room.role)}
            >
              <span className="hall-room-pulse" aria-hidden="true" />
              <span className="hall-room-kicker">{room.number}</span>
              <span className="sr-only">{room.title}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="hall-compass">
        <div
          className="hall-compass-tabs"
          role="tablist"
          aria-label="Explore AKARI rooms"
        >
          {rooms.map((room) => (
            <button
              type="button"
              key={room.role}
              role="tab"
              aria-selected={activeRoom === room.role}
              aria-controls="hall-room-detail"
              className={activeRoom === room.role ? "is-active" : undefined}
              onClick={() => setActiveRoom(room.role)}
            >
              <span>{room.number}</span>
              {room.title}
            </button>
          ))}
        </div>
        <div
          className="hall-compass-detail"
          id="hall-room-detail"
          role="tabpanel"
          aria-live="polite"
        >
          <div>
            <span>{room.audience}</span>
            <h3>{room.title}</h3>
            <p>{room.summary}</p>
          </div>
          <Link to={`/rooms/${room.slug}`}>
            Enter room <Icon name="arrow-right" />
          </Link>
        </div>
      </div>
    </section>
  );
}
