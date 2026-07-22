import { Link } from "react-router";
import { rooms } from "~/data/house";

export function HouseHall() {
  return (
    <section
      className="hall-section chapter-section"
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
      <div className="hall-stage">
        <img
          src="/assets/house/hall.webp"
          alt="A lantern-lit Japanese courtyard with three AKARI role spaces."
          loading="lazy"
        />
        <div className="hall-room-list" aria-label="Rooms in AKARI House">
          {rooms.map((room) => (
            <article
              id={`hall-room-${room.role}`}
              className={`hall-room hall-room-${room.role}`}
              key={room.role}
            >
              <span>
                {room.number} · {room.audience}
              </span>
              <h3>{room.title}</h3>
              <p>{room.summary}</p>
              <Link to={`/rooms/${room.slug}`}>
                Enter {room.title} <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
        <div className="hall-pagination" aria-label="Choose a room">
          {rooms.map((room) => (
            <button
              type="button"
              key={room.role}
              aria-label={`Show ${room.title}`}
              onClick={() =>
                document
                  .getElementById(`hall-room-${room.role}`)
                  ?.scrollIntoView({
                    behavior: "smooth",
                    inline: "center",
                    block: "nearest",
                  })
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
