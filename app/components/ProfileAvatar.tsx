export function ProfileAvatar({
  displayName,
  src,
  variant,
}: {
  displayName: string;
  src?: string;
  variant: "card" | "profile";
}) {
  const className = variant === "card" ? "member-card-photo" : "profile-photo";

  return src ? (
    <img
      className={className}
      src={src}
      alt={variant === "profile" ? `${displayName}'s profile` : ""}
      width={variant === "profile" ? 176 : 58}
      height={variant === "profile" ? 176 : 58}
    />
  ) : (
    <div
      className={
        variant === "card" ? "member-card-monogram" : "profile-monogram"
      }
      aria-hidden="true"
    >
      {displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}
