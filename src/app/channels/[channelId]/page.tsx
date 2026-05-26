"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./chat.module.css";

type Message = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  media_url: string | null;
  media_path: string | null;
  media_name: string | null;
  media_type: string | null;
  media_size: number | null;
};

type Channel = {
  id: string;
  server_id: string;
  name: string;
  sort_order: number;
  type: "text" | "voice";
};

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_static_url: string | null;
};

type MessageReaction = {
  id: string;
  message_id: string;
  server_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

type ServerSettings = {
  server_id: string;
  reaction_emojis: string[];
};

type ProfileMap = Record<string, Profile>;

type MessageContextMenu = {
  messageId: string;
  x: number;
  y: number;
};

type UnreadMap = Record<string, number>;

type VoiceCall = {
  channelId: string;
  channelName: string;
  roomUrl: string;
  token: string;
};

type UploadedMedia = {
  media_url: string;
  media_path: string;
  media_name: string;
  media_type: string;
  media_size: number;
};

type Theme = "light" | "dark";

const FALLBACK_REACTION_EMOJIS = ["👍", "😂", "❤️", "🔥", "😭", "🎉"];

const MESSAGE_MEDIA_BUCKET = "message-media";

const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const MAX_MEDIA_SIZE = 25 * 1024 * 1024;

export default function ChannelPage() {
  const params = useParams<{ channelId: string }>();
  const channelId = params.channelId;

  const supabase = useMemo(() => createClient(), []);

  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const lastTypingSentRef = useRef(0);
  const dailyContainerRef = useRef<HTMLDivElement | null>(null);
  const dailyCallRef = useRef<any>(null);

  const [theme, setTheme] = useState<Theme>("dark");

  const [messages, setMessages] = useState<Message[]>([]);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>(
    []
  );
  const [serverChannels, setServerChannels] = useState<Channel[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [unreadByChannelId, setUnreadByChannelId] = useState<UnreadMap>({});
  const [reactionEmojis, setReactionEmojis] = useState<string[]>(
    FALLBACK_REACTION_EMOJIS
  );

  const [notificationsPermission, setNotificationsPermission] =
    useState<NotificationPermission>("default");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const [currentUserId, setCurrentUserId] = useState("");
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  const [creatingChannelType, setCreatingChannelType] = useState<
    "text" | "voice" | ""
  >("");
  const [newChannelName, setNewChannelName] = useState("");

  const [editingChannelId, setEditingChannelId] = useState("");
  const [editingChannelName, setEditingChannelName] = useState("");

  const [draggingChannelId, setDraggingChannelId] = useState("");

  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingMessageContent, setEditingMessageContent] = useState("");
  const [messageContextMenu, setMessageContextMenu] =
    useState<MessageContextMenu | null>(null);

  const [voiceCall, setVoiceCall] = useState<VoiceCall | null>(null);
  const [isJoiningVoice, setIsJoiningVoice] = useState(false);
  const [hoveredAvatarKey, setHoveredAvatarKey] = useState("");

  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);
  const [selectedMediaPreviewUrl, setSelectedMediaPreviewUrl] = useState("");
  const [isSending, setIsSending] = useState(false);

  const loadProfilesByIds = useCallback(
    async (userIds: string[]) => {
      const uniqueUserIds = Array.from(new Set(userIds)).filter(Boolean);

      if (uniqueUserIds.length === 0) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, avatar_static_url")
        .in("id", uniqueUserIds);

      if (error) {
        setStatus(error.message);
        return;
      }

      setProfiles((current) => {
        const nextProfiles = { ...current };

        for (const profile of data ?? []) {
          nextProfiles[profile.id] = profile;
        }

        return nextProfiles;
      });
    },
    [supabase]
  );

  const loadProfilesForMessages = useCallback(
    async (targetMessages: Message[]) => {
      const userIds = targetMessages.map((message) => message.user_id);
      await loadProfilesByIds(userIds);
    },
    [loadProfilesByIds]
  );

  const loadReactionsForMessages = useCallback(
    async (targetMessages: Message[]) => {
      const messageIds = targetMessages.map((message) => message.id);

      if (messageIds.length === 0) {
        setMessageReactions([]);
        return;
      }

      const { data, error } = await supabase
        .from("message_reactions")
        .select("id, message_id, server_id, user_id, emoji, created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: true });

      if (error) {
        setStatus(error.message);
        return;
      }

      setMessageReactions(data ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    const cachedChannels = window.sessionStorage.getItem("bubbles-channels");

    if (cachedChannels) {
      try {
        const parsedChannels = JSON.parse(cachedChannels) as Channel[];

        setServerChannels(
          parsedChannels.map((channel) => ({
            ...channel,
            type: channel.type ?? "text",
          }))
        );
      } catch {
        window.sessionStorage.removeItem("bubbles-channels");
      }
    }

    const cachedUnreads = window.localStorage.getItem("bubbles-unreads");

    if (cachedUnreads) {
      try {
        const parsedUnreads = JSON.parse(cachedUnreads) as UnreadMap;
        setUnreadByChannelId(parsedUnreads);
      } catch {
        window.localStorage.removeItem("bubbles-unreads");
      }
    }

    const savedNotificationSetting = window.localStorage.getItem(
      "bubbles-notifications-enabled"
    );

    setNotificationsEnabled(savedNotificationSetting === "true");

    const savedTheme = window.localStorage.getItem(
      "bubbles-theme"
    ) as Theme | null;

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

      setTheme(prefersDark ? "dark" : "light");
    }

    if ("Notification" in window) {
      setNotificationsPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (selectedMediaPreviewUrl) {
        URL.revokeObjectURL(selectedMediaPreviewUrl);
      }
    };
  }, [selectedMediaPreviewUrl]);

  useEffect(() => {
    function closeContextMenu() {
      setMessageContextMenu(null);
    }

    function closeContextMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMessageContextMenu(null);
      }
    }

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("keydown", closeContextMenuOnEscape);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("keydown", closeContextMenuOnEscape);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTypingUsers((current) => {
        const now = Date.now();
        const nextTypingUsers: Record<string, number> = {};

        for (const [userId, typedAt] of Object.entries(current)) {
          if (now - typedAt < 3000) {
            nextTypingUsers[userId] = typedAt;
          }
        }

        return nextTypingUsers;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const totalUnread = Object.values(unreadByChannelId).reduce(
      (total, count) => total + count,
      0
    );

    const title = currentChannel
      ? `# ${currentChannel.name} | Bubbles`
      : "Bubbles";

    document.title = totalUnread > 0 ? `(${totalUnread}) ${title}` : title;
  }, [unreadByChannelId, currentChannel]);

  useEffect(() => {
    async function loadPage() {
      setStatus("");
      setMessages([]);
      setMessageReactions([]);
      setInviteLink("");
      setEditingChannelId("");
      setEditingChannelName("");
      setDraggingChannelId("");
      setEditingMessageId("");
      setEditingMessageContent("");
      setMessageContextMenu(null);
      setTypingUsers({});
      clearUnreadForChannel(channelId);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = "/login";
        return;
      }

      setCurrentUserId(user.id);
      await loadProfilesByIds([user.id]);

      const { data: channelData, error: channelError } = await supabase
        .from("channels")
        .select("id, server_id, name, sort_order, type")
        .eq("id", channelId)
        .single();

      if (channelError || !channelData) {
        setStatus(channelError?.message ?? "Could not load channel.");
        return;
      }

      const loadedChannel = {
        ...channelData,
        type: channelData.type ?? "text",
      } as Channel;

      if (loadedChannel.type !== "text") {
        setStatus("Open a text channel to view chat.");
        return;
      }

      setCurrentChannel(loadedChannel);

      const { data: serverData, error: serverError } = await supabase
        .from("servers")
        .select("owner_id")
        .eq("id", loadedChannel.server_id)
        .single();

      if (serverError) {
        setStatus(serverError.message);
        return;
      }

      setIsOwner(serverData?.owner_id === user.id);

      const { data: settingsData } = await supabase
        .from("server_settings")
        .select("server_id, reaction_emojis")
        .eq("server_id", loadedChannel.server_id)
        .maybeSingle();

      const settings = settingsData as ServerSettings | null;

      if (settings?.reaction_emojis?.length) {
        setReactionEmojis(settings.reaction_emojis);
      } else {
        setReactionEmojis(FALLBACK_REACTION_EMOJIS);
      }

      const { data: channelList, error: channelListError } = await supabase
        .from("channels")
        .select("id, server_id, name, sort_order, type")
        .eq("server_id", loadedChannel.server_id)
        .order("type", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (channelListError) {
        setStatus(channelListError.message);
        return;
      }

      const nextChannels =
        channelList?.map((channel) => ({
          ...channel,
          type: channel.type ?? "text",
        })) ?? [];

      setServerChannels(nextChannels as Channel[]);

      window.sessionStorage.setItem(
        "bubbles-channels",
        JSON.stringify(nextChannels)
      );

      const { data: messageData, error: messageError } = await supabase
        .from("messages")
        .select(
          "id, channel_id, user_id, content, created_at, edited_at, media_url, media_path, media_name, media_type, media_size"
        )
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true });

      if (messageError) {
        setStatus(messageError.message);
        return;
      }

      const nextMessages = messageData ?? [];

      setMessages(nextMessages as Message[]);
      await loadProfilesForMessages(nextMessages as Message[]);
      await loadReactionsForMessages(nextMessages as Message[]);
    }

    loadPage();

    const realtimeChannel = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          setMessages((current) => {
            const alreadyExists = current.some(
              (message) => message.id === newMessage.id
            );

            if (alreadyExists) {
              return current;
            }

            return [...current, newMessage];
          });

          setTypingUsers((current) => {
            const nextTypingUsers = { ...current };
            delete nextTypingUsers[newMessage.user_id];
            return nextTypingUsers;
          });

          await loadProfilesForMessages([newMessage]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as Message;

          setMessages((current) =>
            current.map((message) =>
              message.id === updatedMessage.id ? updatedMessage : message
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const deletedMessage = payload.old as Message;

          setMessages((current) =>
            current.filter((message) => message.id !== deletedMessage.id)
          );

          setMessageReactions((current) =>
            current.filter(
              (reaction) => reaction.message_id !== deletedMessage.id
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [
    channelId,
    supabase,
    loadProfilesByIds,
    loadProfilesForMessages,
    loadReactionsForMessages,
  ]);

  useEffect(() => {
    if (!currentChannel) return;

    const reactionChannel = supabase
      .channel(`message-reactions:${currentChannel.server_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
          filter: `server_id=eq.${currentChannel.server_id}`,
        },
        (payload) => {
          const newReaction = payload.new as MessageReaction;

          setMessageReactions((current) => {
            const alreadyExists = current.some(
              (reaction) => reaction.id === newReaction.id
            );

            if (alreadyExists) return current;

            return [...current, newReaction];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
          filter: `server_id=eq.${currentChannel.server_id}`,
        },
        (payload) => {
          const deletedReaction = payload.old as MessageReaction;

          setMessageReactions((current) =>
            current.filter((reaction) => reaction.id !== deletedReaction.id)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reactionChannel);
    };
  }, [currentChannel, supabase]);

  useEffect(() => {
    if (!currentChannel || serverChannels.length === 0 || !currentUserId) return;

    const serverTextChannelIds = new Set(
      serverChannels
        .filter(
          (channel) =>
            channel.server_id === currentChannel.server_id &&
            channel.type === "text"
        )
        .map((channel) => channel.id)
    );

    const notificationChannel = supabase
      .channel(`message-notifications:${currentChannel.server_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          if (!serverTextChannelIds.has(newMessage.channel_id)) return;
          if (newMessage.channel_id === channelId) return;
          if (newMessage.user_id === currentUserId) return;

          incrementUnreadForChannel(newMessage.channel_id);
          await loadProfilesForMessages([newMessage]);
          showBrowserNotification(newMessage);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
    };
  }, [
    channelId,
    currentChannel,
    currentUserId,
    serverChannels,
    supabase,
    loadProfilesForMessages,
    profiles,
    notificationsEnabled,
  ]);

  useEffect(() => {
    const typingChannel = supabase.channel(`typing:${channelId}`, {
      config: {
        broadcast: {
          self: false,
        },
      },
    });

    typingChannelRef.current = typingChannel;

    typingChannel
      .on("broadcast", { event: "typing" }, async (payload) => {
        const typingPayload = payload.payload as {
          user_id?: string;
          channel_id?: string;
        };

        if (!typingPayload.user_id) return;
        if (typingPayload.user_id === currentUserId) return;
        if (typingPayload.channel_id !== channelId) return;

        setTypingUsers((current) => ({
          ...current,
          [typingPayload.user_id as string]: Date.now(),
        }));

        await loadProfilesByIds([typingPayload.user_id]);
      })
      .subscribe();

    return () => {
      typingChannelRef.current = null;
      supabase.removeChannel(typingChannel);
    };
  }, [channelId, currentUserId, supabase, loadProfilesByIds]);

  useEffect(() => {
    if (!currentChannel) return;

    let isMounted = true;
    let cleanupPresence: (() => void) | undefined;

    async function setupPresence() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !currentChannel || !isMounted) return;

      const presenceChannel = supabase.channel(
        `server-presence:${currentChannel.server_id}`,
        {
          config: {
            presence: {
              key: user.id,
            },
          },
        }
      );

      function syncOnlineUsers() {
        const state = presenceChannel.presenceState();

        const userIds = Array.from(
          new Set(
            Object.values(state).flatMap((entries) =>
              entries
                .map((entry) => {
                  const presence = entry as { user_id?: string };
                  return presence.user_id;
                })
                .filter((userId): userId is string => Boolean(userId))
            )
          )
        );

        setOnlineUserIds(userIds);
        loadProfilesByIds(userIds);
      }

      presenceChannel
        .on("presence", { event: "sync" }, syncOnlineUsers)
        .on("presence", { event: "join" }, syncOnlineUsers)
        .on("presence", { event: "leave" }, syncOnlineUsers)
        .subscribe(async (presenceStatus) => {
          if (presenceStatus !== "SUBSCRIBED") return;

          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });

          syncOnlineUsers();
        });

      cleanupPresence = () => {
        supabase.removeChannel(presenceChannel);
      };
    }

    setupPresence();

    return () => {
      isMounted = false;

      if (cleanupPresence) {
        cleanupPresence();
      }
    };
  }, [currentChannel, supabase, loadProfilesByIds]);

  useEffect(() => {
    if (!voiceCall || !dailyContainerRef.current) return;

    const activeVoiceCall = voiceCall;
    const activeContainer = dailyContainerRef.current;

    let isCanceled = false;

    async function createDailyCall() {
      try {
        const DailyIframe = (await import("@daily-co/daily-js")).default;

        if (isCanceled) return;

        if (dailyCallRef.current) {
          dailyCallRef.current.destroy();
          dailyCallRef.current = null;
        }

        const callFrame = DailyIframe.createFrame(activeContainer, {
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "14px",
          },
          showLeaveButton: true,
        });

        dailyCallRef.current = callFrame;

        callFrame.on("left-meeting", () => {
          setVoiceCall(null);
        });

        await callFrame.join({
          url: activeVoiceCall.roomUrl,
          token: activeVoiceCall.token,
        });
      } catch (error) {
        console.error(error);
        setStatus("Could not start the voice call.");
        setVoiceCall(null);
      }
    }

    createDailyCall();

    return () => {
      isCanceled = true;

      if (dailyCallRef.current) {
        dailyCallRef.current.destroy();
        dailyCallRef.current = null;
      }
    };
  }, [voiceCall]);

  function cleanChannelName(name: string) {
    return name
      .trim()
      .replace(/^#+/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 32);
  }

  function sortChannels(channels: Channel[]) {
    return [...channels].sort((a, b) => {
      if (a.sort_order === b.sort_order) {
        return a.name.localeCompare(b.name);
      }

      return a.sort_order - b.sort_order;
    });
  }

  function cacheChannels(channels: Channel[]) {
    window.sessionStorage.setItem("bubbles-channels", JSON.stringify(channels));
  }

  function cacheUnreadCounts(unreads: UnreadMap) {
    window.localStorage.setItem("bubbles-unreads", JSON.stringify(unreads));
  }

  function clearUnreadForChannel(targetChannelId: string) {
    setUnreadByChannelId((current) => {
      const next = { ...current };
      delete next[targetChannelId];
      cacheUnreadCounts(next);
      return next;
    });
  }

  function incrementUnreadForChannel(targetChannelId: string) {
    setUnreadByChannelId((current) => {
      const next = {
        ...current,
        [targetChannelId]: (current[targetChannelId] ?? 0) + 1,
      };

      cacheUnreadCounts(next);

      return next;
    });
  }

  function getChannelName(targetChannelId: string) {
    return (
      serverChannels.find((channel) => channel.id === targetChannelId)?.name ??
      "channel"
    );
  }

  function getProfileName(userId: string) {
    const profile = profiles[userId];

    if (!profile) {
      return "Unknown user";
    }

    return profile.display_name || profile.username;
  }

  function getProfileUsername(userId: string) {
    const profile = profiles[userId];

    if (!profile) {
      return "@unknown";
    }

    return `@${profile.username}`;
  }

  function getAvatarInitial(userId: string) {
    const name = getProfileName(userId);

    return name.charAt(0).toUpperCase() || "?";
  }

  function getAvatarUrl(userId: string) {
    return profiles[userId]?.avatar_url ?? "";
  }

  function getAvatarStaticUrl(userId: string) {
    return (
      profiles[userId]?.avatar_static_url ||
      profiles[userId]?.avatar_url ||
      ""
    );
  }

  function renderHoverAvatar(userId: string, avatarKey: string) {
    const animatedUrl = getAvatarUrl(userId);
    const staticUrl = getAvatarStaticUrl(userId);
    const isHovered = hoveredAvatarKey === avatarKey;

    if (!animatedUrl && !staticUrl) {
      return getAvatarInitial(userId);
    }

    return (
      <img
        className={styles.avatarImage}
        src={isHovered ? animatedUrl : staticUrl}
        alt={`${getProfileName(userId)} avatar`}
      />
    );
  }

  function getTypingText() {
    const typingUserIds = Object.keys(typingUsers).filter(
      (userId) => userId !== currentUserId
    );

    if (typingUserIds.length === 0) return "";

    const names = typingUserIds.map((userId) => getProfileName(userId));

    if (names.length === 1) {
      return `${names[0]} is typing...`;
    }

    if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing...`;
    }

    return `${names[0]}, ${names[1]}, and ${
      names.length - 2
    } others are typing...`;
  }

  function getReactionGroups(messageId: string) {
    const reactions = messageReactions.filter(
      (reaction) => reaction.message_id === messageId
    );

    const groups = new Map<
      string,
      {
        emoji: string;
        count: number;
        reactedByCurrentUser: boolean;
      }
    >();

    for (const reaction of reactions) {
      const existing = groups.get(reaction.emoji);

      if (existing) {
        existing.count += 1;

        if (reaction.user_id === currentUserId) {
          existing.reactedByCurrentUser = true;
        }

        continue;
      }

      groups.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        reactedByCurrentUser: reaction.user_id === currentUserId,
      });
    }

    return Array.from(groups.values());
  }

  function sendTypingEvent() {
    if (!currentUserId || !typingChannelRef.current) return;

    const now = Date.now();

    if (now - lastTypingSentRef.current < 1200) return;

    lastTypingSentRef.current = now;

    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: currentUserId,
        channel_id: channelId,
        typed_at: new Date().toISOString(),
      },
    });
  }

  function handleContentChange(event: React.ChangeEvent<HTMLInputElement>) {
    setContent(event.target.value);
    sendTypingEvent();
  }

  function toggleTheme() {
    setTheme((current) => {
      const nextTheme = current === "dark" ? "light" : "dark";

      window.localStorage.setItem("bubbles-theme", nextTheme);

      return nextTheme;
    });
  }

  async function toggleNotifications() {
    if (notificationsEnabled) {
      window.localStorage.setItem("bubbles-notifications-enabled", "false");
      setNotificationsEnabled(false);
      setStatus("App notifications muted.");
      return;
    }

    if (!("Notification" in window)) {
      setStatus("Browser notifications are not supported.");
      return;
    }

    if (Notification.permission === "granted") {
      window.localStorage.setItem("bubbles-notifications-enabled", "true");
      setNotificationsPermission("granted");
      setNotificationsEnabled(true);
      setStatus("App notifications enabled.");
      return;
    }

    const permission = await Notification.requestPermission();

    setNotificationsPermission(permission);

    if (permission === "granted") {
      window.localStorage.setItem("bubbles-notifications-enabled", "true");
      setNotificationsEnabled(true);
      setStatus("App notifications enabled.");
      return;
    }

    window.localStorage.setItem("bubbles-notifications-enabled", "false");
    setNotificationsEnabled(false);
    setStatus("Browser notifications were not enabled.");
  }

  function showBrowserNotification(message: Message) {
    if (!notificationsEnabled) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!document.hidden && document.hasFocus()) return;

    const author = getProfileName(message.user_id);
    const channelName = getChannelName(message.channel_id);

    const notification = new Notification(`${author} in #${channelName}`, {
      body: message.content || message.media_name || "Sent an attachment",
      tag: `message-${message.id}`,
    });

    notification.onclick = () => {
      window.focus();
      window.location.href = `/channels/${message.channel_id}`;
      notification.close();
    };
  }

  function openMessageContextMenu(
    event: React.MouseEvent<HTMLElement>,
    message: Message
  ) {
    event.preventDefault();

    const menuWidth = 220;
    const menuHeight = message.user_id === currentUserId ? 154 : 94;

    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 12);

    setMessageContextMenu({
      messageId: message.id,
      x,
      y,
    });
  }

  function cleanFileName(fileName: string) {
    const parts = fileName.split(".");
    const extension = parts.length > 1 ? parts.pop() : "";
    const baseName = parts.join(".") || "media";

    const safeBaseName = baseName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 48);

    return `${safeBaseName || "media"}${extension ? `.${extension}` : ""}`;
  }

  function clearSelectedMedia() {
    setSelectedMediaFile(null);

    if (selectedMediaPreviewUrl) {
      URL.revokeObjectURL(selectedMediaPreviewUrl);
    }

    setSelectedMediaPreviewUrl("");
  }

  function handleMediaChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
      setStatus("Please choose a supported image or video file.");
      return;
    }

    if (file.size > MAX_MEDIA_SIZE) {
      setStatus("Media must be smaller than 25MB.");
      return;
    }

    if (selectedMediaPreviewUrl) {
      URL.revokeObjectURL(selectedMediaPreviewUrl);
    }

    setSelectedMediaFile(file);
    setSelectedMediaPreviewUrl(URL.createObjectURL(file));
    setStatus("");
  }

  async function uploadMessageMedia(
    userId: string,
    file: File
  ): Promise<UploadedMedia | null> {
    if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
      setStatus("Please choose a supported image or video file.");
      return null;
    }

    if (file.size > MAX_MEDIA_SIZE) {
      setStatus("Media must be smaller than 25MB.");
      return null;
    }

    const safeFileName = cleanFileName(file.name);
    const filePath = `${userId}/${channelId}/${crypto.randomUUID()}-${safeFileName}`;

    const { error } = await supabase.storage
      .from(MESSAGE_MEDIA_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      setStatus(error.message);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(MESSAGE_MEDIA_BUCKET).getPublicUrl(filePath);

    return {
      media_url: publicUrl,
      media_path: filePath,
      media_name: file.name,
      media_type: file.type,
      media_size: file.size,
    };
  }

  function renderMessageMedia(message: Message) {
    if (!message.media_url || !message.media_type) return null;

    if (message.media_type.startsWith("image/")) {
      return (
        <a
          className={styles.messageMediaLink}
          href={message.media_url}
          target="_blank"
          rel="noreferrer"
        >
          <img
            className={styles.messageImage}
            src={message.media_url}
            alt={message.media_name ?? "Uploaded image"}
          />
        </a>
      );
    }

    if (message.media_type.startsWith("video/")) {
      return (
        <video
          className={styles.messageVideo}
          src={message.media_url}
          controls
          preload="metadata"
        />
      );
    }

    return (
      <a
        className={styles.messageFile}
        href={message.media_url}
        target="_blank"
        rel="noreferrer"
      >
        {message.media_name ?? "Download file"}
      </a>
    );
  }

  async function toggleReaction(message: Message, emoji: string) {
    if (!currentChannel || !currentUserId) return;

    setMessageContextMenu(null);
    setStatus("");

    const existingReaction = messageReactions.find(
      (reaction) =>
        reaction.message_id === message.id &&
        reaction.user_id === currentUserId &&
        reaction.emoji === emoji
    );

    if (existingReaction) {
      setMessageReactions((current) =>
        current.filter((reaction) => reaction.id !== existingReaction.id)
      );

      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existingReaction.id);

      if (error) {
        setStatus(error.message);
        setMessageReactions((current) => [...current, existingReaction]);
      }

      return;
    }

    const tempReaction: MessageReaction = {
      id: crypto.randomUUID(),
      message_id: message.id,
      server_id: currentChannel.server_id,
      user_id: currentUserId,
      emoji,
      created_at: new Date().toISOString(),
    };

    setMessageReactions((current) => [...current, tempReaction]);

    const { data, error } = await supabase
      .from("message_reactions")
      .insert({
        message_id: message.id,
        server_id: currentChannel.server_id,
        user_id: currentUserId,
        emoji,
      })
      .select("id, message_id, server_id, user_id, emoji, created_at")
      .single();

    if (error) {
      setMessageReactions((current) =>
        current.filter((reaction) => reaction.id !== tempReaction.id)
      );

      if (!error.message.includes("duplicate key")) {
        setStatus(error.message);
      }

      return;
    }

    if (data) {
      setMessageReactions((current) => {
        const withoutTemp = current.filter(
          (reaction) => reaction.id !== tempReaction.id
        );

        const alreadyExists = withoutTemp.some(
          (reaction) => reaction.id === data.id
        );

        if (alreadyExists) return withoutTemp;

        return [...withoutTemp, data as MessageReaction];
      });
    }
  }

  async function startVoiceCall(channel: Channel) {
    if (channel.type !== "voice") return;

    setStatus("");
    setIsJoiningVoice(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;

    if (!accessToken) {
      setStatus("You need to sign in first.");
      setIsJoiningVoice(false);
      return;
    }

    const response = await fetch("/api/daily/voice-room", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId: channel.id,
      }),
    });

    const data = (await response.json()) as
      | {
          roomUrl: string;
          token: string;
          channelName: string;
        }
      | {
          error: string;
        };

    setIsJoiningVoice(false);

    if (!response.ok || "error" in data) {
      setStatus("error" in data ? data.error : "Could not join voice channel.");
      return;
    }

    setVoiceCall({
      channelId: channel.id,
      channelName: data.channelName,
      roomUrl: data.roomUrl,
      token: data.token,
    });
  }

  function leaveVoiceCall() {
    if (dailyCallRef.current) {
      dailyCallRef.current.destroy();
      dailyCallRef.current = null;
    }

    setVoiceCall(null);
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = content.trim();

    if (!trimmed && !selectedMediaFile) return;

    if (isSending) return;

    setIsSending(true);
    setStatus("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setStatus("You need to sign in first.");
      setIsSending(false);
      return;
    }

    let uploadedMedia: UploadedMedia | null = null;

    if (selectedMediaFile) {
      uploadedMedia = await uploadMessageMedia(user.id, selectedMediaFile);

      if (!uploadedMedia) {
        setIsSending(false);
        return;
      }
    }

    const tempId = crypto.randomUUID();

    const tempMessage: Message = {
      id: tempId,
      channel_id: channelId,
      user_id: user.id,
      content: trimmed,
      created_at: new Date().toISOString(),
      edited_at: null,
      media_url: uploadedMedia?.media_url ?? null,
      media_path: uploadedMedia?.media_path ?? null,
      media_name: uploadedMedia?.media_name ?? null,
      media_type: uploadedMedia?.media_type ?? null,
      media_size: uploadedMedia?.media_size ?? null,
    };

    setMessages((current) => [...current, tempMessage]);
    setContent("");
    clearSelectedMedia();

    await loadProfilesForMessages([tempMessage]);

    const { data: savedMessage, error } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        user_id: user.id,
        content: trimmed,
        media_url: uploadedMedia?.media_url ?? null,
        media_path: uploadedMedia?.media_path ?? null,
        media_name: uploadedMedia?.media_name ?? null,
        media_type: uploadedMedia?.media_type ?? null,
        media_size: uploadedMedia?.media_size ?? null,
      })
      .select(
        "id, channel_id, user_id, content, created_at, edited_at, media_url, media_path, media_name, media_type, media_size"
      )
      .single();

    setIsSending(false);

    if (error) {
      setStatus(error.message);
      setContent(trimmed);

      setMessages((current) =>
        current.filter((message) => message.id !== tempId)
      );

      if (uploadedMedia?.media_path) {
        await supabase.storage
          .from(MESSAGE_MEDIA_BUCKET)
          .remove([uploadedMedia.media_path]);
      }

      return;
    }

    if (savedMessage) {
      setMessages((current) => {
        const withoutTemp = current.filter((message) => message.id !== tempId);

        const alreadyExists = withoutTemp.some(
          (message) => message.id === savedMessage.id
        );

        if (alreadyExists) {
          return withoutTemp;
        }

        return [...withoutTemp, savedMessage as Message];
      });

      await loadProfilesForMessages([savedMessage as Message]);
    }
  }

  function startEditMessage(message: Message) {
    setMessageContextMenu(null);
    setEditingMessageId(message.id);
    setEditingMessageContent(message.content);
  }

  function cancelEditMessage() {
    setEditingMessageId("");
    setEditingMessageContent("");
  }

  async function saveEditMessage(message: Message) {
    const trimmed = editingMessageContent.trim();

    if (!trimmed && !message.media_url) {
      setStatus("Message cannot be empty.");
      return;
    }

    setEditingMessageId("");
    setEditingMessageContent("");

    if (trimmed === message.content) return;

    const previousMessage = message;

    const optimisticMessage: Message = {
      ...message,
      content: trimmed,
      edited_at: new Date().toISOString(),
    };

    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? optimisticMessage : item
      )
    );

    const { data: updatedMessage, error } = await supabase
      .from("messages")
      .update({
        content: trimmed,
        edited_at: new Date().toISOString(),
      })
      .eq("id", message.id)
      .select(
        "id, channel_id, user_id, content, created_at, edited_at, media_url, media_path, media_name, media_type, media_size"
      )
      .single();

    if (error) {
      setStatus(error.message);

      setMessages((current) =>
        current.map((item) =>
          item.id === previousMessage.id ? previousMessage : item
        )
      );

      return;
    }

    if (updatedMessage) {
      setMessages((current) =>
        current.map((item) =>
          item.id === updatedMessage.id ? (updatedMessage as Message) : item
        )
      );
    }
  }

  async function deleteMessage(message: Message) {
    setMessageContextMenu(null);

    const confirmed = window.confirm("Delete this message?");

    if (!confirmed) return;

    const previousMessages = messages;
    const previousReactions = messageReactions;

    setMessages((current) =>
      current.filter((item) => item.id !== message.id)
    );

    setMessageReactions((current) =>
      current.filter((reaction) => reaction.message_id !== message.id)
    );

    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", message.id);

    if (error) {
      setStatus(error.message);
      setMessages(previousMessages);
      setMessageReactions(previousReactions);
      return;
    }

    if (message.media_path) {
      const { error: storageError } = await supabase.storage
        .from(MESSAGE_MEDIA_BUCKET)
        .remove([message.media_path]);

      if (storageError) {
        setStatus("Message deleted, but media cleanup failed.");
      }
    }
  }

  async function createInvite() {
    setStatus("");

    if (!currentChannel) {
      setStatus("Channel is still loading.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStatus("You need to sign in first.");
      return;
    }

    const code = crypto.randomUUID().slice(0, 8);

    const { error } = await supabase.from("invites").insert({
      server_id: currentChannel.server_id,
      code,
      created_by: user.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setInviteLink(`${window.location.origin}/invite/${code}`);
  }

  function startCreateChannel(type: "text" | "voice") {
    setCreatingChannelType(type);
    setNewChannelName("");
  }

  async function saveNewChannel() {
    if (!currentChannel || !creatingChannelType) return;

    const cleanName = cleanChannelName(newChannelName);

    setCreatingChannelType("");
    setNewChannelName("");

    if (!cleanName) return;

    const sameTypeChannels = serverChannels.filter(
      (channel) => channel.type === creatingChannelType
    );

    const nextSortOrder =
      sameTypeChannels.length === 0
        ? 0
        : Math.max(...sameTypeChannels.map((channel) => channel.sort_order)) + 1;

    setStatus("");

    const { data: channel, error } = await supabase
      .from("channels")
      .insert({
        server_id: currentChannel.server_id,
        name: cleanName,
        sort_order: nextSortOrder,
        type: creatingChannelType,
      })
      .select("id, server_id, name, sort_order, type")
      .single();

    if (error) {
      setStatus(error.message);
      return;
    }

    if (channel) {
      const newChannel = {
        ...channel,
        type: channel.type ?? creatingChannelType,
      } as Channel;

      setServerChannels((current) => {
        const nextChannels = sortChannels([...current, newChannel]);

        cacheChannels(nextChannels);

        return nextChannels;
      });

      if (newChannel.type === "text") {
        window.location.href = `/channels/${newChannel.id}`;
      }
    }
  }

  function startRenameChannel(channel: Channel) {
    setEditingChannelId(channel.id);
    setEditingChannelName(channel.name);
  }

  function cancelRenameChannel() {
    setEditingChannelId("");
    setEditingChannelName("");
  }

  async function saveRenameChannel(channel: Channel, nextName: string) {
    const cleanName = cleanChannelName(nextName);

    setEditingChannelId("");
    setEditingChannelName("");

    if (!cleanName || cleanName === channel.name) {
      return;
    }

    setStatus("");

    const { error } = await supabase
      .from("channels")
      .update({ name: cleanName })
      .eq("id", channel.id);

    if (error) {
      setStatus(error.message);
      return;
    }

    setServerChannels((current) => {
      const nextChannels = current.map((item) =>
        item.id === channel.id ? { ...item, name: cleanName } : item
      );

      cacheChannels(nextChannels);

      return nextChannels;
    });

    if (currentChannel?.id === channel.id) {
      setCurrentChannel({ ...currentChannel, name: cleanName });
    }
  }

  async function saveChannelOrder(nextChannels: Channel[]) {
    const reorderedChannels = nextChannels.map((channel, index) => ({
      ...channel,
      sort_order: index,
    }));

    setServerChannels(reorderedChannels);
    cacheChannels(reorderedChannels);

    setDraggingChannelId("");
    setStatus("");

    const updates = reorderedChannels.map((channel) =>
      supabase
        .from("channels")
        .update({ sort_order: channel.sort_order })
        .eq("id", channel.id)
    );

    const results = await Promise.all(updates);
    const failedUpdate = results.find((result) => result.error);

    if (failedUpdate?.error) {
      setStatus(failedUpdate.error.message);
    }
  }

  function handleChannelDrop(targetChannelId: string) {
    if (!draggingChannelId || draggingChannelId === targetChannelId) {
      setDraggingChannelId("");
      return;
    }

    const sorted = sortChannels(serverChannels);

    const draggedIndex = sorted.findIndex(
      (channel) => channel.id === draggingChannelId
    );

    const targetIndex = sorted.findIndex(
      (channel) => channel.id === targetChannelId
    );

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggingChannelId("");
      return;
    }

    const nextChannels = [...sorted];
    const [draggedChannel] = nextChannels.splice(draggedIndex, 1);

    nextChannels.splice(targetIndex, 0, draggedChannel);

    saveChannelOrder(nextChannels);
  }

  async function deleteChannel(channel: Channel) {
    const textChannels = serverChannels.filter((item) => item.type === "text");

    if (channel.type === "text" && textChannels.length <= 1) {
      setStatus("You need at least one text channel in a server.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${channel.type === "voice" ? "🔊" : "#"} ${
        channel.name
      }? This cannot be undone.`
    );

    if (!confirmed) return;

    setStatus("");

    const { error } = await supabase
      .from("channels")
      .delete()
      .eq("id", channel.id);

    if (error) {
      setStatus(error.message);
      return;
    }

    const remainingChannels = serverChannels.filter(
      (item) => item.id !== channel.id
    );

    setServerChannels(remainingChannels);
    cacheChannels(remainingChannels);

    if (voiceCall?.channelId === channel.id) {
      leaveVoiceCall();
    }

    if (channel.id === channelId) {
      const nextTextChannel = sortChannels(remainingChannels).find(
        (item) => item.type === "text"
      );

      if (nextTextChannel) {
        window.location.href = `/channels/${nextTextChannel.id}`;
      } else {
        window.location.href = "/";
      }
    }
  }

  const sortedServerChannels = sortChannels(serverChannels);
  const textChannels = sortedServerChannels.filter(
    (channel) => channel.type === "text"
  );
  const voiceChannels = sortedServerChannels.filter(
    (channel) => channel.type === "voice"
  );

  const sortedOnlineUserIds = [...onlineUserIds].sort((a, b) =>
    getProfileName(a).localeCompare(getProfileName(b))
  );

  const selectedContextMessage = messageContextMenu
    ? messages.find((message) => message.id === messageContextMenu.messageId)
    : null;

  const typingText = getTypingText();

  return (
    <main className={styles.page} data-theme={theme}>
      <aside className={styles.sidebar}>
        <h2>Bubbles</h2>

        <Link className={styles.homeLink} href="/">
          Home
        </Link>

        {currentChannel && isOwner && (
          <Link
            className={styles.homeLink}
            href={`/servers/${currentChannel.server_id}/settings`}
          >
            Server Settings
          </Link>
        )}

        <div className={styles.channelGroup}>
          <div className={styles.channelGroupHeader}>
            <span className={styles.channelGroupTitle}>Text Channels</span>

            {isOwner && (
              <button
                type="button"
                className={styles.addChannelButton}
                onClick={() => startCreateChannel("text")}
                title="Create text channel"
              >
                +
              </button>
            )}
          </div>

          {creatingChannelType === "text" && (
            <input
              className={styles.newChannelInput}
              value={newChannelName}
              onChange={(event) => setNewChannelName(event.target.value)}
              onBlur={saveNewChannel}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }

                if (event.key === "Escape") {
                  setCreatingChannelType("");
                  setNewChannelName("");
                }
              }}
              placeholder="text-channel"
              autoFocus
            />
          )}

          {textChannels.map((channel) => {
            const unreadCount = unreadByChannelId[channel.id] ?? 0;

            return (
              <div
                key={channel.id}
                className={`${styles.channelRow} ${
                  channel.id === channelId ? styles.activeChannelRow : ""
                } ${
                  draggingChannelId === channel.id
                    ? styles.draggingChannelRow
                    : ""
                }`}
                draggable={isOwner && editingChannelId !== channel.id}
                onDragStart={(event) => {
                  if (!isOwner || editingChannelId === channel.id) return;

                  setDraggingChannelId(channel.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", channel.id);
                }}
                onDragOver={(event) => {
                  if (!isOwner || !draggingChannelId) return;

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();

                  if (!isOwner) return;

                  handleChannelDrop(channel.id);
                }}
                onDragEnd={() => {
                  setDraggingChannelId("");
                }}
              >
                {editingChannelId === channel.id ? (
                  <input
                    className={styles.channelNameInput}
                    value={editingChannelName}
                    onChange={(event) =>
                      setEditingChannelName(event.target.value)
                    }
                    onBlur={() =>
                      saveRenameChannel(channel, editingChannelName)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }

                      if (event.key === "Escape") {
                        cancelRenameChannel();
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <Link
                    href={`/channels/${channel.id}`}
                    className={styles.channelLink}
                    onClick={() => clearUnreadForChannel(channel.id)}
                  >
                    <span className={styles.dragHandle}>
                      {isOwner ? "⋮⋮" : "#"}
                    </span>
                    <span className={styles.channelNameText}>
                      # {channel.name}
                    </span>
                  </Link>
                )}

                {unreadCount > 0 && channel.id !== channelId && (
                  <span className={styles.unreadBadge}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}

                {isOwner && editingChannelId !== channel.id && (
                  <div className={styles.channelActions}>
                    <button
                      type="button"
                      onClick={() => startRenameChannel(channel)}
                      title="Rename"
                    >
                      ✎
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteChannel(channel)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.channelGroup}>
          <div className={styles.channelGroupHeader}>
            <span className={styles.channelGroupTitle}>Voice Channels</span>

            {isOwner && (
              <button
                type="button"
                className={styles.addChannelButton}
                onClick={() => startCreateChannel("voice")}
                title="Create voice channel"
              >
                +
              </button>
            )}
          </div>

          {creatingChannelType === "voice" && (
            <input
              className={styles.newChannelInput}
              value={newChannelName}
              onChange={(event) => setNewChannelName(event.target.value)}
              onBlur={saveNewChannel}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }

                if (event.key === "Escape") {
                  setCreatingChannelType("");
                  setNewChannelName("");
                }
              }}
              placeholder="voice-channel"
              autoFocus
            />
          )}

          {voiceChannels.length === 0 ? (
            <p className={styles.emptyVoiceChannels}>No voice channels yet.</p>
          ) : (
            voiceChannels.map((channel) => (
              <div
                key={channel.id}
                className={`${styles.channelRow} ${
                  voiceCall?.channelId === channel.id
                    ? styles.activeVoiceChannelRow
                    : ""
                } ${
                  draggingChannelId === channel.id
                    ? styles.draggingChannelRow
                    : ""
                }`}
                draggable={isOwner && editingChannelId !== channel.id}
                onDragStart={(event) => {
                  if (!isOwner || editingChannelId === channel.id) return;

                  setDraggingChannelId(channel.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", channel.id);
                }}
                onDragOver={(event) => {
                  if (!isOwner || !draggingChannelId) return;

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();

                  if (!isOwner) return;

                  handleChannelDrop(channel.id);
                }}
                onDragEnd={() => {
                  setDraggingChannelId("");
                }}
              >
                {editingChannelId === channel.id ? (
                  <input
                    className={styles.channelNameInput}
                    value={editingChannelName}
                    onChange={(event) =>
                      setEditingChannelName(event.target.value)
                    }
                    onBlur={() =>
                      saveRenameChannel(channel, editingChannelName)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }

                      if (event.key === "Escape") {
                        cancelRenameChannel();
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.voiceChannelButton}
                    onClick={() => startVoiceCall(channel)}
                  >
                    <span className={styles.dragHandle}>
                      {isOwner ? "⋮⋮" : "🔊"}
                    </span>
                    <span className={styles.channelNameText}>
                      🔊 {channel.name}
                    </span>
                  </button>
                )}

                {isOwner && editingChannelId !== channel.id && (
                  <div className={styles.channelActions}>
                    <button
                      type="button"
                      onClick={() => startRenameChannel(channel)}
                      title="Rename"
                    >
                      ✎
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteChannel(channel)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <button className={styles.inviteButton} onClick={createInvite}>
          Create invite
        </button>

        {inviteLink && (
          <input className={styles.inviteInput} value={inviteLink} readOnly />
        )}
      </aside>

      <section className={styles.chat}>
        <header className={styles.header}>
          <h1># {currentChannel?.name ?? "channel"}</h1>

          {(voiceCall || isJoiningVoice) && (
            <div className={styles.callHeaderStatus}>
              {isJoiningVoice
                ? "Joining voice..."
                : `In voice: ${voiceCall?.channelName}`}
            </div>
          )}
        </header>

        {voiceCall && (
          <section className={styles.voiceCallPanel}>
            <div className={styles.voiceCallTopbar}>
              <div>
                <strong>🔊 {voiceCall.channelName}</strong>
                <span>Audio, video, and screen share</span>
              </div>

              <button type="button" onClick={leaveVoiceCall}>
                Leave Call
              </button>
            </div>

            <div ref={dailyContainerRef} className={styles.dailyContainer} />
          </section>
        )}

        <div className={styles.messages}>
          {messages.map((message) => {
            const isEditing = editingMessageId === message.id;
            const reactionGroups = getReactionGroups(message.id);
            const messageAvatarKey = `message-${message.id}`;

            return (
              <article
                key={message.id}
                className={styles.message}
                onContextMenu={(event) =>
                  openMessageContextMenu(event, message)
                }
              >
                <div className={styles.messageHeader}>
                  <div
                    className={styles.messageAvatar}
                    onMouseEnter={() => setHoveredAvatarKey(messageAvatarKey)}
                    onMouseLeave={() => setHoveredAvatarKey("")}
                  >
                    {renderHoverAvatar(message.user_id, messageAvatarKey)}
                  </div>

                  <div className={styles.messageBody}>
                    <div className={styles.messageMeta}>
                      <strong>{getProfileName(message.user_id)}</strong>
                      <time>{new Date(message.created_at).toLocaleString()}</time>
                      {message.edited_at && (
                        <span className={styles.editedLabel}>edited</span>
                      )}
                    </div>

                    {isEditing ? (
                      <input
                        className={styles.messageEditInput}
                        value={editingMessageContent}
                        onChange={(event) =>
                          setEditingMessageContent(event.target.value)
                        }
                        onBlur={() => saveEditMessage(message)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }

                          if (event.key === "Escape") {
                            cancelEditMessage();
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <>
                        {message.content.trim() && <p>{message.content}</p>}
                        {renderMessageMedia(message)}
                      </>
                    )}

                    {reactionGroups.length > 0 && (
                      <div className={styles.reactionList}>
                        {reactionGroups.map((reaction) => (
                          <button
                            key={reaction.emoji}
                            type="button"
                            className={`${styles.reactionPill} ${
                              reaction.reactedByCurrentUser
                                ? styles.activeReactionPill
                                : ""
                            }`}
                            onClick={() =>
                              toggleReaction(message, reaction.emoji)
                            }
                            title={
                              reaction.reactedByCurrentUser
                                ? "Remove reaction"
                                : "Add reaction"
                            }
                          >
                            <span>{reaction.emoji}</span>
                            <strong>{reaction.count}</strong>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className={styles.typingIndicator}>{typingText}</div>

        {status && <p className={styles.status}>{status}</p>}

        <div className={styles.composer}>
          {selectedMediaFile && selectedMediaPreviewUrl && (
            <div className={styles.selectedMediaPreview}>
              <div className={styles.selectedMediaContent}>
                {selectedMediaFile.type.startsWith("image/") ? (
                  <img
                    src={selectedMediaPreviewUrl}
                    alt={selectedMediaFile.name}
                  />
                ) : (
                  <video src={selectedMediaPreviewUrl} controls />
                )}

                <div>
                  <strong>{selectedMediaFile.name}</strong>
                  <span>
                    {(selectedMediaFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              </div>

              <button type="button" onClick={clearSelectedMedia}>
                Remove
              </button>
            </div>
          )}

          <form className={styles.form} onSubmit={sendMessage}>
            <label className={styles.attachButton} title="Attach image or video">
              +
              <input
                className={styles.mediaInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                onChange={handleMediaChange}
              />
            </label>

            <input
              value={content}
              onChange={handleContentChange}
              placeholder={`Message #${currentChannel?.name ?? "channel"}`}
            />

            <button disabled={isSending}>
              {isSending ? "Sending..." : "Send"}
            </button>
          </form>
        </div>

        {messageContextMenu && selectedContextMessage && (
          <div
            className={styles.messageContextMenu}
            style={{
              left: messageContextMenu.x,
              top: messageContextMenu.y,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.reactionMenu}>
              {reactionEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => toggleReaction(selectedContextMessage, emoji)}
                  title={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {selectedContextMessage.user_id === currentUserId && (
              <>
                <button
                  type="button"
                  onClick={() => startEditMessage(selectedContextMessage)}
                >
                  Edit message
                </button>

                <button
                  type="button"
                  className={styles.dangerContextButton}
                  onClick={() => deleteMessage(selectedContextMessage)}
                >
                  Delete message
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <aside className={styles.membersPanel}>
        <div className={styles.membersHeader}>
          <h2>Active now</h2>
          <span>{sortedOnlineUserIds.length}</span>
        </div>

        <div className={styles.memberList}>
          {sortedOnlineUserIds.length === 0 ? (
            <p className={styles.emptyMembers}>No one is online yet.</p>
          ) : (
            sortedOnlineUserIds.map((userId) => {
              const memberAvatarKey = `member-${userId}`;

              return (
                <div className={styles.memberRow} key={userId}>
                  <div
                    className={styles.memberAvatar}
                    onMouseEnter={() => setHoveredAvatarKey(memberAvatarKey)}
                    onMouseLeave={() => setHoveredAvatarKey("")}
                  >
                    {renderHoverAvatar(userId, memberAvatarKey)}
                    <span className={styles.onlineDot} />
                  </div>

                  <div className={styles.memberText}>
                    <strong>{getProfileName(userId)}</strong>
                    <span>{getProfileUsername(userId)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.currentUserCard}>
          <Link
            className={styles.currentUserAvatarLink}
            href={`/profile?returnTo=${encodeURIComponent(
              `/channels/${channelId}`
            )}`}
            title="Open profile"
          >
            <div className={styles.currentUserAvatar}>
              {currentUserId && getAvatarUrl(currentUserId) ? (
                <img
                  className={styles.avatarImage}
                  src={getAvatarUrl(currentUserId)}
                  alt={`${getProfileName(currentUserId)} avatar`}
                />
              ) : currentUserId ? (
                getAvatarInitial(currentUserId)
              ) : (
                "?"
              )}
            </div>
          </Link>

          <div className={styles.currentUserText}>
            <strong>
              {currentUserId ? getProfileName(currentUserId) : "Loading"}
            </strong>
            <span>
              {currentUserId ? getProfileUsername(currentUserId) : "@loading"}
            </span>
          </div>

          <button
            type="button"
            className={styles.themeButton}
            onClick={toggleTheme}
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          <button
            type="button"
            className={`${styles.notificationButton} ${
              notificationsEnabled ? styles.notificationButtonActive : ""
            }`}
            onClick={toggleNotifications}
            title={
              notificationsEnabled
                ? "Mute app notifications"
                : "Enable app notifications"
            }
          >
            {notificationsEnabled ? "🔔" : "🔕"}
          </button>
        </div>
      </aside>
    </main>
  );
}