import { useState } from "react";
import { Form, useNavigation } from "react-router";

export function ProfilePhotoEditor({
  avatarKey,
  displayName,
  error,
  isMember,
  username,
}: {
  avatarKey: string;
  displayName: string;
  error?: string;
  isMember: boolean;
  username: string;
}) {
  const navigation = useNavigation();
  const [fileName, setFileName] = useState("");
  const pendingIntent = navigation.formData?.get("intent");
  const photoPending =
    navigation.state !== "idle" &&
    (pendingIntent === "upload-photo" || pendingIntent === "remove-photo");

  return (
    <Form
      method="post"
      encType="multipart/form-data"
      className="profile-photo-form"
      aria-labelledby="profile-photo-legend"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <fieldset className="profile-photo-editor" id="profile-photo">
        <legend id="profile-photo-legend">Profile photo</legend>
        <div className="profile-photo-preview">
          {avatarKey ? (
            <img
              src={`/media/profile/${encodeURIComponent(username)}?v=${encodeURIComponent(avatarKey)}`}
              alt={`${displayName}'s current profile`}
              width={112}
              height={112}
            />
          ) : (
            <span aria-hidden="true">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <strong>
              {isMember
                ? "Add your face to the House"
                : "Available after approval"}
            </strong>
            <small>JPG, PNG or WebP. Maximum 2 MB.</small>
          </div>
        </div>
        {isMember && (
          <div className="profile-photo-actions">
            <label className="profile-photo-picker">
              <span>Choose image</span>
              <input
                name="profilePhoto"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-describedby="profile-photo-selection"
                disabled={photoPending}
                onChange={(event) =>
                  setFileName(event.currentTarget.files?.[0]?.name ?? "")
                }
              />
            </label>
            <button
              className="button button-primary"
              name="intent"
              value="upload-photo"
              type="submit"
              disabled={!fileName || photoPending}
            >
              {pendingIntent === "upload-photo" && photoPending
                ? "Uploading…"
                : "Upload photo"}
            </button>
            {avatarKey && (
              <button
                className="button button-quiet"
                name="intent"
                value="remove-photo"
                type="submit"
                disabled={photoPending}
              >
                {pendingIntent === "remove-photo" && photoPending
                  ? "Removing…"
                  : "Remove profile photo"}
              </button>
            )}
            <small id="profile-photo-selection" role="status">
              {fileName ? `Selected: ${fileName}` : "No image selected"}
            </small>
          </div>
        )}
      </fieldset>
    </Form>
  );
}
