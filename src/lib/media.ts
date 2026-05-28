export const FALLBACK_REACTION_EMOJIS = ["👍", "😂", "❤️", "🔥", "😭", "🎉"];

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export const ALLOWED_MESSAGE_MEDIA_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export const MAX_SERVER_AVATAR_SIZE = 5 * 1024 * 1024;
export const MAX_CUSTOM_EMOJI_SIZE = 2 * 1024 * 1024;
export const MAX_MESSAGE_MEDIA_SIZE = 25 * 1024 * 1024;

export function cleanFileName(fileName: string, fallbackName = "image") {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? parts.pop() : "";
  const baseName = parts.join(".") || fallbackName;

  const safeBaseName = baseName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 48);

  return `${safeBaseName || fallbackName}${extension ? `.${extension}` : ""}`;
}

export function cleanEmojiName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/^:+|:+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 32);
}

export function getFileSizeLabel(size: number) {
  return `${(size / 1024 / 1024).toFixed(0)}MB`;
}

export function validateFile(
  file: File,
  {
    allowedTypes,
    maxSize,
    typeMessage,
    sizePrefix,
  }: {
    allowedTypes: string[];
    maxSize: number;
    typeMessage: string;
    sizePrefix: string;
  }
) {
  if (!allowedTypes.includes(file.type)) return typeMessage;

  if (file.size > maxSize) {
    return `${sizePrefix} must be smaller than ${getFileSizeLabel(maxSize)}.`;
  }

  return "";
}
