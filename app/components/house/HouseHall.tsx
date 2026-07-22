import { useState } from "react";
import { Link } from "react-router";
import { rooms } from "~/data/house";

export function HouseHall() {
  const [activeRoom, setActiveRoom] = useState(rooms[0].role);

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
        />
        <span className="hall-heart" aria-hidden="true" />
        <div className="hall-room-list" aria-label="Rooms in AKARI House">
          {rooms.map((room) => (
            <Link
              id={`hall-room-${room.role}`}
              className={`hall-room hall-room-${room.role}${activeRoom === room.role ? " is-active" : ""}`}
              key={room.role}
              to={`/rooms/${room.slug}`}
              onPointerEnter={() => setActiveRoom(room.role)}
              onFocus={() => setActiveRoom(room.role)}
            >
              <span className="hall-room-kicker">
                {room.number} · {room.audience}
              </span>
              <h3>{room.title}</h3>
              <p>{room.summary}</p>
              <span className="hall-room-enter">
                Enter <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
        <div className="hall-pagination" aria-label="Choose a room">
          {rooms.map((room) => (
            <button
              type="button"
              key={room.role}
              aria-label={`Show ${room.title}`}
              aria-pressed={activeRoom === room.role}
              onClick={() => {
                setActiveRoom(room.role);
                document
                  .getElementById(`hall-room-${room.role}`)
                  ?.scrollIntoView({
                    behavior: "smooth",
                    inline: "center",
                    block: "nearest",
                  });
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
