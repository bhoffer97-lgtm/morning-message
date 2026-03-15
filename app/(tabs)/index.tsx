import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const morningImages = [
  require("../../assets/images/morning-nature-1.jpg"),
  require("../../assets/images/morning-nature-2.jpg"),
  require("../../assets/images/morning-nature-3.jpg"),
  require("../../assets/images/morning-nature-4.jpg"),
];

type EntryType = "prayer" | "gratitude" | "affirmation" | "goal";

type Entry = {
  id: string;
  title: string | null;
  content: string;
  type: EntryType;
  status: string;
  answered_at: string | null;
  created_at: string | null;
  reminder_group_id: string | null;
};

type DailyMessage = {
  id: string;
  message: string;
  message_text?: string;
  verse_reference: string | null;
  verse_query: string | null;
  message_date: string;
};

type ReminderGroup = {
  id: string;
  name: string;
  cadence: "daily" | "weekly" | "monthly" | "yearly";
  is_active: boolean;
  next_run_at: string | null;
  time_of_day?: string | null;
  day_of_week?: number | null;
  day_of_month?: number | null;
  month_of_year?: number | null;
};

type UpcomingEntry = Entry & {
  cadence: ReminderGroup["cadence"];
  next_run_at: Date | null;
  reminder_group_name: string;
};


const ENTRY_TYPE_CONFIG: { key: EntryType; label: string; icon: string }[] = [
  { key: "prayer", label: "Prayer", icon: "🙏" },
  { key: "gratitude", label: "Gratitude", icon: "❤️" },
  { key: "affirmation", label: "Affirmation", icon: "✨" },
  { key: "goal", label: "Goal", icon: "🎯" },
];

function getEntryTypeStyles(type: string) {
  switch (type) {
    case "prayer":
      return {
        badgeBackground: "#e8f0ff",
        badgeText: "#2e6cff",
      };
    case "gratitude":
      return {
        badgeBackground: "#ffeaea",
        badgeText: "#d64545",
      };
    case "affirmation":
      return {
        badgeBackground: "#fff6cc",
        badgeText: "#d4a000",
      };
    case "goal":
      return {
        badgeBackground: "#e8f7ee",
        badgeText: "#2f855a",
      };
    default:
      return {
        badgeBackground: "#f1f1f1",
        badgeText: "#666",
      };
  }
}

function getEntryTypeIcon(type: string) {
  switch (type) {
    case "prayer":
      return "🙏";
    case "gratitude":
      return "❤️";
    case "affirmation":
      return "✨";
    case "goal":
      return "🎯";
    default:
      return "•";
  }
}

function getArchiveActionLabel(type: EntryType) {
  switch (type) {
    case "prayer":
      return "Answered";
    case "goal":
      return "Done";
    case "gratitude":
    case "affirmation":
    default:
      return "Archive";
  }
}

function getSuggestedTitle(text: string, type: EntryType) {
  const cleaned = text.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    switch (type) {
      case "prayer":
        return "New Prayer";
      case "gratitude":
        return "New Gratitude";
      case "affirmation":
        return "New Affirmation";
      case "goal":
        return "New Goal";
      default:
        return "New Entry";
    }
  }

  const words = cleaned
    .replace(/[^\w\s']/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 5);

  const title = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  if (title.length > 0) {
    return title;
  }

  switch (type) {
    case "prayer":
      return "New Prayer";
    case "gratitude":
      return "New Gratitude";
    case "affirmation":
      return "New Affirmation";
    case "goal":
      return "New Goal";
    default:
      return "New Entry";
  }
}

function formatReminderGroupSubtitle(group: ReminderGroup) {
  switch (group.cadence) {
    case "daily":
      return "Daily Reminders";
    case "weekly":
      return "Weekly Reminders";
    case "monthly":
      return "Monthly Reminders";
    case "yearly":
      return "Yearly Reminders";
    default:
      return "";
  }
}
function formatReminderGroupSchedule(group: ReminderGroup) {
  const formatTime = (time: string | null | undefined) => {
    if (!time) return "No time set";

    const [hours, minutes] = time.split(":");
    const hourNum = Number(hours);
    const minuteNum = Number(minutes);

    const suffix = hourNum >= 12 ? "PM" : "AM";
    const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;

    return `${displayHour}:${String(minuteNum).padStart(2, "0")} ${suffix}`;
  };

  if (group.cadence === "daily") {
    return formatTime(group.time_of_day);
  }

  if (group.cadence === "weekly") {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    return `${group.day_of_week !== null && group.day_of_week !== undefined ? days[group.day_of_week] : "Day not set"} • ${formatTime(group.time_of_day)}`;
  }

  if (group.cadence === "monthly") {
    return `Day ${group.day_of_month ?? "?"} • ${formatTime(group.time_of_day)}`;
  }

  if (group.cadence === "yearly") {
    const months = [
      "",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    return `${months[group.month_of_year ?? 0] || "Month not set"} ${group.day_of_month ?? "?"} • ${formatTime(group.time_of_day)}`;
  }

  return formatTime(group.time_of_day);
}

function getNextRunFromGroup(group: ReminderGroup) {
  if (!group.time_of_day) return null;

  const now = new Date();
  const timeParts = group.time_of_day.split(":");
  const hours = Number(timeParts[0] ?? 0);
  const minutes = Number(timeParts[1] ?? 0);

  const buildCandidate = (year: number, month: number, day: number) => {
    return new Date(year, month, day, hours, minutes, 0, 0);
  };

  if (group.cadence === "daily") {
    let candidate = buildCandidate(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    if (candidate <= now) {
      candidate = buildCandidate(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );
    }

    return candidate;
  }

  if (group.cadence === "weekly") {
    if (group.day_of_week === null || group.day_of_week === undefined) return null;

    const todayDow = now.getDay();
    let daysAhead = (group.day_of_week - todayDow + 7) % 7;

    let candidate = buildCandidate(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + daysAhead
    );

    if (candidate <= now) {
      candidate = buildCandidate(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + daysAhead + 7
      );
    }

    return candidate;
  }

  if (group.cadence === "monthly") {
    if (!group.day_of_month) return null;

    const year = now.getFullYear();
    const month = now.getMonth();

    const currentMonthLastDay = new Date(year, month + 1, 0).getDate();
    const currentTargetDay = Math.min(group.day_of_month, currentMonthLastDay);

    let candidate = buildCandidate(year, month, currentTargetDay);

    if (candidate <= now) {
      const nextMonthDate = new Date(year, month + 1, 1);
      const nextYear = nextMonthDate.getFullYear();
      const nextMonth = nextMonthDate.getMonth();
      const nextMonthLastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
      const nextTargetDay = Math.min(group.day_of_month, nextMonthLastDay);

      candidate = buildCandidate(nextYear, nextMonth, nextTargetDay);
    }

    return candidate;
  }

  if (group.cadence === "yearly") {
    if (!group.month_of_year || !group.day_of_month) return null;

    const currentYear = now.getFullYear();
    const targetMonthIndex = group.month_of_year - 1;

    const currentYearLastDay = new Date(currentYear, targetMonthIndex + 1, 0).getDate();
    const currentYearTargetDay = Math.min(group.day_of_month, currentYearLastDay);

    let candidate = buildCandidate(
      currentYear,
      targetMonthIndex,
      currentYearTargetDay
    );

    if (candidate <= now) {
      const nextYear = currentYear + 1;
      const nextYearLastDay = new Date(nextYear, targetMonthIndex + 1, 0).getDate();
      const nextYearTargetDay = Math.min(group.day_of_month, nextYearLastDay);

      candidate = buildCandidate(
        nextYear,
        targetMonthIndex,
        nextYearTargetDay
      );
    }

    return candidate;
  }

  return null;
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

  const [activeEntries, setActiveEntries] = useState<Entry[]>([]);
  const [reminderGroups, setReminderGroups] = useState<ReminderGroup[]>([]);
  const [selectedCadenceFilter, setSelectedCadenceFilter] = useState<
    "all" | "daily" | "weekly" | "monthly" | "yearly"
  >("all");
  const [showUngrouped, setShowUngrouped] = useState(true);

  const [newPrayer, setNewPrayer] = useState("");
  const [newEntryTitle, setNewEntryTitle] = useState("");
  const [searchText, setSearchText] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedEntryType, setSelectedEntryType] = useState<EntryType>("prayer");
  const [selectedReminderGroupId, setSelectedReminderGroupId] = useState<string | null>(null);
  const [selectedSaveCadence, setSelectedSaveCadence] = useState<
    "daily" | "weekly" | "monthly" | "yearly"
  >("daily");
  const [showSaveEntryModal, setShowSaveEntryModal] = useState(false);


  const [updatingPrayerId, setUpdatingPrayerId] = useState<string | null>(null);
  const [isSavingPrayer, setIsSavingPrayer] = useState(false);
  const [isAIWorking, setIsAIWorking] = useState(false);
  const [showAnswerNoteModal, setShowAnswerNoteModal] = useState(false);
  const [answerNoteText, setAnswerNoteText] = useState("");
  const [entryToCompleteId, setEntryToCompleteId] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView | null>(null);
  const messageScrollRef = useRef<ScrollView | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);

  const textFadeAnim = useRef(new Animated.Value(1)).current;
  const textScaleAnim = useRef(new Animated.Value(1)).current;
  const messageFadeAnim = useRef(new Animated.Value(0)).current;
  const dotAnim1 = useRef(new Animated.Value(0.35)).current;
  const dotAnim2 = useRef(new Animated.Value(0.35)).current;
  const dotAnim3 = useRef(new Animated.Value(0.35)).current;

  const [backgroundImage] = useState(
    morningImages[Math.floor(Math.random() * morningImages.length)]
  );

  const messageCardWidth = Dimensions.get("window").width - 48;
  const currentDailyMessage = dailyMessages[currentMessageIndex] ?? null;

    function resetSaveEntryState() {
    setShowSaveEntryModal(false);
    setNewEntryTitle("");
    setSelectedReminderGroupId(null);
    setSelectedSaveCadence("daily");
  }

    function openSaveEntryModal() {
    if (!newPrayer.trim() || isSavingPrayer) return;

    const dailyGroup = reminderGroups.find((group) => group.cadence === "daily");

    setNewEntryTitle(getSuggestedTitle(newPrayer, selectedEntryType));
    setSelectedSaveCadence("daily");
    setSelectedReminderGroupId(dailyGroup?.id ?? null);
    setShowSaveEntryModal(true);
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

    const todayString = today.toISOString().split("T")[0];
    const twoDaysAgoString = twoDaysAgo.toISOString().split("T")[0];

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

  async function generateDailyMessage() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      console.log("Generating daily message...");

      const { data: activeContextEntries, error: activeContextError } = await supabase
        .from("entries")
        .select("type, content")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(8);

      if (activeContextError) {
        console.log("Load active entries for daily message error:", activeContextError.message);
      }

      const { data, error } = await supabase.functions.invoke("generate-entry", {
        body: {
          mode: "daily",
          activeEntries: activeContextEntries ?? [],
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
        return;
      }

      if (data?.message) {
        await loadMessage();
      }
    } catch (err) {
      console.log("Unexpected daily generation error:", err);
    }
  }

  async function loadEntries() {
    const { data, error } = await supabase
      .from("entries")
      .select("id, title, content, type, status, answered_at, created_at, reminder_group_id")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      console.log("Load active entries error:", error.message);
      return;
    }

    setActiveEntries((data as Entry[]) ?? []);
  }

  async function loadReminderGroups() {
    const { data, error } = await supabase
      .from("reminder_groups")
      .select(
        "id, name, cadence, is_active, next_run_at, time_of_day, day_of_week, day_of_month, month_of_year"
      )
      .eq("is_active", true)
      .order("next_run_at", { ascending: true });

    if (error) {
      console.log("Load reminder groups error:", error.message);
      return;
    }

    const groups = (data as ReminderGroup[]) ?? [];
    setReminderGroups(groups);
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

  const savePrayer = async () => {
    if (!newPrayer.trim() || isSavingPrayer) return;

    setIsSavingPrayer(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.log("No user found");
        return;
      }

      const titleToSave = newEntryTitle.trim() || getSuggestedTitle(newPrayer, selectedEntryType);

      const { error } = await supabase.from("entries").insert({
        user_id: user.id,
        type: selectedEntryType,
        title: titleToSave,
        status: "active",
        content: newPrayer.trim(),
        reminder_group_id: selectedReminderGroupId,
      });

      if (error) {
        console.log("Error saving entry:", error);
        Alert.alert("Could not save entry", error.message);
        return;
      }

      setNewPrayer("");
      setNewEntryTitle("");
      setSelectedEntryType("prayer");
      setSelectedReminderGroupId(null);
      setShowSaveEntryModal(false);
      Keyboard.dismiss();
      await loadEntries();

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 350, animated: true });
      }, 150);
    } finally {
      setIsSavingPrayer(false);
    }
  };

  const markEntryCompleted = async (id: string) => {
    setEntryToCompleteId(id);
    setAnswerNoteText("");
    setShowAnswerNoteModal(true);
  };

  const saveAnswerNote = async () => {
    if (!entryToCompleteId) return;

    setUpdatingPrayerId(entryToCompleteId);

    const { error } = await supabase
      .from("entries")
      .update({
        status: "answered",
        answered_at: new Date(),
        answer_notes: answerNoteText.trim() || null,
      })
      .eq("id", entryToCompleteId);

    if (error) {
      console.log("Error saving answer note:", error.message);
      setUpdatingPrayerId(null);
      return;
    }

    setShowAnswerNoteModal(false);
    setEntryToCompleteId(null);
    setAnswerNoteText("");
    await loadEntries();
    setUpdatingPrayerId(null);
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from("entries").delete().eq("id", id);

    if (error) {
      console.log("Error deleting entry:", error.message);
      return;
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

  const renderCurrentRightActions = (type: EntryType, id: string) => {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "stretch",
          marginBottom: 10,
        }}
      >
        <Pressable
          onPress={() => markEntryCompleted(id)}
          style={{
            width: 88,
            backgroundColor: "#2e6cff",
            justifyContent: "center",
            alignItems: "center",
            borderTopLeftRadius: 10,
            borderBottomLeftRadius: 10,
          }}
        >
          <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>
            {getArchiveActionLabel(type)}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => confirmDeleteEntry(id)}
          style={{
            width: 80,
            backgroundColor: "#d64545",
            justifyContent: "center",
            alignItems: "center",
            borderTopRightRadius: 10,
            borderBottomRightRadius: 10,
          }}
        >
          <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>
            Delete
          </Text>
        </Pressable>
      </View>
    );
  };

  const handleAIHelp = async () => {
    if (isAIWorking) return;

    setIsAIWorking(true);
    startAIDotsAnimation();

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke("generate-entry", {
        body: {
          mode: "write",
          type: selectedEntryType,
          text: newPrayer,
        },
        headers: session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : {},
      });

      if (error) {
        console.log("AI help error:", error);

        try {
          const errorBody = await error.context.json();
          console.log("AI help error body:", errorBody);
        } catch (readError) {
          console.log("Could not read AI help error body:", readError);
        }

        return;
      }

      if (data?.text) {
        Animated.parallel([
          Animated.timing(textFadeAnim, {
            toValue: 0.4,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(textScaleAnim, {
            toValue: 0.97,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setNewPrayer(data.text);
          setNewEntryTitle(getSuggestedTitle(data.text, selectedEntryType));

          Animated.parallel([
            Animated.timing(textFadeAnim, {
              toValue: 1,
              duration: 260,
              useNativeDriver: true,
            }),
            Animated.timing(textScaleAnim, {
              toValue: 1,
              duration: 260,
              useNativeDriver: true,
            }),
          ]).start();
        });
      }
    } catch (error) {
      console.log("AI help unexpected error:", error);
    }

    setIsAIWorking(false);
  };

  function startAIDotsAnimation() {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(dotAnim1, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(dotAnim2, {
            toValue: 0.35,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(dotAnim3, {
            toValue: 0.35,
            duration: 320,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(dotAnim1, {
            toValue: 0.35,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(dotAnim2, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(dotAnim3, {
            toValue: 0.35,
            duration: 320,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(dotAnim1, {
            toValue: 0.35,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(dotAnim2, {
            toValue: 0.35,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(dotAnim3, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }

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
      await loadReminderGroups();
    }

    initialize();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
      loadReminderGroups();
    }, [])
  );

  const filteredActiveEntries = useMemo(() => {
    const query = searchText.toLowerCase();

    return activeEntries.filter((entry) => {
      return (
        entry.content?.toLowerCase().includes(query) ||
        entry.title?.toLowerCase().includes(query)
      );
    });
  }, [activeEntries, searchText]);

  const entriesByGroupId = useMemo(() => {
    const grouped: Record<string, Entry[]> = {};

    filteredActiveEntries.forEach((entry) => {
      if (!entry.reminder_group_id) return;

      if (!grouped[entry.reminder_group_id]) {
        grouped[entry.reminder_group_id] = [];
      }

      grouped[entry.reminder_group_id].push(entry);
    });

    return grouped;
  }, [filteredActiveEntries]);

   const upcomingEntries = useMemo<UpcomingEntry[]>(() => {
    const now = new Date();
    const oneWeekOut = new Date();
    oneWeekOut.setDate(oneWeekOut.getDate() + 7);

    return reminderGroups
      .filter((group) => {
        const nextRun = getNextRunFromGroup(group);
        const cadenceMatches =
          selectedCadenceFilter === "all" || group.cadence === selectedCadenceFilter;

        return !!nextRun && nextRun >= now && nextRun <= oneWeekOut && cadenceMatches;
      })
      .flatMap((group) => {
        const items = entriesByGroupId[group.id] ?? [];
        const nextRun = getNextRunFromGroup(group);

        return items.map((entry) => ({
          ...entry,
          cadence: group.cadence,
          next_run_at: nextRun,
          reminder_group_name: group.name,
        }));
      })
      .sort((a, b) => {
        const aTime = a.next_run_at ? a.next_run_at.getTime() : 0;
        const bTime = b.next_run_at ? b.next_run_at.getTime() : 0;
        return aTime - bTime;
      });
  }, [reminderGroups, entriesByGroupId, selectedCadenceFilter]);


  const ungroupedEntries = useMemo(() => {
    return filteredActiveEntries.filter((entry) => !entry.reminder_group_id);
  }, [filteredActiveEntries]);
   const saveModalReminderGroups = useMemo(() => {
    return reminderGroups.filter((group) => group.cadence === selectedSaveCadence);
  }, [reminderGroups, selectedSaveCadence]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView
              ref={scrollViewRef}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: 24,
                flexGrow: 1,
              }}
            >
              <ImageBackground
                source={backgroundImage}
                imageStyle={{ borderRadius: 16 }}
                style={{
                  borderRadius: 16,
                  overflow: "hidden",
                  marginBottom: 24,
                  minHeight: 240,
                  justifyContent: "flex-end",
                }}
              >
                <LinearGradient
                  colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.45)"]}
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
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
                                color: "white",
                                lineHeight: 26,
                                marginBottom: 10,
                                fontWeight: "500",
                                opacity: messageFadeAnim,
                              }}
                            >
                              {item.message}
                            </Animated.Text>

                            <Text
                              style={{
                                fontSize: 12,
                                color: "rgba(255,255,255,0.78)",
                                marginBottom: 8,
                                textAlign: "center",
                              }}
                            >
                              {new Date(item.message_date).toLocaleDateString()}
                            </Text>

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
                                  color: "rgba(255,255,255,0.92)",
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
                                  ? "rgba(255,255,255,0.95)"
                                  : "rgba(255,255,255,0.45)",
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
                        color: "white",
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
                </LinearGradient>
              </ImageBackground>

              <Animated.View
                style={{
                  borderWidth: 1,
                  borderColor: "#ccc",
                  borderRadius: 10,
                  marginBottom: 16,
                  backgroundColor: "white",
                  opacity: textFadeAnim,
                  transform: [{ scale: textScaleAnim }],
                }}
              >
                <TextInput
                  ref={inputRef}
                  placeholder="Write what’s on your mind… we’ll turn it into a prayer, goal, or affirmation."
                  value={newPrayer}
                  onChangeText={setNewPrayer}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollTo({ y: 260, animated: true });
                    }, 250);
                  }}
                  multiline
                  style={{
                    padding: 12,
                    paddingRight: 40,
                    minHeight: 100,
                    textAlignVertical: "top",
                  }}
                />

                <Pressable
                  onPress={handleAIHelp}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: 10,
                    padding: 6,
                  }}
                >
                  {isAIWorking ? (
                    <View style={{ flexDirection: "row", gap: 3 }}>
                      <Animated.View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#2e6cff",
                          opacity: dotAnim1,
                        }}
                      />
                      <Animated.View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#2e6cff",
                          opacity: dotAnim2,
                        }}
                      />
                      <Animated.View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#2e6cff",
                          opacity: dotAnim3,
                        }}
                      />
                    </View>
                  ) : (
                    <Text style={{ fontSize: 16 }}>✨</Text>
                  )}
                </Pressable>
              </Animated.View>

              <View style={{ marginBottom: 20 }}>
                <Pressable
                  disabled={!newPrayer.trim() || isSavingPrayer}
                  onPress={openSaveEntryModal}
                  style={{
                    backgroundColor:
                      !newPrayer.trim() || isSavingPrayer ? "#bfc8d8" : "#2e6cff",
                    borderRadius: 10,
                    paddingVertical: 14,
                    opacity: isSavingPrayer ? 0.7 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      textAlign: "center",
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {isSavingPrayer ? "Saving..." : "Save"}
                  </Text>
                </Pressable>
              </View>

              <View style={{ marginBottom: 22 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "700",
                      color: "black",
                    }}
                  >
                    Coming Up
                  </Text>

                  {!showSearch ? (
                    <Pressable onPress={() => setShowSearch(true)}>
                      <Text style={{ fontSize: 14, color: "#666" }}>Search</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => {
                        setShowSearch(false);
                        setSearchText("");
                        Keyboard.dismiss();
                      }}
                    >
                      <Text style={{ fontSize: 14, color: "#666" }}>Close</Text>
                    </Pressable>
                  )}
                </View>

                {showSearch && (
                  <View style={{ marginBottom: 14 }}>
                    <TextInput
                      ref={searchInputRef}
                      placeholder="Search entries..."
                      value={searchText}
                      onChangeText={setSearchText}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollTo({ y: 260, animated: true });
                        }, 250);
                      }}
                      style={{
                        backgroundColor: "white",
                        borderWidth: 1,
                        borderColor: "#d8d8d8",
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        fontSize: 15,
                        color: "black",
                      }}
                    />
                  </View>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 4, marginBottom: 14 }}
                >
                  {(["all", "daily", "weekly", "monthly", "yearly"] as const).map((filter) => {
                    const selected = selectedCadenceFilter === filter;
                    const labelMap = {
                      all: "All",
                      daily: "Daily",
                      weekly: "Wkly",
                      monthly: "Mthly",
                      yearly: "Yrly",
                    } as const;
                    const label = labelMap[filter];


                    return (
                      <Pressable
                        key={filter}
                        onPress={() => setSelectedCadenceFilter(filter)}
                        style={{
                          paddingVertical: 9,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          backgroundColor: selected ? "#2e6cff" : "#f3f4f6",
                          marginRight: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? "white" : "#333",
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {upcomingEntries.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: "#f7f7f7",
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: "#666" }}>
                      No upcoming entries for this filter in the next 7 days.
                    </Text>
                  </View>
                ) : (
                  upcomingEntries.map((entry) => (
                    <Swipeable
                      key={entry.id}
                      renderRightActions={() =>
                        renderCurrentRightActions(entry.type, entry.id)
                      }
                      overshootRight={false}
                    >
                      <View
                        style={{
                          backgroundColor: "#f7f7f7",
                          padding: 14,
                          borderRadius: 10,
                          marginBottom: 10,
                          borderLeftWidth: 4,
                          borderLeftColor: getEntryTypeStyles(entry.type).badgeText,
                        }}
                      >
                        {!!entry.title && (
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: "700",
                              color: "black",
                              marginBottom: 6,
                            }}
                          >
                            {entry.title}
                          </Text>
                        )}

                        <Text
                          style={{
                            fontSize: 16,
                            color: "black",
                            lineHeight: 22,
                          }}
                        >
                          {entry.content}
                        </Text>

                        <Text
                          style={{
                            fontSize: 12,
                            color: "#666",
                            marginTop: 8,
                          }}
                        >
                          {entry.cadence.charAt(0).toUpperCase() + entry.cadence.slice(1)} •{" "}
                          {formatUpcomingLabel(entry.next_run_at)}
                        </Text>
                      </View>
                    </Swipeable>
                  ))
                )}
              </View>

              <View style={{ marginBottom: 22 }}>
                <Pressable
                  onPress={() => setShowUngrouped(!showUngrouped)}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "700",
                      color: "black",
                    }}
                  >
                    Ungrouped Entries ({ungroupedEntries.length})
                  </Text>

                  <Text style={{ fontSize: 18, color: "#666" }}>
                    {showUngrouped ? "▾" : "▸"}
                  </Text>
                </Pressable>

                {showUngrouped && (
                  <>
                    {ungroupedEntries.length === 0 ? (
                      <View
                        style={{
                          backgroundColor: "#f7f7f7",
                          borderRadius: 10,
                          padding: 14,
                        }}
                      >
                        <Text style={{ fontSize: 14, color: "#666" }}>
                          No ungrouped entries.
                        </Text>
                      </View>
                    ) : (
                      ungroupedEntries.map((entry) => (
                        <Swipeable
                          key={entry.id}
                          renderRightActions={() =>
                            renderCurrentRightActions(entry.type, entry.id)
                          }
                          overshootRight={false}
                        >
                          <View
                            style={{
                              backgroundColor: "#f7f7f7",
                              padding: 14,
                              borderRadius: 10,
                              marginBottom: 10,
                              borderLeftWidth: 4,
                              borderLeftColor: getEntryTypeStyles(entry.type).badgeText,
                            }}
                          >
                            {!!entry.title && (
                              <Text
                                style={{
                                  fontSize: 15,
                                  fontWeight: "700",
                                  color: "black",
                                  marginBottom: 6,
                                }}
                              >
                                {entry.title}
                              </Text>
                            )}

                            <Text style={{ fontSize: 16, color: "black" }}>{entry.content}</Text>

                            <Text
                              style={{
                                fontSize: 11,
                                color: "#6a6a6a",
                                marginTop: 8,
                              }}
                            >
                              {getEntryTypeIcon(entry.type)}{" "}
                              {entry.type.charAt(0).toUpperCase() + entry.type.slice(1)} • Added{" "}
                              {entry.created_at
                                ? new Date(entry.created_at).toLocaleDateString()
                                : ""}
                            </Text>
                          </View>
                        </Swipeable>
                      ))
                    )}
                  </>
                )}
              </View>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
          
        <Modal visible={showSaveEntryModal} transparent animationType="slide">
          <Pressable
            onPress={resetSaveEntryState}
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.35)",
              justifyContent: "flex-end",
            }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                maxHeight: "85%",
                backgroundColor: "white",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                overflow: "hidden",
              }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  padding: 24,
                  paddingBottom: 36,
                }}
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "700",
                    color: "black",
                    marginBottom: 8,
                  }}
                >
                  Save Entry
                </Text>

                <Text
                  style={{
                    fontSize: 14,
                    color: "#666",
                    lineHeight: 20,
                    marginBottom: 18,
                  }}
                >
                  Adjust the title if you want and choose which reminder this entry belongs to.
                </Text>
                
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "black",
                    marginBottom: 8,
                  }}
                >
                  Title
                </Text>

                <TextInput
                  value={newEntryTitle}
                  onChangeText={setNewEntryTitle}
                  placeholder="Suggested title"
                  style={{
                    borderWidth: 1,
                    borderColor: "#d6d6d6",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: "black",
                    marginBottom: 18,
                  }}
                />

                                        <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "black",
                    marginBottom: 8,
                  }}
                >
                  Reminder
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 4, marginBottom: 14 }}
                >
                  {(["daily", "weekly", "monthly", "yearly"] as const).map((cadence) => {
                    const selected = selectedSaveCadence === cadence;
                    const labelMap = {
                      daily: "Daily",
                      weekly: "Wkly",
                      monthly: "Mthly",
                      yearly: "Yrly",
                    } as const;

                    return (
                      <Pressable
                        key={cadence}
                        onPress={() => {
                          setSelectedSaveCadence(cadence);
                          const firstGroup = reminderGroups.find(
                            (group) => group.cadence === cadence
                          );
                          setSelectedReminderGroupId(firstGroup?.id ?? null);
                        }}
                        style={{
                          paddingVertical: 9,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          backgroundColor: selected ? "#2e6cff" : "#f3f4f6",
                          marginRight: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? "white" : "#333",
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {labelMap[cadence]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {saveModalReminderGroups.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: "#f7f7f7",
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 18,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: "#666" }}>
                      No {selectedSaveCadence} reminder groups yet.
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginBottom: 18 }}>
                    {saveModalReminderGroups.map((group) => {
                      const selected = selectedReminderGroupId === group.id;

                      return (
                        <Pressable
                          key={group.id}
                          onPress={() => setSelectedReminderGroupId(group.id)}
                          style={{
                            backgroundColor: selected ? "#e8f0ff" : "#f7f7f7",
                            borderWidth: 1,
                            borderColor: selected ? "#2e6cff" : "#e5e7eb",
                            borderRadius: 10,
                            padding: 12,
                            marginBottom: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: "600",
                              color: selected ? "#2e6cff" : "#333",
                              marginBottom: 2,
                            }}
                          >
                            {group.name}
                          </Text>
                          <Text style={{ fontSize: 12, color: "#666" }}>
                            {formatReminderGroupSchedule(group)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}


                <View style={{ gap: 10 }}>
                  <Pressable
                    onPress={savePrayer}
                    disabled={isSavingPrayer}
                    style={{
                      backgroundColor: "#2e6cff",
                      borderRadius: 10,
                      paddingVertical: 14,
                      opacity: isSavingPrayer ? 0.7 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        textAlign: "center",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      {isSavingPrayer ? "Saving..." : "Save Entry"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={resetSaveEntryState}
                    style={{
                      backgroundColor: "#f3f4f6",
                      borderRadius: 10,
                      paddingVertical: 14,
                    }}
                  >
                    <Text
                      style={{
                        color: "#333",
                        textAlign: "center",
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Cancel
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={showAnswerNoteModal} transparent animationType="slide">
          <Pressable
            onPress={() => {
              setShowAnswerNoteModal(false);
              setEntryToCompleteId(null);
              setAnswerNoteText("");
            }}
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
                paddingBottom: 18,
              }}
            >
              <TextInput
                placeholder="Add a note for future reference..."
                placeholderTextColor="#888"
                value={answerNoteText}
                onChangeText={setAnswerNoteText}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: "#d6d6d6",
                  borderRadius: 10,
                  padding: 14,
                  minHeight: 125,
                  textAlignVertical: "top",
                  marginBottom: 16,
                }}
              />

              <View>
                <Pressable
                  onPress={saveAnswerNote}
                  disabled={updatingPrayerId === entryToCompleteId}
                  style={{
                    backgroundColor: "#2e6cff",
                    borderRadius: 10,
                    paddingVertical: 14,
                    marginBottom: 10,
                    opacity: updatingPrayerId === entryToCompleteId ? 0.7 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      textAlign: "center",
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {updatingPrayerId === entryToCompleteId ? "Saving..." : "Save"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={async () => {
                    if (!entryToCompleteId) return;

                    await supabase
                      .from("entries")
                      .update({
                        status: "answered",
                        answered_at: new Date(),
                      })
                      .eq("id", entryToCompleteId);

                    setShowAnswerNoteModal(false);
                    setEntryToCompleteId(null);
                    setAnswerNoteText("");
                    await loadEntries();
                  }}
                  style={{ paddingVertical: 8 }}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      color: "#666",
                      fontSize: 14,
                    }}
                  >
                    Skip
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
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
    </GestureHandlerRootView>
  );
}
