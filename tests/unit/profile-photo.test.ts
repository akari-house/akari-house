import { describe, expect, it } from "vitest";
import { validateProfilePhoto } from "~/lib/profile-photo.server";

function imageFile(bytes: number[], type = "application/octet-stream") {
  return new File([new Uint8Array(bytes)], "profile.bin", { type });
}

describe("profile photo validation", () => {
  it("recognizes supported images from their bytes rather than the browser label", async () => {
    const jpeg = imageFile([0xff, 0xd8, 0xff, 0xe0]);
    const png = imageFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const webp = imageFile([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);

    await expect(validateProfilePhoto(jpeg)).resolves.toEqual({
      contentType: "image/jpeg",
      extension: "jpg",
    });
    await expect(validateProfilePhoto(png)).resolves.toEqual({
      contentType: "image/png",
      extension: "png",
    });
    await expect(validateProfilePhoto(webp)).resolves.toEqual({
      contentType: "image/webp",
      extension: "webp",
    });
  });

  it("rejects files that merely claim to be images", async () => {
    await expect(
      validateProfilePhoto(imageFile([1, 2, 3, 4], "image/png")),
    ).resolves.toBeNull();
  });
});
