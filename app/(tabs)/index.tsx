import { useFocusEffect, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const morningImages = [
  require("../../assets/images/morning-nature-1.jpg"),
  require("../../assets/images/morning-nature-2.jpg"),
  require("../../assets/images/morning-nature-3.jpg"),
  require("../../assets/images/morning-nature-4.jpg"),
];

type Entry = {
  id: string;
  title: string | null;
  content: string;
  type: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  resolution_note: string | null;
  archived_at: string | null;
  retired_at: string | null;
  needs_read: boolean;
  last_read_at: string | null;
  next_due_at: string | null;
  schedule_mode: string;
  due_date: string | null;
  due_time: string | null;
  interval_value: number | null;
  interval_unit: string | null;
  annual_month: number | null;
  annual_day: number | null;
  anchor_date: string | null;
  digest_assignment: "none" | "daily" | "weekly" | "monthly" | "yearly";
  last_surface_at: string | null;
  last_surface_window_key: string | null;
};

type DailyMessage = {
  id: string;
  message: string;
  message_text?: string;
  verse_reference: string | null;
  verse_query: string | null;
  message_date: string;
};

type UpcomingEntry = Entry & {
  cadence: "daily" | "weekly" | "monthly" | "yearly" | "custom" | "none";
  next_run_at: Date | null;
  surface_label: string;
};

type WeekdayValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type ProfileDigestSettings = {
  daily_digest_time: string | null;
  weekly_digest_day_of_week: WeekdayValue | null;
  weekly_digest_time: string | null;
};

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeLabel(time?: string | null) {
  if (!time) return "";

  const parts = time.split(":");
  if (parts.length < 2) return time;

  const hour24 = Number(parts[0]);
  const minute = parts[1];

  if (Number.isNaN(hour24)) return time;

  const hour12 = hour24 % 12 || 12;
  const ampm = hour24 >= 12 ? "PM" : "AM";

  return `${hour12}:${minute} ${ampm}`;
}

function formatDisplayTime(time: string | null) {
  if (!time) return "Not set";

  const [hours, minutes] = time.split(":");
  const hourNum = Number(hours);
  const minuteNum = Number(minutes);

  const suffix = hourNum >= 12 ? "PM" : "AM";
  const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;

  return `${displayHour}:${String(minuteNum).padStart(2, "0")} ${suffix}`;
}

function weekdayLabel(day: WeekdayValue) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
}

function getEntryScheduleSummary(entry: Entry | UpcomingEntry) {
   if (entry.digest_assignment !== "none" && entry.schedule_mode === "none") {
    return null;
  }

  if (entry.schedule_mode === "daily_time") {
    return entry.due_time
      ? `Daily at ${formatTimeLabel(entry.due_time)}`
      : "Daily";
  }

  if (entry.schedule_mode === "fixed_date") {
    if (!entry.due_date) return "One date";

    const dateText = new Date(`${entry.due_date}T00:00:00`).toLocaleDateString();
    return entry.due_time
      ? `${dateText} at ${formatTimeLabel(entry.due_time)}`
      : dateText;
  }

  if (entry.schedule_mode === "interval") {
    if (!entry.interval_value || !entry.interval_unit) return "Repeats";

    const unit =
      entry.interval_value === 1
        ? entry.interval_unit.replace(/s$/, "")
        : entry.interval_unit;

    return `Every ${entry.interval_value} ${unit}`;
  }

  if (entry.schedule_mode === "annual_date") {
    if (!entry.annual_month || !entry.annual_day) return "Yearly";

    const dateText = new Date(
      2026,
      Math.max(0, entry.annual_month - 1),
      entry.annual_day
    ).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
    });

    return entry.due_time
      ? `Every year on ${dateText} at ${formatTimeLabel(entry.due_time)}`
      : `Every year on ${dateText}`;
  }

  return "No schedule";
}

function formatUpcomingLabel(nextRunAt: Date | null) {
  if (!nextRunAt) return "";

  const now = new Date();
  const target = nextRunAt;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  const dayDiff = Math.round(
    (targetStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timeLabel = target.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (dayDiff === 0) return `Today • ${timeLabel}`;
  if (dayDiff === 1) return `Tomorrow • ${timeLabel}`;
  if (dayDiff > 1 && dayDiff <= 7) return `In ${dayDiff} days • ${timeLabel}`;

  return target.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}


export default function HomeScreen() {
  const [dailyMessages, setDailyMessages] = useState<DailyMessage[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [verseText, setVerseText] = useState<string | null>(null);
  const [showVerseModal, setShowVerseModal] = useState(false);
  const [showCadenceMenu, setShowCadenceMenu] = useState(false);
  const [activeEntries, setActiveEntries] = useState<Entry[]>([]);
  const [selectedCadenceFilter, setSelectedCadenceFilter] = useState<
    "all" | "daily" | "weekly" | "monthly" | "yearly"
  >("all");
  const [selectedEntry, setSelectedEntry] = useState<UpcomingEntry | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [messageSectionHeight, setMessageSectionHeight] = useState(0);

  const [isRegeneratingMessage, setIsRegeneratingMessage] = useState(false);
  const [isBrowseMode, setIsBrowseMode] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const messageScrollRef = useRef<ScrollView | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const hasAutoScrolledSearchRef = useRef(false);
  const suppressAutoBrowseModeRef = useRef(false);
  const route = useRoute();
  const resetHomeAt =
    typeof (route.params as { resetHomeAt?: number | string } | undefined)?.resetHomeAt !== "undefined"
      ? (route.params as { resetHomeAt?: number | string }).resetHomeAt
      : undefined;

  const messageFadeAnim = useRef(new Animated.Value(0)).current;
  const [backgroundImage] = useState(
    morningImages[Math.floor(Math.random() * morningImages.length)]
  );

const messageCardWidth = Dimensions.get("window").width - 40;
const currentDailyMessage = dailyMessages[currentMessageIndex] ?? null;

const hasActiveSearch = searchText.trim().length > 0;
const hasActiveFilter = selectedCadenceFilter !== "all";
const shouldPinFloatingHeader = hasActiveSearch || hasActiveFilter;

const showFloatingHeader = isBrowseMode || shouldPinFloatingHeader;
  const [profileDigestSettings, setProfileDigestSettings] = useState<ProfileDigestSettings>({
    daily_digest_time: null,
    weekly_digest_day_of_week: null,
    weekly_digest_time: null,
  });

function openComposeModal() {
  router.push({
    pathname: "/compose",
    params: {
      mode: "create",
    },
  });
}

useEffect(() => {
  if (!resetHomeAt) return;

  suppressAutoBrowseModeRef.current = true;
  setShowSearch(false);
  setSearchText("");
  setSelectedCadenceFilter("all");
  setScrollY(0);
  setIsBrowseMode(false);
  Keyboard.dismiss();
  scrollViewRef.current?.scrollTo({ y: 0, animated: false });
}, [resetHomeAt]);

useEffect(() => {
  if (shouldPinFloatingHeader) return;

  if (!isBrowseMode && scrollY >= 40) {
    setIsBrowseMode(true);
  }
}, [scrollY, isBrowseMode, shouldPinFloatingHeader]);


  async function loadProfileDigestSettings() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load profile digest settings user error:", userError?.message);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("daily_digest_time, weekly_digest_day_of_week, weekly_digest_time")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.log("Load profile digest settings error:", error.message);
      return;
    }

    setProfileDigestSettings({
      daily_digest_time: data?.daily_digest_time ?? null,
      weekly_digest_day_of_week:
        typeof data?.weekly_digest_day_of_week === "number"
          ? (data.weekly_digest_day_of_week as WeekdayValue)
          : null,
      weekly_digest_time: data?.weekly_digest_time ?? null,
    });
  }

  async function loadMessage() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("No user found for daily message load");
      return false;
    }

    const today = new Date();
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(today.getDate() - 2);

    const todayString = formatLocalDate(today);
    const twoDaysAgoString = formatLocalDate(twoDaysAgo);

    const { data, error } = await supabase
      .from("daily_messages")
      .select("id, message_text, verse_reference, verse_query, message_date")
      .eq("user_id", user.id)
      .gte("message_date", twoDaysAgoString)
      .lte("message_date", todayString)
      .order("message_date", { ascending: false });

    console.log("daily messages result:", data, error);

    if (error) {
      console.log("Daily message load error:", error.message);
      return false;
    }

    if (data && data.length > 0) {
      setDailyMessages(
        data.map((item) => ({
          ...item,
          message: item.message_text,
        }))
      );

      setCurrentMessageIndex(0);

      requestAnimationFrame(() => {
        messageScrollRef.current?.scrollTo({
          x: 0,
          animated: false,
        });
      });

      messageFadeAnim.setValue(0);
      Animated.timing(messageFadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }).start();

      const hasToday = data.some((item) => item.message_date === todayString);
      return hasToday;
    }

    return false;
  }

    async function generateDailyMessage(forceRegenerate = false) {
    try {
      if (forceRegenerate) {
        setIsRegeneratingMessage(true);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      console.log("Generating daily message...", { forceRegenerate });

  const { data: activeContextEntries, error: activeContextError } = await supabase
  .from("entries")
  .select("id, type, title, content, status, schedule_mode, next_due_at")
  .eq("status", "active")
  .in("type", ["prayer", "goal", "affirmation"])
  .order("updated_at", { ascending: false })
  .limit(8);

      if (activeContextError) {
        console.log("Load active entries for daily message error:", activeContextError.message);
      }

      const { data, error } = await supabase.functions.invoke("generate-entry", {
        body: {
          mode: "daily",
          activeEntries: activeContextEntries ?? [],
          forceRegenerate,
        },
        headers: session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : {},
      });

      console.log("Daily message function response:", data);
      console.log("Daily message function error:", error);

      if (error) {
        console.log("Daily message generation error:", error);
        Alert.alert("Could not regenerate", "Please try again.");
        return;
      }

      await loadMessage();
    } catch (err) {
      console.log("Unexpected daily generation error:", err);
      Alert.alert("Could not regenerate", "Please try again.");
    } finally {
      setIsRegeneratingMessage(false);
    }
  }

async function loadEntries() {
  const { data, error } = await supabase
    .from("entries")
    .select(
     "id, title, content, type, status, created_at, updated_at, resolution_note, archived_at, retired_at, needs_read, last_read_at, next_due_at, schedule_mode, due_date, due_time, interval_value, interval_unit, annual_month, annual_day, anchor_date, digest_assignment, last_surface_at, last_surface_window_key"
    )
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) {
    console.log("Load active entries error:", error.message);
    return;
  }

  setActiveEntries((data as Entry[]) ?? []);
}

  async function loadVerse(reference: string) {
    console.log("Loading verse for reference:", reference);

    const { data, error } = await supabase
      .from("bible_verses")
      .select("verse_text")
      .eq("reference", reference)
      .maybeSingle();

    console.log("Verse query result:", data, error);

    if (error) {
      console.log("Verse load error:", error.message);
      return;
    }

    if (data?.verse_text) {
      setVerseText(data.verse_text);
      setShowVerseModal(true);
    } else {
      console.log("No verse found for reference:", reference);
    }
  }

  const archiveEntry = async (id: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("No user found for archive");
      return;
    }

    const { error } = await supabase.rpc("archive_entry", {
      p_entry_id: id,
      p_user_id: user.id,
    });

    if (error) {
      console.log("archive_entry error:", error.message);
      return;
    }

    if (selectedEntry?.id === id) {
      setShowEntryModal(false);
      setSelectedEntry(null);
    }

    await loadEntries();
  };

    const deleteEntry = async (id: string) => {
    const { error } = await supabase.from("entries").delete().eq("id", id);

    if (error) {
      console.log("Error deleting entry:", error.message);
      return;
    }

 if (selectedEntry?.id === id) {
  setShowEntryModal(false);
  setSelectedEntry(null);
}
    await loadEntries();
  };

  const confirmDeleteEntry = (id: string) => {
    Alert.alert("Delete entry?", "This will permanently delete this entry.", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteEntry(id),
      },
    ]);
  };
const openEntry = async (entry: UpcomingEntry) => {
  setSelectedEntry(entry);
  setShowEntryModal(true);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("No user found for view_entry");
    return;
  }

  const { data, error } = await supabase.rpc("view_entry", {
    p_entry_id: entry.id,
    p_user_id: user.id,
  });

  if (error) {
    console.log("view_entry error:", error.message);
    return;
  }

  if (data) {
    setSelectedEntry((current) =>
      current
        ? {
            ...current,
            ...data,
            next_run_at: data.next_due_at ? new Date(data.next_due_at) : null,
          }
        : current
    );
  }

  await loadEntries();
};

useEffect(() => {
  async function initialize() {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      await supabase.auth.signInAnonymously();
      console.log("Anonymous user signed in");
    }

    const foundMessage = await loadMessage();

    if (!foundMessage) {
      await generateDailyMessage();
    }

       await loadEntries();
      await loadProfileDigestSettings();
  }

  initialize();
}, []);

   useFocusEffect(
    useCallback(() => {
      loadEntries();
      loadProfileDigestSettings();

      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      });
    }, [])
  );

  useEffect(() => {
  if (selectedCadenceFilter === "all") return;

  const targetY = Math.max(140, messageSectionHeight - 40);

  requestAnimationFrame(() => {
    scrollViewRef.current?.scrollTo({
      y: targetY,
      animated: true,
    });
  });
}, [selectedCadenceFilter, messageSectionHeight]);

      useEffect(() => {
        const query = searchText.trim();

        if (!showSearch) {
          hasAutoScrolledSearchRef.current = false;
          return;
        }

        if (!query) {
          hasAutoScrolledSearchRef.current = false;
          return;
        }

        if (hasAutoScrolledSearchRef.current) return;

        const targetY = Math.max(140, messageSectionHeight - 40);

        hasAutoScrolledSearchRef.current = true;

        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollTo({
            y: targetY,
            animated: true,
          });
        });
      }, [searchText, showSearch, messageSectionHeight]);

  const filteredActiveEntries = useMemo(() => {
    const query = searchText.toLowerCase();

    return activeEntries.filter((entry) => {
      return (
        entry.content?.toLowerCase().includes(query) ||
        entry.title?.toLowerCase().includes(query)
      );
    });
  }, [activeEntries, searchText]);

const upcomingEntries = useMemo<UpcomingEntry[]>(() => {
  const now = new Date();

  return filteredActiveEntries
    .filter((entry) => {
      if (selectedCadenceFilter === "all") {
        return true;
      }

      return entry.digest_assignment === selectedCadenceFilter;
    })
    .map((entry) => {
      const nextRun = entry.next_due_at ? new Date(entry.next_due_at) : null;

      const cadence =
        entry.digest_assignment === "daily" ||
        entry.digest_assignment === "weekly" ||
        entry.digest_assignment === "monthly" ||
        entry.digest_assignment === "yearly"
          ? entry.digest_assignment
          : entry.schedule_mode !== "none"
          ? "custom"
          : "none";

       const surfaceLabel =
        entry.digest_assignment === "daily"
          ? `Daily Reminder • ${formatDisplayTime(profileDigestSettings.daily_digest_time ?? "07:00:00")}`
          : entry.digest_assignment === "weekly"
          ? `Weekly Reminder • ${weekdayLabel(
              profileDigestSettings.weekly_digest_day_of_week ?? 0
            )} • ${formatDisplayTime(profileDigestSettings.weekly_digest_time ?? "08:00:00")}`
          : entry.digest_assignment === "monthly"
          ? "Monthly Reminder"
          : entry.digest_assignment === "yearly"
          ? "Yearly Reminder"
          : entry.schedule_mode !== "none"
          ? "Custom schedule"
          : "Ungrouped";

      return {
        ...entry,
        cadence,
        next_run_at: nextRun && nextRun >= now ? nextRun : nextRun,
        surface_label: surfaceLabel,
      };
    })
    .sort((a, b) => {
      if (!a.next_run_at && !b.next_run_at) {
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bCreated - aCreated;
      }

      if (!a.next_run_at) return 1;
      if (!b.next_run_at) return -1;

      return a.next_run_at.getTime() - b.next_run_at.getTime();
    });
}, [filteredActiveEntries, selectedCadenceFilter, profileDigestSettings]);
 
   function renderHomeHeaderContent(isFloating = Boolean) {
    return (
      <>
        {!isFloating && (
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.7)",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.7)",
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 2,
              marginBottom: 14,
            }}
          >
            <Pressable
              onPress={openComposeModal}
              style={{
                padding: 14,
                minHeight: 100,
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: "#5f6368",
                  lineHeight: 26,
                  fontSize: 16,
                }}
                numberOfLines={4}
              >
                Tap to write what's on your mind... a prayer, goal, affirmation or just a reminder.
              </Text>
            </Pressable>
          </View>
        )}

        {isFloating && (
          <View
            style={{
              marginBottom: 8,
              padding: 0,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Pressable
                onPress={() => {
                  setShowCadenceMenu(true);
                }}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 13,
                  borderRadius: 10,
                  backgroundColor: "rgba(40,40,40,0.85)",
                  marginRight: 12,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "white" }}>
                  {selectedCadenceFilter === "all"
                    ? "All"
                    : selectedCadenceFilter === "daily"
                    ? "Daily"
                    : selectedCadenceFilter === "weekly"
                    ? "Weekly"
                    : selectedCadenceFilter === "monthly"
                    ? "Monthly"
                    : "Yearly"} ▼
                </Text>
              </Pressable>

              <View style={{ flex: 1 }} />

              <Pressable
                onPress={() => {
                  suppressAutoBrowseModeRef.current = true;
                  setShowSearch(false);
                  setSearchText("");
                  setSelectedCadenceFilter("all");
                  setScrollY(0);
                  setIsBrowseMode(false);
                  Keyboard.dismiss();
                  scrollViewRef.current?.scrollTo({ y: 0, animated: false });
                }}
                style={{
                  marginLeft: 8,
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: "rgba(40,40,40,0.85)",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "white" }}>
                  Close/Return
                </Text>
              </Pressable>
            </View>

            <View style={{ marginBottom: 14, position: "relative" }}>
              <TextInput
                ref={searchInputRef}
                placeholder="Search entries..."
                value={searchText}
                onChangeText={setSearchText}
                style={{
                  backgroundColor: "white",
                  borderWidth: 1,
                  borderColor: "#d8d8d8",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingRight: 44,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "black",
                }}
              />

              {!!searchText.trim() && (
                <Pressable
                  onPress={() => {
                    setSearchText("");
                    searchInputRef.current?.focus();
                  }}
                  hitSlop={10}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    padding: 2,
                  }}
                >
                  <Text style={{ fontSize: 16, color: "#777", fontWeight: "600" }}>×</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </>
    );
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
 <ImageBackground
  source={backgroundImage}
  resizeMode="cover"
  style={{ flex: 1 }}
>
  <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>

 <LinearGradient
  pointerEvents="none"
  colors={[
    "rgba(255,255,255,0.10)",
    "rgba(255,255,255,0.24)",
    "rgba(255,255,255,0.48)",
  ]}
  style={{
    ...StyleSheet.absoluteFillObject,
  }}
/>
   <KeyboardAvoidingView
  style={{ flex: 1 }}
  behavior={Platform.OS === "ios" ? "padding" : "height"}
>
  <View style={{ flex: 1 }}>
<ScrollView
  ref={scrollViewRef}
  keyboardShouldPersistTaps="handled"
  keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
  showsVerticalScrollIndicator={false}
  onScroll={(event) => {
    const nextScrollY = event.nativeEvent.contentOffset.y;
    setScrollY(nextScrollY);

    if (suppressAutoBrowseModeRef.current) {
      if (nextScrollY <= 8) {
        suppressAutoBrowseModeRef.current = false;
      }
      return;
    }

     if (!isBrowseMode && nextScrollY >= 40) {
      setIsBrowseMode(true);
    }
  }}
  scrollEventThrottle={16}
  contentContainerStyle={{ paddingBottom: 240 }}
>
  {!showFloatingHeader && (
    <View>
      <Pressable
        onPress={() => generateDailyMessage(true)}
        style={{
          marginHorizontal: 20,
          marginBottom: 10,
          alignSelf: "stretch",
        }}
      >
        <Text
          style={{
            textAlign: "center",
            fontSize: 18,
            fontWeight: "700",
            color: "#111",
            letterSpacing: 0.2,
          }}
        >
          Morning Message
          {currentDailyMessage?.message_date
            ? ` - ${new Date(currentDailyMessage.message_date).toLocaleDateString()}`
            : ""}
        </Text>
      </Pressable>

      <View
        onLayout={(event) => {
          setMessageSectionHeight(event.nativeEvent.layout.height + 58);
        }}
        style={{
          marginBottom: 24,
          marginHorizontal: 20,
          minHeight: 240,
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.7)",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.70)",
          overflow: "hidden",
          paddingVertical: 18,
        }}
      >
          {dailyMessages.length > 0 ? (
          <>
            <ScrollView
              ref={messageScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const screenWidth = event.nativeEvent.layoutMeasurement.width;
                const index = Math.round(
                  event.nativeEvent.contentOffset.x / screenWidth
                );
                setCurrentMessageIndex(index);
              }}
              style={{ width: "100%" }}
              contentContainerStyle={{ alignItems: "stretch" }}
            >
              {dailyMessages.map((item, index) => (
                <View
                  key={item.id ?? `${item.message_date}-${index}`}
                  style={{
                    width: messageCardWidth,
                    paddingHorizontal: 18,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                     <Animated.Text
                      style={{
                        fontSize: 18,
                        textAlign: "center",
                        color: "#111",
                        lineHeight: 26,
                        marginBottom: 10,
                        fontWeight: "500",
                        opacity: messageFadeAnim,
                      }}
                    >
                      {item.message}
                    </Animated.Text>

                  <Pressable
                    hitSlop={12}
                    onPress={() => {
                      if (item.verse_reference) {
                        loadVerse(item.verse_reference);
                      }
                    }}
                    style={{
                      marginTop: 6,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#111",
                        textAlign: "center",
                        letterSpacing: 0.3,
                        textDecorationLine: "underline",
                        fontWeight: "600",
                      }}
                    >
                      {item.verse_reference ? `Read ${item.verse_reference}` : " "}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                marginTop: 10,
                gap: 8,
              }}
            >
              {dailyMessages.map((_, index) => (
                <View
                  key={index}
                  style={{
                    width: index === currentMessageIndex ? 18 : 7,
                    height: 7,
                    borderRadius: 999,
                    backgroundColor:
                      index === currentMessageIndex
                        ? "rgba(17,17,17,0.9)"
                        : "rgba(17,17,17,0.3)",
                  }}
                />
              ))}
            </View>
           </>
        ) : (
          <Text
            style={{
              fontSize: 18,
              textAlign: "center",
              color: "#111",
              lineHeight: 26,
              marginBottom: 10,
              fontWeight: "500",
              maxWidth: 320,
              opacity: 0.7,
              paddingHorizontal: 18,
            }}
          >
            Preparing your morning message…
          </Text>
        )}
   
          </View>
           </View>
      )}

       <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 14,
        }}
      >
        {renderHomeHeaderContent(false)}
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 10, paddingBottom: 10 }}>
        {upcomingEntries.length === 0 ? (
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.92)",
              borderRadius: 14,
              padding: 14,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.75)",
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 2,
            }}
          >
            <Text style={{ fontSize: 14, color: "#666" }}>
              No entries for this filter yet.
            </Text>
          </View>
         ) : (
          <>
            {upcomingEntries.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => openEntry(entry)}
                style={{
                  marginBottom: 4,
                  paddingVertical: 2,
                  paddingHorizontal: 0,
                }}
              >
                <View
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: entry.needs_read ? "rgba(0,0,0,0.82)" : "rgba(255,255,255,0.58)",
                    borderRadius: 10,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: entry.needs_read ? "white" : "black",
                    }}
                    numberOfLines={1}
                  >
                    {entry.title?.trim() || "Untitled Entry"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
    </View>
</ScrollView>

    {showFloatingHeader && (
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          elevation: 50,
        }}
      >
         <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 6,
            backgroundColor: "rgba(255,255,255,0.92)",
            overflow: "hidden",
            borderBottomWidth: 0.5,
            borderBottomColor: "#e5e7eb",
            shadowColor: "#000",
            shadowOpacity: 0.04,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
          }}
        >
          {renderHomeHeaderContent(true)}
        </View>
      </View>
    )}
  </View>
    
</KeyboardAvoidingView>

<Modal visible={showCadenceMenu} transparent animationType="fade">
  <Pressable
    onPress={() => setShowCadenceMenu(false)}
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.18)",
      justifyContent: "flex-start",
      paddingTop: 110,
      paddingLeft: 20,
      paddingRight: 20,
    }}
  >
    <Pressable
      onPress={() => {}}
      style={{
        alignSelf: "flex-start",
        backgroundColor: "white",
        borderRadius: 14,
        paddingVertical: 8,
        minWidth: 170,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      }}
    >
      {(["all", "daily", "weekly", "monthly", "yearly"] as const).map((option) => (
        <Pressable
          key={option}
          onPress={() => {
            setSelectedCadenceFilter(option);
            setShowCadenceMenu(false);
          }}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 14,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: selectedCadenceFilter === option ? "700" : "500",
              color: "#111",
            }}
          >
            {option === "all"
              ? "All"
              : option.charAt(0).toUpperCase() + option.slice(1)}
          </Text>
        </Pressable>
      ))}
    </Pressable>
  </Pressable>
</Modal>

<Modal visible={showEntryModal} animationType="slide" presentationStyle="fullScreen">
  <View style={{ flex: 1, backgroundColor: "white" }}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
        <Pressable
          onPress={() => {
            setShowEntryModal(false);
            setSelectedEntry(null);
          }}
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(40,40,40,0.85)",
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: "white",
            textAlign: "center",
          }}
        >
      {selectedEntry?.title?.trim() || "Untitled Entry"}
        </Text>
      </Pressable>
       <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 36,
          alignItems: "stretch",
        }}
      >
        {!!selectedEntry && (
          <View
            style={{
              backgroundColor: "#fafafa",
              borderRadius: 18,
              padding: 18,
              borderWidth: 1,
              borderColor: "#e5e7eb",
            }}
          >
             <Text
              style={{
                fontSize: 14,
                lineHeight: 22,
                color: "#222",
                marginBottom: 28,
              }}
            >
              {selectedEntry.content}
            </Text>

            <View
              style={{
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <View
                style={{
                  width: 120,
                  height: 1,
                  backgroundColor: "#d1d5db",
                }}
              />
            </View>

 <View
  style={{
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  }}
>
   <Pressable
    onPress={() => {
      if (!selectedEntry) return;
      setShowEntryModal(false);
      archiveEntry(selectedEntry.id);
    }}
    style={{
      backgroundColor: "#2e6cff",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
    }}
  >
    <Text
      style={{
        color: "white",
        fontSize: 13,
        fontWeight: "700",
      }}
    >
      Archive
    </Text>
  </Pressable>

  <Pressable
onPress={() => {
  if (!selectedEntry) return;

  setShowEntryModal(false);

  router.push({
    pathname: "/compose",
    params: {
      mode: "edit",
      entryId: selectedEntry.id,
    },
  });
}}
    style={{
      backgroundColor: "#eef2ff",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
    }}
  >
    <Text
      style={{
        color: "#3730a3",
        fontSize: 13,
        fontWeight: "700",
      }}
    >
      Edit
    </Text>
  </Pressable>

  <Pressable
    onPress={() => {
      if (!selectedEntry) return;
      confirmDeleteEntry(selectedEntry.id);
    }}
    style={{
      backgroundColor: "#fef2f2",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
    }}
  >
    <Text
      style={{
        color: "#b91c1c",
        fontSize: 13,
        fontWeight: "700",
      }}
    >
      Delete
    </Text>
  </Pressable>
</View>

             <Text
              style={{
                fontSize: 12,
                color: "#666",
                marginBottom: 18,
              }}
            >
               {selectedEntry.surface_label
                ? selectedEntry.schedule_mode === "none"
                  ? selectedEntry.surface_label
                  : `${selectedEntry.surface_label} • `
                : ""}
              {selectedEntry.schedule_mode !== "none"
                ? `${getEntryScheduleSummary(selectedEntry)}${
                    selectedEntry.next_run_at ? ` • ${formatUpcomingLabel(selectedEntry.next_run_at)}` : ""
                  }`
                : ""}
            </Text>

            <Pressable
                  onPress={() => {
                  setShowEntryModal(false);
                  setSelectedEntry(null);
                }}
                style={{
                  alignSelf: "stretch",
                  backgroundColor: "rgba(40,40,40,0.85)",
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: "center",
                }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: "white",
                }}
              >
                Close / Return
              </Text>
            </Pressable>
          </View>
        )}

          </ScrollView>
         </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
</Modal>

        <Modal visible={showVerseModal} transparent animationType="slide">
          <Pressable
            onPress={() => setShowVerseModal(false)}
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.35)",
              justifyContent: "flex-end",
            }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: "white",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 24,
                paddingBottom: 40,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  marginBottom: 12,
                }}
              >
                {currentDailyMessage?.verse_reference
                  ? `${currentDailyMessage.verse_reference} (NET)`
                  : "Verse (NET)"}
              </Text>

              <Text
                style={{
                  fontSize: 16,
                  lineHeight: 24,
                  marginBottom: 20,
                }}
              >
                {verseText}
              </Text>

              <Text
                style={{
                  fontSize: 11,
                  color: "#777",
                }}
              >
                NET Bible® copyright ©1996–2019 Biblical Studies Press.
              </Text>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  </GestureHandlerRootView>
);
}