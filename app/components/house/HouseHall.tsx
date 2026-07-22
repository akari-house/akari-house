import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { rooms, type RoomDefinition } from "~/data/house";

export function HouseHall() {
  const [activeRoom, setActiveRoom] = useState<RoomDefinition | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function openRoom(room: RoomDefinition, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setActiveRoom(room);
  }

  function closeRoom() {
    setActiveRoom(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!activeRoom) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRoom();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          "a,button:not([disabled])",
        ),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeRoom]);

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
      <div className={`hall-stage${activeRoom ? " has-open-room" : ""}`}>
        <img
          src="/assets/house/hall.webp"
          alt="A lantern-lit Japanese courtyard with three AKARI role spaces."
          loading="lazy"
        />
        <div className="hall-room-list" aria-label="Rooms in AKARI House">
          {rooms.map((room) => (
            <article
              id={`hall-room-${room.role}`}
              className={`hall-room hall-room-${room.role}${activeRoom && activeRoom.role !== room.role ? " is-dimmed" : ""}`}
              key={room.role}
            >
              <span>
                {room.number} · {room.audience}
              </span>
              <h3>{room.title}</h3>
              <p>{room.summary}</p>
              <button
                type="button"
                onClick={(event) => openRoom(room, event.currentTarget)}
              >
                Enter {room.title} <span aria-hidden="true">→</span>
              </button>
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
        {activeRoom && (
          <div
            ref={dialogRef}
            className="room-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-dialog-title"
          >
            <div
              className="room-dialog-art"
              style={{ backgroundImage: `url(${activeRoom.image})` }}
              aria-hidden="true"
            />
            <div className="room-dialog-body">
              <button
                className="room-close"
                ref={closeRef}
                type="button"
                onClick={closeRoom}
                aria-label={`Close ${activeRoom.title} and return to the Hall`}
              >
                ×
              </button>
              <span className="chapter">
                {activeRoom.number} · {activeRoom.audience}
              </span>
              <h3 id="room-dialog-title">{activeRoom.title}</h3>
              <p>{activeRoom.detail}</p>
              <div className="room-feature-grid">
                {activeRoom.features.map((feature) => (
                  <div key={feature.title}>
                    <strong>{feature.title}</strong>
                    <small>{feature.copy}</small>
                  </div>
                ))}
              </div>
              <Link
                className="button button-primary"
                to={`/register?role=${activeRoom.role}`}
              >
                {activeRoom.action}
              </Link>
              <button className="text-button" type="button" onClick={closeRoom}>
                Return to the Hall
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
