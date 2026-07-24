const maximumProfilePhotoBytes = 2 * 1024 * 1024;

export type ValidProfilePhoto = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export async function validateProfilePhoto(
  file: File,
): Promise<ValidProfilePhoto | null> {
  if (file.size <= 0 || file.size > maximumProfilePhotoBytes) return null;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (startsWith(bytes, [0xff, 0xd8, 0xff]))
    return { contentType: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { contentType: "image/png", extension: "png" };
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return { contentType: "image/webp", extension: "webp" };
  return null;
}
