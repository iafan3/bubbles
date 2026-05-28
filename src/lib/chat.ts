export type Message = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  reply_to_message_id: string | null;
  media_url: string | null;
  media_path: string | null;
  media_name: string | null;
  media_type: string | null;
  media_size: number | null;
};

export type Channel = {
  id: string;
  server_id: string;
  name: string;
  sort_order: number;
  type: "text" | "voice";
};

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_static_url: string | null;
  banner_url: string | null;
  bio: string | null;
  status: string | null;
};

export type MessageReaction = {
  id: string;
  message_id: string;
  server_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type ReactionGroup = {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
};

export const MESSAGE_SELECT =
  "id, channel_id, user_id, content, created_at, edited_at, reply_to_message_id, media_url, media_path, media_name, media_type, media_size";

const MERGE_WINDOW_MS = 1000 * 60 * 3;

export function normalizeChannel(channel: Channel): Channel {
  return {
    ...channel,
    type: channel.type ?? "text",
  };
}

export function cleanChannelName(name: string) {
  return name
    .trim()
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 32);
}

export function sortChannels(channels: Channel[]) {
  return [...channels].sort((a, b) => {
    if (a.sort_order === b.sort_order) {
      return a.name.localeCompare(b.name);
    }

    return a.sort_order - b.sort_order;
  });
}

export function getProfileName(
  profiles: Record<string, Profile>,
  userId: string
) {
  const profile = profiles[userId];
  if (!profile) return "Unknown user";

  return profile.display_name || profile.username;
}

export function getProfileUsername(
  profiles: Record<string, Profile>,
  userId: string
) {
  const profile = profiles[userId];
  if (!profile) return "@unknown";

  return `@${profile.username}`;
}

export function getAvatarInitial(
  profiles: Record<string, Profile>,
  userId: string
) {
  return getProfileName(profiles, userId).charAt(0).toUpperCase() || "?";
}

export function getReplyPreviewText(message: Message) {
  if (message.content.trim()) return message.content;
  if (message.media_type?.startsWith("image/")) return "Image";
  if (message.media_type?.startsWith("video/")) return "Video";
  if (message.media_name) return message.media_name;

  return "Message";
}

export function getTypingText(
  typingUsers: Record<string, number>,
  currentUserId: string,
  profiles: Record<string, Profile>
) {
  const names = Object.keys(typingUsers)
    .filter((userId) => userId !== currentUserId)
    .map((userId) => getProfileName(profiles, userId));

  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;

  return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing...`;
}

export function groupReactionsByMessage(
  reactions: MessageReaction[],
  currentUserId: string
) {
  const groupsByMessage = new Map<string, ReactionGroup[]>();
  const builders = new Map<string, Map<string, ReactionGroup>>();

  for (const reaction of reactions) {
    let messageGroups = builders.get(reaction.message_id);

    if (!messageGroups) {
      messageGroups = new Map();
      builders.set(reaction.message_id, messageGroups);
    }

    const existing = messageGroups.get(reaction.emoji);

    if (existing) {
      existing.count += 1;
      existing.reactedByCurrentUser ||= reaction.user_id === currentUserId;
      continue;
    }

    messageGroups.set(reaction.emoji, {
      emoji: reaction.emoji,
      count: 1,
      reactedByCurrentUser: reaction.user_id === currentUserId,
    });
  }

  for (const [messageId, groups] of builders) {
    groupsByMessage.set(messageId, Array.from(groups.values()));
  }

  return groupsByMessage;
}

export function mapMessagesById(messages: Message[]) {
  return new Map(messages.map((message) => [message.id, message]));
}

export function shouldMergeMessage(messages: Message[], index: number) {
  const message = messages[index];
  if (!message || index === 0 || message.reply_to_message_id) return false;

  const previousMessage = messages[index - 1];
  if (!previousMessage || previousMessage.user_id !== message.user_id) {
    return false;
  }

  const difference =
    new Date(message.created_at).getTime() -
    new Date(previousMessage.created_at).getTime();

  return difference >= 0 && difference <= MERGE_WINDOW_MS;
}

export function isNewMessageDay(messages: Message[], index: number) {
  const message = messages[index];
  if (!message || index === 0) return true;

  const previousMessage = messages[index - 1];
  if (!previousMessage) return true;

  return (
    new Date(message.created_at).toDateString() !==
    new Date(previousMessage.created_at).toDateString()
  );
}

export function formatMessageDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}
