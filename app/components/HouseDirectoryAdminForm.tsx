import { useState } from "react";
import { Form } from "react-router";
import {
  houseDirectoryCategories,
  houseDirectoryCategoryLabels,
  houseDirectoryImageUrl,
  isHouseDirectoryOrganization,
  type HouseDirectoryCategory,
  type HouseDirectoryEntry,
} from "~/lib/house-directory";

export function HouseDirectoryAdminForm({
  entry,
}: {
  entry?: HouseDirectoryEntry;
}) {
  const [category, setCategory] = useState<HouseDirectoryCategory>(
    entry?.category ?? "team",
  );
  const isOrganization = isHouseDirectoryOrganization(category);

  return (
    <Form
      method="post"
      encType="multipart/form-data"
      className="directory-admin-form"
    >
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <div className="directory-admin-form__identity">
        {entry?.imageKey && (
          <img
            className={
              isOrganization ? "directory-admin-form__organization-logo" : ""
            }
            src={houseDirectoryImageUrl(entry)}
            alt=""
            width={96}
            height={96}
          />
        )}
        <label>
          {isOrganization ? "Organization name" : "Name"}
          <input name="name" required defaultValue={entry?.name ?? ""} />
        </label>
        <label>
          Category
          <select
            name="category"
            value={category}
            onChange={(event) =>
              setCategory(event.currentTarget.value as HouseDirectoryCategory)
            }
          >
            {houseDirectoryCategories.map((categoryOption) => (
              <option value={categoryOption} key={categoryOption}>
                {houseDirectoryCategoryLabels[categoryOption]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isOrganization ? (
        <p className="directory-admin-form__note">
          Organization entries are intentionally simple: logo and name only.
        </p>
      ) : null}

      <div className="directory-admin-form__grid">
        {!isOrganization && (
          <label>
            Title or relationship
            <input name="title" defaultValue={entry?.title ?? ""} />
          </label>
        )}
        <label>
          Display order
          <input
            name="displayOrder"
            type="number"
            defaultValue={entry?.displayOrder ?? 0}
          />
        </label>
        <label>
          Publication
          <select name="status" defaultValue={entry?.status ?? "draft"}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
        <label>
          {isOrganization ? "Logo" : "Photo"}
          <input
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
          />
        </label>
      </div>

      {!isOrganization && (
        <>
          <label>
            Short biography
            <textarea
              name="biography"
              rows={3}
              defaultValue={entry?.biography ?? ""}
            />
          </label>
          <div className="directory-admin-form__grid directory-admin-form__links">
            {(
              [
                ["websiteUrl", "Website", entry?.websiteUrl],
                ["xUrl", "X", entry?.xUrl],
                ["linkedinUrl", "LinkedIn", entry?.linkedinUrl],
                ["instagramUrl", "Instagram", entry?.instagramUrl],
                ["tiktokUrl", "TikTok", entry?.tiktokUrl],
                ["youtubeUrl", "YouTube", entry?.youtubeUrl],
                ["telegramUrl", "Telegram", entry?.telegramUrl],
              ] as const
            ).map(([name, label, value]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  type="url"
                  defaultValue={value ?? ""}
                  placeholder="https://"
                />
              </label>
            ))}
          </div>
        </>
      )}

      <div className="directory-admin-form__actions">
        <button className="button button-primary" name="intent" value="save">
          {entry ? "Save changes" : "Add entry"}
        </button>
        {entry && (
          <button className="button button-quiet" name="intent" value="archive">
            Archive
          </button>
        )}
      </div>
    </Form>
  );
}
