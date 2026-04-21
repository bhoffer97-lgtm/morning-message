import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
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
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { syncLocalNotifications } from "../../lib/notifications/syncNotifications";
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
  created_at?: string | null;
  updated_at?: string | null;
  resolution_note?: string | null;
  archived_at?: string | null;
  retired_at?: string | null;
  needs_read: boolean;
  last_read_at: string | null;
  last_completed_at?: string | null;
  last_completed_due_at?: string | null;
  next_due_at: string | null;
  effective_due_at?: string | null;
  section?: "for_today" | "handled_today" | "carried_over" | "upcoming" | null;
  schedule_mode: string;
  due_date?: string | null;
  due_time?: string | null;
  interval_value?: number | null;
  interval_unit?: string | null;
  annual_month?: number | null;
  annual_day?: number | null;
  anchor_date?: string | null;
  digest_assignment: "none" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  last_surface_at?: string | null;
  last_surface_window_key?: string | null;
  last_due_at?: string | null;
};

type DailyMessage = {
  id: string;
  message: string;
  message_text?: string;
  verse_reference: string | null;
  verse_query: string | null;
  message_date: string;
};

type DisplayEntry = Entry & {
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom" | "none";
  next_run_at: Date | null;
  effective_run_at: Date | null;
  surface_label: string;
};

type ReminderScheduleRow = {
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  is_enabled: boolean;
  anchor_date: string;
  time_of_day: string;
};

type DeletedEntryOption = {
  deleted_entry_id: string;
  title: string;
  deleted_at: string;
};

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameLocalDay(date: Date, compareDate: Date) {
  return (
    date.getFullYear() === compareDate.getFullYear() &&
    date.getMonth() === compareDate.getMonth() &&
    date.getDate() === compareDate.getDate()
  );
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
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

function getEntryTypeLabel(type?: string | null) {
  if (type === "prayer") return "Prayer";
  if (type === "affirmation") return "Affirmation";
  if (type === "goal") return "Goal";
  if (type === "reminder") return "Reminder";
  return "Entry";
}

function formatShortDateOnly(value?: string | Date | null) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);

  return date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

function getOrdinal(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

function getRepeatUnitLabel(unit?: string | null, value?: number | null) {
  if (!unit) return "day";

  const singular = unit.replace(/s$/, "");

  if (value === 1) {
    return singular;
  }

  return unit.toLowerCase();
}

function formatDateTimeLine(date: Date | null) {
  if (!date) return "";

  const dateText = date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });

  const timeText = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dateText} at ${timeText}`;
}

function getCadenceSchedule(
  entry: DisplayEntry,
  schedules: ReminderScheduleRow[]
) {
  if (
    entry.digest_assignment !== "daily" &&
    entry.digest_assignment !== "weekly" &&
    entry.digest_assignment !== "monthly" &&
    entry.digest_assignment !== "quarterly" &&
    entry.digest_assignment !== "yearly"
  ) {
    return null;
  }

  return schedules.find((item) => item.cadence === entry.digest_assignment) ?? null;
}

function isEntryCurrentlyHandled(
  entry: Entry | DisplayEntry,
  schedules: ReminderScheduleRow[]
) {
  if (!entry.last_completed_at) return false;

  if (entry.digest_assignment === "none" && entry.schedule_mode === "none") {
    return false;
  }

  if (entry.digest_assignment !== "none") {
    const schedule = schedules.find((item) => item.cadence === entry.digest_assignment) ?? null;
    if (!schedule || !entry.last_completed_due_at) return false;

    const currentOccurrence = getCurrentCadenceOccurrence(
      schedule.anchor_date,
      schedule.time_of_day,
      schedule.cadence
    );

    return new Date(entry.last_completed_due_at).getTime() >= currentOccurrence.getTime();
  }

  if (
    entry.schedule_mode === "daily_time" ||
    entry.schedule_mode === "interval" ||
    entry.schedule_mode === "annual_date" ||
    entry.schedule_mode === "holiday"
  ) {
    if (!entry.next_due_at) return false;
    return Date.now() < new Date(entry.next_due_at).getTime();
  }

  if (entry.schedule_mode === "fixed_date") {
    return !!entry.last_completed_at;
  }

  return false;
}

function getEntryMetaLines(entry: DisplayEntry, schedules: ReminderScheduleRow[]) {
  const lines: string[] = [];
  const createdDate = entry.created_at ? formatShortDateOnly(entry.created_at) : "";
  const cadenceSchedule = getCadenceSchedule(entry, schedules);
  const cadenceTime = cadenceSchedule ? formatTimeLabel(cadenceSchedule.time_of_day) : "";
  const nextRunLine = formatDateTimeLine(entry.next_run_at);

  const cadenceAnchorDate = cadenceSchedule?.anchor_date
    ? formatShortDateOnly(`${cadenceSchedule.anchor_date}T00:00:00`)
    : "";

  const cadenceDateTimeLine = cadenceAnchorDate
    ? `${cadenceAnchorDate}${cadenceTime ? ` at ${cadenceTime}` : ""}`
    : nextRunLine;

  if (entry.digest_assignment === "daily") {
    lines.push(cadenceTime ? `Daily Reminder · ${cadenceTime}` : "Daily Reminder");
    return lines;
  }

  if (entry.digest_assignment === "weekly") {
    const weekday = cadenceSchedule?.anchor_date
      ? new Date(`${cadenceSchedule.anchor_date}T00:00:00`).toLocaleDateString([], {
          weekday: "long",
        })
      : "Sunday";

    lines.push(
      cadenceTime
        ? `Weekly Reminder · ${weekday} at ${cadenceTime}`
        : `Weekly Reminder · ${weekday}`
    );
    return lines;
  }

  if (entry.digest_assignment === "monthly") {
    const dayOfMonth = cadenceSchedule?.anchor_date
      ? new Date(`${cadenceSchedule.anchor_date}T00:00:00`).getDate()
      : 1;

    lines.push(
      cadenceTime
        ? `Monthly Reminder · ${getOrdinal(dayOfMonth)} at ${cadenceTime}`
        : `Monthly Reminder · ${getOrdinal(dayOfMonth)}`
    );
    return lines;
  }

  if (entry.digest_assignment === "quarterly") {
    lines.push(
      cadenceDateTimeLine
        ? `Quarterly Reminder · ${cadenceDateTimeLine}`
        : "Quarterly Reminder"
    );
    return lines;
  }

  if (entry.digest_assignment === "yearly") {
    lines.push(
      cadenceDateTimeLine
        ? `Yearly Reminder · ${cadenceDateTimeLine}`
        : "Yearly Reminder"
    );
    return lines;
  }

  if (
    entry.schedule_mode === "interval" ||
    entry.schedule_mode === "daily_time" ||
    entry.schedule_mode === "annual_date"
  ) {
    lines.push(nextRunLine ? `Custom Reminder · ${nextRunLine}` : "Custom Reminder");

    if (entry.schedule_mode === "daily_time") {
      lines.push("Repeats every day");
      return lines;
    }

    if (entry.schedule_mode === "annual_date") {
      lines.push("Repeats every year");
      return lines;
    }

    const repeatValue = entry.interval_value ?? 1;
    const repeatUnit = getRepeatUnitLabel(entry.interval_unit, repeatValue);
    lines.push(`Repeats every ${repeatValue === 1 ? "" : `${repeatValue} `}${repeatUnit}`);
    return lines;
  }

  if (entry.schedule_mode === "fixed_date") {
    const dueDate = entry.due_date
      ? `${formatShortDateOnly(`${entry.due_date}T00:00:00`)}${
          entry.due_time ? ` at ${formatTimeLabel(entry.due_time)}` : ""
        }`
      : nextRunLine;

    lines.push(dueDate ? `Custom Reminder · ${dueDate}` : "Custom Reminder");
    lines.push(`Handled: ${entry.last_completed_at ? "Yes" : "Not Yet"}`);
    return lines;
  }

  lines.push("No Scheduled Reminder");
  lines.push(`Created ${createdDate}`);
  return lines;
}

function getEntryScheduleSummary(entry: Entry | DisplayEntry) {
  if (entry.digest_assignment !== "none" && entry.schedule_mode === "none") {
    return null;
  }

  if (entry.schedule_mode === "daily_time") {
    return entry.due_time ? `Daily at ${formatTimeLabel(entry.due_time)}` : "Daily";
  }

  if (entry.schedule_mode === "fixed_date") {
    if (!entry.due_date) return "One date";

    const dateText = new Date(`${entry.due_date}T00:00:00`).toLocaleDateString();
    return entry.due_time ? `${dateText} at ${formatTimeLabel(entry.due_time)}` : dateText;
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

function getSurfaceLabel(entry: Entry) {
  if (entry.digest_assignment === "daily") {
    return entry.due_time ? `Daily Reminder • ${formatTimeLabel(entry.due_time)}` : "Daily Reminder";
  }

  if (entry.digest_assignment === "weekly") {
    if (entry.anchor_date) {
      const day = new Date(`${entry.anchor_date}T00:00:00`).toLocaleDateString([], {
        weekday: "long",
      });
      return entry.due_time
        ? `Weekly Reminder • ${day} • ${formatTimeLabel(entry.due_time)}`
        : `Weekly Reminder • ${day}`;
    }

    return entry.due_time
      ? `Weekly Reminder • ${formatTimeLabel(entry.due_time)}`
      : "Weekly Reminder";
  }

  if (entry.digest_assignment === "monthly") {
    if (entry.anchor_date) {
      const dayOfMonth = new Date(`${entry.anchor_date}T00:00:00`).getDate();
      return entry.due_time
        ? `Monthly Reminder • Day ${dayOfMonth} • ${formatTimeLabel(entry.due_time)}`
        : `Monthly Reminder • Day ${dayOfMonth}`;
    }

    return entry.due_time
      ? `Monthly Reminder • ${formatTimeLabel(entry.due_time)}`
      : "Monthly Reminder";
  }

  if (entry.digest_assignment === "quarterly" || entry.digest_assignment === "yearly") {
    if (entry.anchor_date) {
      const monthDay = new Date(`${entry.anchor_date}T00:00:00`).toLocaleDateString([], {
        month: "long",
        day: "numeric",
      });

      const prefix = entry.digest_assignment === "quarterly" ? "Quarterly Reminder" : "Yearly Reminder";

      return entry.due_time
        ? `${prefix} • ${monthDay} • ${formatTimeLabel(entry.due_time)}`
        : `${prefix} • ${monthDay}`;
    }

    return entry.digest_assignment === "quarterly" ? "Quarterly Reminder" : "Yearly Reminder";
  }

  if (entry.schedule_mode !== "none") {
    return "Custom Reminder";
  }

  return "No schedule";
}

function getCadence(entry: Entry): DisplayEntry["cadence"] {
  if (
    entry.digest_assignment === "daily" ||
    entry.digest_assignment === "weekly" ||
    entry.digest_assignment === "monthly" ||
    entry.digest_assignment === "quarterly" ||
    entry.digest_assignment === "yearly"
  ) {
    return entry.digest_assignment;
  }

  if (entry.schedule_mode !== "none") return "custom";
  return "none";
}

function toDisplayEntry(entry: Entry): DisplayEntry {
  return {
    ...entry,
    cadence: getCadence(entry),
    next_run_at: entry.next_due_at ? new Date(entry.next_due_at) : null,
    effective_run_at: entry.effective_due_at ? new Date(entry.effective_due_at) : null,
    surface_label: getSurfaceLabel(entry),
  };
}

function getDisplayDate(entry: DisplayEntry) {
  return entry.effective_run_at ?? entry.next_run_at;
}

function formatUpcomingLabel(date: Date | null) {
  if (!date) return "";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const dayDiff = Math.round(
    (targetStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timeLabel = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (dayDiff === 0) return `Today • ${timeLabel}`;
  if (dayDiff === 1) return `Tomorrow • ${timeLabel}`;
  if (dayDiff > 1 && dayDiff <= 7) return `In ${dayDiff} days • ${timeLabel}`;

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function getSectionRowLabel(entry: DisplayEntry) {
  const now = new Date();
  const displayDate = getDisplayDate(entry);

  if (entry.section === "handled_today") {
    const handledPrefix = "Handled today";

    if (displayDate && !isSameLocalDay(displayDate, now)) {
      return `${handledPrefix} • Due ${formatShortDate(displayDate)}`;
    }

    return handledPrefix;
  }

  if (entry.section === "carried_over") {
    if (!displayDate) return "From before";
    return `Due ${formatShortDate(displayDate)}`;
  }

  if (entry.section === "for_today") {
    return displayDate ? formatUpcomingLabel(displayDate) : "For today";
  }

  if (entry.section === "upcoming") {
    return displayDate ? formatUpcomingLabel(displayDate) : "Upcoming";
  }

  return displayDate ? formatUpcomingLabel(displayDate) : entry.surface_label;
}

function getReminderOriginLabel(entry: DisplayEntry) {
  if (entry.digest_assignment === "daily") return "DAILY";
  if (entry.digest_assignment === "weekly") return "WEEKLY";
  if (entry.digest_assignment === "monthly") return "MONTHLY";
  if (entry.digest_assignment === "quarterly") return "QUARTERLY";
  if (entry.digest_assignment === "yearly") return "YEARLY";
  if (entry.schedule_mode !== "none") return "CUSTOM";
  return "Reminder";
}

function formatDueDateTime(date: Date | null) {
  if (!date) return "";

  const dateText = date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
  });

  const timeText = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dateText} • ${timeText}`;
}

function formatHandledDate(dateString: string | null) {
  if (!dateString) return "";

  const date = new Date(dateString);

  return date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
  });
}

function getEntrySubtitle(entry: DisplayEntry) {
  const displayDate = getDisplayDate(entry);
  const origin = getReminderOriginLabel(entry);

  if (entry.section === "handled_today") {
    const dueText = displayDate ? formatDueDateTime(displayDate) : "";

    if (dueText) {
      return `${origin} • Due ${dueText}`;
    }

    return origin;
  }

  if (entry.section === "for_today") {
    return displayDate ? `${origin} • Due ${formatDueDateTime(displayDate)}` : origin;
  }

  if (entry.section === "carried_over") {
    return displayDate ? `${origin} • Due ${formatDueDateTime(displayDate)}` : origin;
  }

  if (entry.section === "upcoming") {
    return displayDate ? `${origin} • Due ${formatDueDateTime(displayDate)}` : origin;
  }

  return origin;
}

function getEntryModalMeta(entry: DisplayEntry) {
  if (entry.digest_assignment !== "none") {
    return entry.surface_label;
  }

  if (entry.schedule_mode !== "none") {
    return getEntryScheduleSummary(entry) || "Custom Reminder";
  }

  return "No schedule";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(originalDay, daysInMonth));
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  const originalMonth = next.getMonth();
  const originalDay = next.getDate();
  next.setDate(1);
  next.setFullYear(next.getFullYear() + years);
  next.setMonth(originalMonth);
  const daysInMonth = new Date(next.getFullYear(), originalMonth + 1, 0).getDate();
  next.setDate(Math.min(originalDay, daysInMonth));
  return next;
}

function getNextCadenceOccurrence(
  anchorDate: string,
  timeOfDay: string,
  cadence: ReminderScheduleRow["cadence"]
) {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const [hour, minute] = timeOfDay.split(":").map(Number);

  let cursor = new Date(year, month - 1, day, hour, minute, 0, 0);
  const now = new Date();

  while (cursor <= now) {
    if (cadence === "daily") {
      cursor = addDays(cursor, 1);
    } else if (cadence === "weekly") {
      cursor = addDays(cursor, 7);
    } else if (cadence === "monthly") {
      cursor = addMonths(cursor, 1);
    } else if (cadence === "quarterly") {
      cursor = addMonths(cursor, 3);
    } else {
      cursor = addYears(cursor, 1);
    }
  }

  return cursor;
}

function getCurrentCadenceOccurrence(
  anchorDate: string,
  timeOfDay: string,
  cadence: ReminderScheduleRow["cadence"]
) {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const [hour, minute] = timeOfDay.split(":").map(Number);

  let cursor = new Date(year, month - 1, day, hour, minute, 0, 0);
  const now = new Date();

  while (true) {
    let nextCursor: Date;

    if (cadence === "daily") {
      nextCursor = addDays(cursor, 1);
    } else if (cadence === "weekly") {
      nextCursor = addDays(cursor, 7);
    } else if (cadence === "monthly") {
      nextCursor = addMonths(cursor, 1);
    } else if (cadence === "quarterly") {
      nextCursor = addMonths(cursor, 3);
    } else {
      nextCursor = addYears(cursor, 1);
    }

    if (nextCursor > now) {
      return cursor;
    }

    cursor = nextCursor;
  }
}

export default function HomeScreen() {
  const [dailyMessages, setDailyMessages] = useState<DailyMessage[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [verseText, setVerseText] = useState<string | null>(null);
   const [showVerseModal, setShowVerseModal] = useState(false);
  const [showHomeMenu, setShowHomeMenu] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [showRestoreDeletedModal, setShowRestoreDeletedModal] = useState(false);
  const [showUpcomingDaysModal, setShowUpcomingDaysModal] = useState(false);
  const [deletedEntryOptions, setDeletedEntryOptions] = useState<DeletedEntryOption[]>([]);
  const [selectedDeletedEntryIds, setSelectedDeletedEntryIds] = useState<string[]>([]);
  const [isRestoringDeletedEntries, setIsRestoringDeletedEntries] = useState(false);
  const [homeUpcomingDays, setHomeUpcomingDays] = useState(7);
  const [pendingUpcomingDays, setPendingUpcomingDays] = useState("7");
  const [isSavingUpcomingDays, setIsSavingUpcomingDays] = useState(false);
  const [homeEntries, setHomeEntries] = useState<DisplayEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<DisplayEntry | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
   const [isArchivingEntry, setIsArchivingEntry] = useState(false);
  const [isCompletingEntryId, setIsCompletingEntryId] = useState<string | null>(null);
  const [pendingCompleteIds, setPendingCompleteIds] = useState<string[]>([]);
  const [pendingUndoIds, setPendingUndoIds] = useState<string[]>([]);
  const [reminderSchedules, setReminderSchedules] = useState<ReminderScheduleRow[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRegeneratingMessage, setIsRegeneratingMessage] = useState(false);
  const [handledCount, setHandledCount] = useState(0);
  const [animatedMorningMessage, setAnimatedMorningMessage] = useState("");
  const [pendingNotificationData, setPendingNotificationData] = useState<{
    kind?: string;
    cadence?: string;
    entryId?: string;
  } | null>(null);

   const scrollViewRef = useRef<ScrollView | null>(null);
  const messageScrollRef = useRef<ScrollView | null>(null);
  const injectedNotificationHandledRef = useRef(false);
  const upcomingSectionYRef = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const messageWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnimatedMessageRef = useRef<string | null>(null);
  useLocalSearchParams<{ resetHomeAt?: string }>();

  const [backgroundImage] = useState(
    morningImages[Math.floor(Math.random() * morningImages.length)]
  );

  const currentDailyMessage = dailyMessages[currentMessageIndex] ?? null;

   function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 1200);
  }

   async function handleSignOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert("Could not sign out", error.message);
      return;
    }

    setShowHomeMenu(false);
    router.replace("/(auth)");
  }

  async function loadRecentDeletedEntries() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("No user found for recent deleted entries");
      return;
    }

    const { data, error } = await supabase.rpc("get_recent_deleted_entries", {
      p_user_id: user.id,
    });

    if (error) {
      console.log("Load recent deleted entries error:", error.message);
      Alert.alert("Could not load deleted items", error.message);
      return;
    }

    setDeletedEntryOptions((data as DeletedEntryOption[]) ?? []);
    setSelectedDeletedEntryIds([]);
    setShowRestoreDeletedModal(true);
  }

  async function restoreDeletedEntries() {
    if (selectedDeletedEntryIds.length === 0 || isRestoringDeletedEntries) {
      return;
    }

    setIsRestoringDeletedEntries(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.log("No user found for restore deleted entries");
        return;
      }

      const { error } = await supabase.rpc("restore_deleted_entries", {
        p_deleted_entry_ids: selectedDeletedEntryIds,
        p_user_id: user.id,
      });

      if (error) {
        console.log("Restore deleted entries error:", error.message);
        Alert.alert("Unable to restore", error.message);
        return;
      }

      setShowRestoreDeletedModal(false);
      setSelectedDeletedEntryIds([]);
      setDeletedEntryOptions([]);

      await loadHomeEntries();

      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Restore deleted entry notification sync error:", syncError);
      }

      showToast(
        selectedDeletedEntryIds.length === 1
          ? "1 item restored"
          : `${selectedDeletedEntryIds.length} items restored`
      );
    } finally {
      setIsRestoringDeletedEntries(false);
    }
  }

  async function loadHomeUpcomingDays() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load home upcoming days user error:", userError?.message);
      return 7;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("home_upcoming_days")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.log("Load home upcoming days error:", error.message);
      return 7;
    }

    const nextValue =
      typeof data?.home_upcoming_days === "number" ? data.home_upcoming_days : 7;

    setHomeUpcomingDays(nextValue);
    setPendingUpcomingDays(String(nextValue));
    return nextValue;
  }
  async function loadHandledCount() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load handled count user error:", userError?.message);
      return;
    }

    const { count, error } = await supabase
      .from("entry_completion_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (error) {
      console.log("Load handled count error:", error.message);
      return;
    }

    setHandledCount(count ?? 0);
  }
    async function saveHomeUpcomingDays() {
    const parsed = Number(pendingUpcomingDays);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) {
      Alert.alert("Invalid number", "Please enter a whole number from 1 to 90.");
      return;
    }

    setIsSavingUpcomingDays(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.log("Save home upcoming days user error:", userError?.message);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          home_upcoming_days: parsed,
        })
        .eq("id", user.id);

      if (error) {
        console.log("Save home upcoming days error:", error.message);
        Alert.alert("Could not save", error.message);
        return;
      }

      setHomeUpcomingDays(parsed);
      setShowUpcomingDaysModal(false);
      await loadHomeEntries(parsed);

      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, upcomingSectionYRef.current - 12),
          animated: true,
        });
      });
    } finally {
      setIsSavingUpcomingDays(false);
    }
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

      const { error } = await supabase.functions.invoke("generate-entry", {
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

   async function loadHomeEntries(upcomingDaysOverride?: number) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load home entries user error:", userError?.message);
      return;
    }

    try {
      const { error: refreshError } = await supabase.rpc(
        "refresh_stale_recurring_entries",
        {
          p_user_id: user.id,
        }
      );

      if (refreshError) {
        console.log("Refresh stale recurring entries error:", refreshError.message);
      }
    } catch (refreshErr) {
      console.log("Refresh stale recurring entries unexpected error:", refreshErr);
    }

    const upcomingDays = upcomingDaysOverride ?? homeUpcomingDays;

    const { data, error } = await supabase.rpc("get_home_entries", {
      p_user_id: user.id,
      p_reference_ts: new Date().toISOString(),
      p_upcoming_days: upcomingDays,
    });

    if (error) {
      console.log("Load home entries error:", error.message);
      return;
    }

    setHomeEntries(((data as Entry[]) ?? []).map(toDisplayEntry));
  }
async function loadProfileDigestSettings() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load reminder schedules for home user error:", userError?.message);
      return;
    }

    const { error: ensureError } = await supabase.rpc(
      "ensure_default_reminder_schedules",
      {
        p_user_id: user.id,
      }
    );

    if (ensureError) {
      console.log("Ensure default reminder schedules for home error:", ensureError.message);
      return;
    }

    const { data, error } = await supabase
      .from("reminder_schedules")
      .select("cadence, is_enabled, anchor_date, time_of_day")
      .eq("user_id", user.id);

    if (error) {
      console.log("Load reminder schedules for home error:", error.message);
      return;
    }

    setReminderSchedules((data as ReminderScheduleRow[]) ?? []);
  }


  async function loadVerse(reference: string) {
    const { data, error } = await supabase
      .from("bible_verses")
      .select("verse_text")
      .eq("reference", reference)
      .maybeSingle();

    if (error) {
      console.log("Verse load error:", error.message);
      return;
    }

    if (data?.verse_text) {
      setVerseText(data.verse_text);
      setShowVerseModal(true);
    }
  }

  async function fetchEntryById(entryId: string) {
    const { data, error } = await supabase
      .from("entries")
      .select(
        "id, title, content, type, status, created_at, updated_at, resolution_note, archived_at, retired_at, needs_read, last_read_at, last_completed_at, last_completed_due_at, next_due_at, schedule_mode, due_date, due_time, interval_value, interval_unit, annual_month, annual_day, anchor_date, digest_assignment, last_surface_at, last_surface_window_key, last_due_at"
      )
      .eq("id", entryId)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      console.log("Fetch entry by id error:", error.message);
      return null;
    }

    return data ? toDisplayEntry(data as Entry) : null;
  }

  const archiveEntry = async (id: string) => {
    setIsArchivingEntry(true);

    try {
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
        Alert.alert("Unable to archive", error.message);
        return;
      }

      if (selectedEntry?.id === id) {
        setShowEntryModal(false);
        setSelectedEntry(null);
      }

      await loadHomeEntries();

      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Archive notification sync error:", syncError);
      }
    } finally {
      setIsArchivingEntry(false);
    }
  };

   const deleteEntry = async (id: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("No user found for soft delete");
      return;
    }

    const { error } = await supabase.rpc("soft_delete_entry", {
      p_entry_id: id,
      p_user_id: user.id,
    });

    if (error) {
      console.log("Error soft deleting entry:", error.message);
      Alert.alert("Unable to delete", error.message);
      return;
    }

    if (selectedEntry?.id === id) {
      setShowEntryModal(false);
      setSelectedEntry(null);
    }

    await loadHomeEntries();

    try {
      await syncLocalNotifications();
    } catch (syncError) {
      console.log("Delete notification sync error:", syncError);
    }
  };

  const confirmDeleteEntry = (id: string) => {
    Alert.alert(
      "Delete entry?",
      "This item can be restored from Restore Deleted Items for up to 30 days.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteEntry(id),
        },
      ]
    );
  };
  const openEntry = async (entry: DisplayEntry) => {
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
              cadence: getCadence({ ...current, ...data }),
              surface_label: getSurfaceLabel({ ...current, ...data }),
              next_run_at: data.next_due_at ? new Date(data.next_due_at) : null,
              effective_run_at: current.effective_run_at,
            }
          : current
      );
    }

    await loadHomeEntries();

    try {
      await syncLocalNotifications();
    } catch (syncError) {
      console.log("Open entry notification sync error:", syncError);
    }
  };

   const completeEntryCycle = async (entry: DisplayEntry) => {
    if (isCompletingEntryId) return;

    setPendingCompleteIds((current) =>
      current.includes(entry.id) ? current : [...current, entry.id]
    );
    setPendingUndoIds((current) => current.filter((id) => id !== entry.id));
    setIsCompletingEntryId(entry.id);
    showToast('Moving to "Handled Today"');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.log("No user found for complete_entry_cycle");
        return;
      }

      const { data, error } = await supabase.rpc("complete_entry_cycle", {
        p_entry_id: entry.id,
        p_user_id: user.id,
        p_completed_due_at: entry.effective_run_at
          ? entry.effective_run_at.toISOString()
          : entry.next_run_at
          ? entry.next_run_at.toISOString()
          : null,
      });

      if (error) {
        console.log("complete_entry_cycle error:", error.message);
        Alert.alert("Unable to complete", error.message);
        return;
      }

      if (selectedEntry?.id === entry.id && data) {
        setSelectedEntry({
          ...selectedEntry,
          ...data,
          cadence: getCadence({ ...selectedEntry, ...data }),
          surface_label: getSurfaceLabel({ ...selectedEntry, ...data }),
          next_run_at: data.next_due_at ? new Date(data.next_due_at) : null,
          effective_run_at: selectedEntry.effective_run_at,
        });
      }

      await loadHomeEntries();

      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Complete entry notification sync error:", syncError);
      }
    } finally {
      setPendingCompleteIds((current) => current.filter((id) => id !== entry.id));
      setIsCompletingEntryId(null);
    }
  };

  const uncompleteEntryCycle = async (entry: DisplayEntry) => {
    if (isCompletingEntryId) return;

    setPendingUndoIds((current) =>
      current.includes(entry.id) ? current : [...current, entry.id]
    );
    setPendingCompleteIds((current) => current.filter((id) => id !== entry.id));
    setIsCompletingEntryId(entry.id);
    showToast('Moving to "For Today"');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.log("No user found for uncomplete_entry_cycle");
        return;
      }

      const { data, error } = await supabase.rpc("uncomplete_entry_cycle", {
        p_entry_id: entry.id,
        p_user_id: user.id,
      });

      if (error) {
        console.log("uncomplete_entry_cycle error:", error.message);
        Alert.alert("Unable to undo", error.message);
        return;
      }

      if (selectedEntry?.id === entry.id && data) {
        setSelectedEntry({
          ...selectedEntry,
          ...data,
          cadence: getCadence({ ...selectedEntry, ...data }),
          surface_label: getSurfaceLabel({ ...selectedEntry, ...data }),
          next_run_at: data.next_due_at ? new Date(data.next_due_at) : null,
          effective_run_at: selectedEntry.effective_run_at,
        });
      }

      await loadHomeEntries();

      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Undo entry notification sync error:", syncError);
      }
    } finally {
      setPendingUndoIds((current) => current.filter((id) => id !== entry.id));
      setIsCompletingEntryId(null);
    }
  };

   useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function captureNotificationData(data: {
      kind?: string;
      cadence?: string;
      entryId?: string;
    }) {
      if (!isActive) return;
      setPendingNotificationData(data);
    }

    async function hydrateNotificationFromLastResponse() {
      if (injectedNotificationHandledRef.current) return;

      const response = await Notifications.getLastNotificationResponseAsync();
      if (!isActive || !response) return;

      const data = response.notification.request.content.data as {
        kind?: string;
        cadence?: string;
        entryId?: string;
      };

      injectedNotificationHandledRef.current = true;
      await Notifications.clearLastNotificationResponseAsync();
      await captureNotificationData(data);
    }

    const responseListener = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const data = response.notification.request.content.data as {
          kind?: string;
          cadence?: string;
          entryId?: string;
        };

        await Notifications.clearLastNotificationResponseAsync();
        await captureNotificationData(data);
      }
    );

    hydrateNotificationFromLastResponse();

    return () => {
      isActive = false;
      responseListener.remove();
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function processPendingNotification() {
      if (!pendingNotificationData) return;

      if (pendingNotificationData.kind === "cadence") {
        setPendingNotificationData(null);
        router.replace("/(tabs)");
        return;
      }

      if (
        pendingNotificationData.kind === "entry" &&
        typeof pendingNotificationData.entryId === "string"
      ) {
        let matchingEntry =
          homeEntries.find((entry) => entry.id === pendingNotificationData.entryId) ?? null;

        if (!matchingEntry) {
          matchingEntry = await fetchEntryById(pendingNotificationData.entryId);
        }

        if (!matchingEntry || !isActive) {
          return;
        }

        setPendingNotificationData(null);
        setSelectedEntry(null);
        setShowEntryModal(false);

        requestAnimationFrame(() => {
          if (!isActive) return;
          openEntry(matchingEntry as DisplayEntry);
        });
      }
    }

    processPendingNotification();

    return () => {
      isActive = false;
    };
  }, [pendingNotificationData, homeEntries]);

   useEffect(() => {
    async function initialize() {
      const foundMessage = await loadMessage();

      if (!foundMessage) {
        await generateDailyMessage();
      }

        const initialUpcomingDays = await loadHomeUpcomingDays();
      await loadProfileDigestSettings();
      await loadHandledCount();
      await loadHomeEntries(initialUpcomingDays);

      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Initial notification sync error:", syncError);
      }
    }

    initialize();
  }, []);

   useFocusEffect(
    useCallback(() => {
      loadProfileDigestSettings();
      loadHandledCount();
      loadHomeEntries(homeUpcomingDays);

      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      });
    }, [homeUpcomingDays])
  );

  const forTodayEntries = useMemo(
    () => homeEntries.filter((entry) => entry.section === "for_today"),
    [homeEntries]
  );

  const handledTodayEntries = useMemo(
    () => homeEntries.filter((entry) => entry.section === "handled_today"),
    [homeEntries]
  );

  const carriedOverEntries = useMemo(
    () => homeEntries.filter((entry) => entry.section === "carried_over"),
    [homeEntries]
  );

  const upcomingEntries = useMemo(
    () => homeEntries.filter((entry) => entry.section === "upcoming"),
    [homeEntries]
  );

  const selectedEntryIsHandled = useMemo(() => {
    return selectedEntry ? isEntryCurrentlyHandled(selectedEntry, reminderSchedules) : false;
  }, [selectedEntry, reminderSchedules]);

  const backgroundDimOpacity = scrollY.interpolate({
    inputRange: [0, 120, 300, 650],
    outputRange: [0, 0.18, 0.42, 0.72],
    extrapolate: "clamp",
  });

  const fullMorningMessage =
    currentDailyMessage?.message_text ||
    currentDailyMessage?.message ||
    "";

  useEffect(() => {
    const nextMessage = fullMorningMessage.trim();

    if (messageWriteTimeoutRef.current) {
      clearTimeout(messageWriteTimeoutRef.current);
      messageWriteTimeoutRef.current = null;
    }

    if (!nextMessage) {
      setAnimatedMorningMessage("Preparing your morning message…");
      return;
    }

    if (lastAnimatedMessageRef.current === nextMessage) {
      setAnimatedMorningMessage(nextMessage);
      return;
    }

    lastAnimatedMessageRef.current = nextMessage;
    setAnimatedMorningMessage("");

    let cursor = 0;
    const stepSize = nextMessage.length > 70 ? 3 : 2;

    const writeNext = () => {
      cursor = Math.min(nextMessage.length, cursor + stepSize);
      setAnimatedMorningMessage(nextMessage.slice(0, cursor));

      if (cursor < nextMessage.length) {
        messageWriteTimeoutRef.current = setTimeout(writeNext, 42);
      }
    };

    messageWriteTimeoutRef.current = setTimeout(writeNext, 180);

    return () => {
      if (messageWriteTimeoutRef.current) {
        clearTimeout(messageWriteTimeoutRef.current);
        messageWriteTimeoutRef.current = null;
      }
    };
  }, [fullMorningMessage]);

  function renderSectionTitle(title: string, subtitle?: string) {
  
    return (
      <View style={{ marginBottom: 10 }}>
         <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: "white",
            marginBottom: subtitle ? 4 : 0,
            textShadowColor: "rgba(0,0,0,0.35)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
        >
          {title}
        </Text>

        {subtitle ? (
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: "rgba(255,255,255,0.72)",
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  }

   function renderEntryRow(entry: DisplayEntry, allowComplete = false) {
    const isBlue = entry.type === "reminder";
    const isCompleting = isCompletingEntryId === entry.id;
    const isHandled =
      pendingCompleteIds.includes(entry.id) ||
      (entry.section === "handled_today" && !pendingUndoIds.includes(entry.id));

    return (
      <View
        style={{
          marginBottom: 16,
          alignSelf: "stretch",
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Pressable
          onPress={() => openEntry(entry)}
          style={{
            flex: 1,
            alignSelf: "flex-start",
          }}
        >
          <View
            style={{
              alignSelf: "flex-start",
              backgroundColor: isBlue
                ? entry.needs_read
                  ? "#2563eb"
                  : "rgba(219,234,254,0.95)"
                : entry.needs_read
                ? "rgba(0,0,0,0.82)"
                : "rgba(255,255,255,0.7)",
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 11,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: isBlue
                  ? entry.needs_read
                    ? "white"
                    : "#1d4ed8"
                  : entry.needs_read
                  ? "white"
                  : "#111827",
              }}
              numberOfLines={1}
            >
              {entry.title?.trim() || "Untitled Entry"}
            </Text>
          </View>

            <View
            style={{
              alignSelf: "flex-start",
              marginTop: 5,
              backgroundColor: "rgba(107,114,128,0.72)",
              borderRadius: 10,
              paddingVertical: 5,
              paddingHorizontal: 8,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: "white",
              }}
            >
              {getEntrySubtitle(entry)}
            </Text>
          </View>
        </Pressable>

        {allowComplete || isHandled ? (
          <Pressable
            onPress={() => {
              if (isHandled) {
                uncompleteEntryCycle(entry);
              } else {
                completeEntryCycle(entry);
              }
            }}
            disabled={isCompleting}
            hitSlop={10}
            style={{
              width: 48,
              minHeight: 40,
              alignItems: "center",
              justifyContent: "center",
              marginTop: -2,
              marginRight: -4,
            }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                borderWidth: 2,
                borderColor: isHandled ? "#22c55e" : "rgba(255,255,255,0.95)",
                backgroundColor: isHandled
                  ? "#22c55e"
                  : isCompleting
                  ? "rgba(255,255,255,0.35)"
                  : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isHandled ? (
                <Text
                  style={{
                    color: "white",
                    fontSize: 14,
                    fontWeight: "700",
                    lineHeight: 14,
                  }}
                >
                  ✓
                </Text>
              ) : null}
            </View>
          </Pressable>
        ) : null}
      </View>
    );
  }
    function renderSectionCard(
    title: string,
    entries: DisplayEntry[],
    allowComplete = false,
    emptyText?: string,
    variant: "light" | "dark" = "light"
  ) {
    if (entries.length === 0 && !emptyText) return null;

    return (
       <View
        style={{
          backgroundColor:
            variant === "dark"
              ? "rgba(17,24,39,0.58)"
              : "rgba(17,24,39,0.34)",
          borderRadius: 20,
          padding: 14,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
        }}
      >
        {renderSectionTitle(title)}

        {(allowComplete || title === "Handled Today") && entries.length > 0 ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <View />

              <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: "white",
                letterSpacing: 0.2,
                textShadowColor: "rgba(0,0,0,0.25)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
              }}
            >
              Handled
            </Text>
          </View>
        ) : null}

        {entries.length === 0 ? (
          <Text
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.72)",
            }}
          >
            {emptyText}
          </Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id}>{renderEntryRow(entry, allowComplete)}</View>
          ))
        )}
      </View>
    );
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ImageBackground source={backgroundImage} resizeMode="cover" style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
          <LinearGradient
            pointerEvents="none"
            colors={[
              "rgba(255,255,255,0.08)",
              "rgba(255,255,255,0.18)",
              "rgba(255,255,255,0.34)",
            ]}
            style={{
              ...StyleSheet.absoluteFillObject,
            }}
          />

          <Animated.View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: "black",
              opacity: backgroundDimOpacity,
            }}
          />

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={{ flex: 1 }}>
               <View
                pointerEvents="box-none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Pressable
                    onPress={() => setShowHomeMenu(true)}
                    hitSlop={10}
                    style={{
                      width: 40,
                      height: 40,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 20,
                        fontWeight: "700",
                        lineHeight: 20,
                        textShadowColor: "rgba(0,0,0,0.35)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 4,
                      }}
                    >
                      ☰
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => generateDailyMessage(true)}
                    hitSlop={10}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 17,
                        fontWeight: "700",
                        letterSpacing: 0.2,
                        textShadowColor: "rgba(0,0,0,0.35)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 4,
                      }}
                      numberOfLines={1}
                    >
                      Morning Message
                    </Text>
                  </Pressable>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        Alert.alert(
                          "Share",
                          "Share card setup is coming in Phase 3. For now, this is the new header placement."
                        )
                      }
                      hitSlop={10}
                      style={{
                        width: 40,
                        height: 40,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontSize: 18,
                          fontWeight: "700",
                          textShadowColor: "rgba(0,0,0,0.35)",
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 4,
                        }}
                      >
                        ↗
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        Alert.alert(
                          "Handled",
                          `Handled count: ${handledCount}\n\nDetailed stats screen comes next.`
                        )
                      }
                      hitSlop={10}
                      style={{
                        minWidth: 42,
                        height: 30,
                        borderRadius: 15,
                        paddingHorizontal: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(0,0,0,0.22)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.16)",
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontSize: 13,
                          fontWeight: "800",
                          textShadowColor: "rgba(0,0,0,0.25)",
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 3,
                        }}
                      >
                        {handledCount}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <Animated.ScrollView
                ref={scrollViewRef}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                  { useNativeDriver: false }
                )}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingBottom: 220,
                  paddingTop: 92,
                }}
              >
                <Pressable
                  onPress={() => {
                    if (currentDailyMessage?.verse_reference) {
                      loadVerse(currentDailyMessage.verse_reference);
                    }
                  }}
                  onLongPress={() => {
                    generateDailyMessage(true);
                  }}
                  style={{
                    minHeight: 230,
                    paddingTop: 30,
                    paddingBottom: 42,
                    paddingHorizontal: 12,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 34,
                      lineHeight: 44,
                      color: "white",
                      textAlign: "center",
                      fontWeight: "600",
                      letterSpacing: 0.2,
                      textShadowColor: "rgba(0,0,0,0.42)",
                      textShadowOffset: { width: 0, height: 2 },
                      textShadowRadius: 10,
                    }}
                  >
                    {animatedMorningMessage || "Preparing your morning message…"}
                  </Text>

                  {!!currentDailyMessage?.verse_reference && (
                    <View
                      style={{
                        marginTop: 18,
                        alignSelf: "center",
                        paddingVertical: 8,
                        paddingHorizontal: 16,
                        borderRadius: 999,
                        backgroundColor: "rgba(17,24,39,0.24)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.18)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: "#f4ead8",
                          textAlign: "center",
                          fontWeight: "700",
                          letterSpacing: 0.3,
                          textShadowColor: "rgba(0,0,0,0.25)",
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 2,
                        }}
                      >
                        {currentDailyMessage.verse_reference}
                      </Text>
                    </View>
                  )}
                </Pressable>

                <View style={{ height: 8 }} />

                 {renderSectionCard(
                  "For Today",
                  forTodayEntries,
                  true,
                  "Nothing needs attention right now."
                )}

                {renderSectionCard("Carried Over", carriedOverEntries, true)}

                {renderSectionCard(
                  "Handled Today",
                  handledTodayEntries,
                  false,
                  undefined,
                  "dark"
                )}

                 <View
                  onLayout={(event) => {
                    upcomingSectionYRef.current = event.nativeEvent.layout.y;
                  }}
                  style={{
                    backgroundColor: "rgba(17,24,39,0.58)",
                    borderRadius: 20,
                    padding: 14,
                    marginBottom: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <Pressable
                    onPress={() => {
                      setPendingUpcomingDays(String(homeUpcomingDays));
                      setShowUpcomingDaysModal(true);
                    }}
                    style={{
                      alignSelf: "flex-start",
                      marginBottom: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: "700",
                        color: "white",
                        textShadowColor: "rgba(0,0,0,0.35)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 4,
                      }}
                    >
                      {`Upcoming · Next ${homeUpcomingDays} day${homeUpcomingDays === 1 ? "" : "s"} ▼`}
                    </Text>
                  </Pressable>

                  {upcomingEntries.length === 0 ? (
                  <Text
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.72)",
                    }}
                  >
                      Nothing upcoming in this range.
                    </Text>
                  ) : (
                    upcomingEntries.map((entry) => (
                      <View key={entry.id}>{renderEntryRow(entry, true)}</View>
                    ))
                  )}
                </View>
              </Animated.ScrollView>
            </View>
          </KeyboardAvoidingView>

          {isArchivingEntry ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 50,
                elevation: 50,
                backgroundColor: "rgba(0,0,0,0.28)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  minWidth: 180,
                  paddingVertical: 16,
                  paddingHorizontal: 22,
                  borderRadius: 18,
                  backgroundColor: "rgba(255,255,255,0.96)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.95)",
                  shadowColor: "#000",
                  shadowOpacity: 0.18,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 10,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "#111827",
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                >
                  Archiving...
                </Text>
              </View>
            </View>
          ) : null}

          {toastMessage ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 110,
                alignItems: "center",
                zIndex: 60,
                elevation: 60,
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(31,31,31,0.82)",
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {toastMessage}
                </Text>
              </View>
            </View>
          ) : null}

           <Modal visible={showEntryModal} animationType="slide" presentationStyle="fullScreen">
            <View style={{ flex: 1 }}>
              <ImageBackground
                source={backgroundImage}
                resizeMode="cover"
                style={{ flex: 1 }}
              >
                <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.58)" }}>
                  <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                  >
                    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            paddingHorizontal: 20,
                            paddingTop: 8,
                            paddingBottom: 10,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "flex-end",
                              marginBottom: 8,
                            }}
                          >
                            <Pressable
                              onPress={() => {
                                setShowEntryModal(false);
                                setSelectedEntry(null);
                              }}
                              hitSlop={10}
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 17,
                                backgroundColor: "rgba(255,255,255,0.82)",
                                alignItems: "center",
                                justifyContent: "center",
                                borderWidth: 1,
                                borderColor: "rgba(255,255,255,0.92)",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 18,
                                  fontWeight: "700",
                                  color: "#374151",
                                  lineHeight: 18,
                                }}
                              >
                                ×
                              </Text>
                            </Pressable>
                          </View>

                          {!!selectedEntry && (
                            <View
                              style={{
                                alignItems: "center",
                                paddingHorizontal: 14,
                                marginBottom: 10,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "700",
                                  letterSpacing: 1.2,
                                  color: "#4b5563",
                                  textTransform: "uppercase",
                                  marginBottom: 18,
                                }}
                              >
                                {getEntryTypeLabel(selectedEntry.type)}
                              </Text>

                              <Text
                                style={{
                                  fontSize: 28,
                                  fontWeight: "700",
                                  color: "#111827",
                                  textAlign: "center",
                                  lineHeight: 34,
                                  marginBottom: 4,
                                }}
                              >
                                {selectedEntry.title?.trim() || "Untitled Entry"}
                              </Text>
                            </View>
                          )}
                        </View>

                        <ScrollView
                          keyboardShouldPersistTaps="handled"
                          showsVerticalScrollIndicator={false}
                          contentContainerStyle={{
                            paddingHorizontal: 20,
                            paddingTop: 4,
                            paddingBottom: 170,
                            alignItems: "stretch",
                          }}
                        >
                          {!!selectedEntry && (
                            <>
                              <View
                                style={{
                                  backgroundColor: "rgba(255,255,255,0.88)",
                                  borderRadius: 24,
                                  paddingVertical: 28,
                                  paddingHorizontal: 22,
                                  borderWidth: 1,
                                  borderColor: "rgba(255,255,255,0.95)",
                                  shadowColor: "#000",
                                  shadowOpacity: 0.08,
                                  shadowRadius: 18,
                                  shadowOffset: { width: 0, height: 8 },
                                  elevation: 6,
                                  marginBottom: 18,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 19,
                                    lineHeight: 33,
                                    color: "#1f2937",
                                    textAlign: "left",
                                    fontWeight: "500",
                                  }}
                                >
                                  {selectedEntry.content}
                                </Text>
                              </View>

                              <View
                                style={{
                                  alignItems: "center",
                                  marginBottom: 18,
                                  paddingHorizontal: 14,
                                }}
                              >
                            {getEntryMetaLines(selectedEntry, reminderSchedules).map((line, index) => (
                                  <Text
                                    key={`${selectedEntry.id}-meta-${index}`}
                                    style={{
                                      fontSize: 13,
                                      fontWeight: "600",
                                      color: "#4b5563",
                                      textAlign: "center",
                                      lineHeight: 21,
                                      marginTop: index === 0 ? 0 : 2,
                                    }}
                                  >
                                    {line}
                                  </Text>
                                ))}
                              </View>

                              <View style={{ height: 6 }} />
                            </>
                          )}
                        </ScrollView>

                        {!!selectedEntry && (
                          <View
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              bottom: 0,
                              paddingHorizontal: 18,
                              paddingTop: 12,
                              paddingBottom: 20,
                              backgroundColor: "rgba(255,255,255,0.82)",
                              borderTopWidth: 1,
                              borderTopColor: "rgba(255,255,255,0.95)",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "stretch",
                                gap: 8,
                                marginBottom: 8,
                              }}
                            >
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
                                hitSlop={10}
                                style={{
                                  flex: 1,
                                  minHeight: 48,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: "rgba(107,114,128,0.38)",
                                  backgroundColor: "rgba(255,255,255,0.62)",
                                  paddingHorizontal: 8,
                                }}
                              >
                                <Text
                                  style={{
                                    color: "#374151",
                                    fontSize: 14,
                                    fontWeight: "700",
                                    textAlign: "center",
                                  }}
                                >
                                  Edit
                                </Text>
                              </Pressable>

                              <Pressable
                                onPress={() => {
                                  if (!selectedEntry) return;
                                  setShowEntryModal(false);
                                  archiveEntry(selectedEntry.id);
                                }}
                                hitSlop={10}
                                style={{
                                  flex: 1,
                                  minHeight: 48,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: "rgba(107,114,128,0.38)",
                                  backgroundColor: "rgba(255,255,255,0.62)",
                                  paddingHorizontal: 8,
                                }}
                              >
                                <Text
                                  style={{
                                    color: "#374151",
                                    fontSize: 14,
                                    fontWeight: "700",
                                    textAlign: "center",
                                  }}
                                >
                                  Archive
                                </Text>
                              </Pressable>

                              <Pressable
                                onPress={() => {
                                  if (!selectedEntry) return;
                                  confirmDeleteEntry(selectedEntry.id);
                                }}
                                hitSlop={10}
                                style={{
                                  flex: 1,
                                  minHeight: 48,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: "rgba(107,114,128,0.38)",
                                  backgroundColor: "rgba(255,255,255,0.62)",
                                  paddingHorizontal: 8,
                                }}
                              >
                                <Text
                                  style={{
                                    color: "#7f1d1d",
                                    fontSize: 14,
                                    fontWeight: "700",
                                    textAlign: "center",
                                  }}
                                >
                                  Delete
                                </Text>
                              </Pressable>
                            </View>

                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "stretch",
                                gap: 8,
                              }}
                            >
                              <Pressable
                                onPress={() => {
                                  setShowEntryModal(false);
                                  setSelectedEntry(null);
                                }}
                                hitSlop={10}
                                style={{
                                  flex: 1,
                                  minHeight: 54,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: "rgba(107,114,128,0.38)",
                                  backgroundColor: "rgba(255,255,255,0.62)",
                                  paddingHorizontal: 10,
                                }}
                              >
                                <Text
                                  style={{
                                    color: "#374151",
                                    fontSize: 15,
                                    fontWeight: "700",
                                    textAlign: "center",
                                  }}
                                >
                                  Return
                                </Text>
                              </Pressable>

                              <Pressable
                                onPress={() => {
                                  if (!selectedEntry) return;

                                  if (selectedEntryIsHandled) {
                                    uncompleteEntryCycle(selectedEntry);
                                  } else {
                                    completeEntryCycle(selectedEntry);
                                  }

                                  setShowEntryModal(false);
                                }}
                                hitSlop={10}
                                style={{
                                  flex: 1,
                                  minHeight: 54,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: "rgba(107,114,128,0.38)",
                                  backgroundColor: "rgba(255,255,255,0.62)",
                                  paddingHorizontal: 10,
                                }}
                              >
                                <Text
                                  style={{
                                    color: "#166534",
                                    fontSize: 15,
                                    fontWeight: "700",
                                    textAlign: "center",
                                    lineHeight: 19,
                                  }}
                                >
                                  {selectedEntryIsHandled ? "Undo Handled" : "Mark Handled"}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        )}
                      </View>
                    </SafeAreaView>
                  </KeyboardAvoidingView>
                </View>
              </ImageBackground>
            </View>
          </Modal>

          <Modal visible={showHomeMenu} transparent animationType="fade">
            <Pressable
              onPress={() => setShowHomeMenu(false)}
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.18)",
                justifyContent: "flex-start",
                alignItems: "flex-end",
                paddingTop: 86,
                paddingRight: 16,
                paddingLeft: 16,
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  width: 220,
                  backgroundColor: "rgba(255,255,255,0.97)",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.95)",
                  overflow: "hidden",
                }}
              >
                 <Pressable
                  onPress={() => {
                    setShowHomeMenu(false);
                    Alert.alert("Account", "Account screen coming soon.");
                  }}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: "#e5e7eb",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: "#111827",
                    }}
                  >
                    Account
                  </Text>
                </Pressable>

                 <Pressable
                  onPress={async () => {
                    setShowHomeMenu(false);
                    await loadRecentDeletedEntries();
                  }}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: "#e5e7eb",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: "#111827",
                    }}
                  >
                    Restore Deleted Items
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleSignOut}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: "#b91c1c",
                    }}
                  >
                    Sign Out
                  </Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal visible={showUpcomingDaysModal} transparent animationType="fade">
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              <Pressable
                onPress={() => {
                  if (isSavingUpcomingDays) return;
                  setShowUpcomingDaysModal(false);
                  setPendingUpcomingDays(String(homeUpcomingDays));
                }}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.22)",
                  justifyContent: isKeyboardVisible ? "flex-start" : "center",
                  paddingHorizontal: 20,
                  paddingTop: isKeyboardVisible ? 120 : 40,
                  paddingBottom: 40,
                }}
              >
                <Pressable
                  onPress={() => {}}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.97)",
                    borderRadius: 22,
                    padding: 20,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.95)",
                  }}
                >
                  <Pressable
                    onPress={() => {
                      if (isSavingUpcomingDays) return;
                      setShowUpcomingDaysModal(false);
                      setPendingUpcomingDays(String(homeUpcomingDays));
                    }}
                    hitSlop={10}
                    style={{
                      position: "absolute",
                      top: 14,
                      right: 14,
                      zIndex: 2,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0,0,0,0.08)",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: "#444",
                        lineHeight: 16,
                      }}
                    >
                      ×
                    </Text>
                  </Pressable>

                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "700",
                      color: "#111827",
                      textAlign: "center",
                      marginBottom: 6,
                    }}
                  >
                    Upcoming Range
                  </Text>

                  <Text
                    style={{
                      fontSize: 13,
                      lineHeight: 19,
                      color: "#4b5563",
                      textAlign: "center",
                      marginBottom: 16,
                    }}
                  >
                    Choose how many days to view.
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                      marginBottom: 16,
                    }}
                  >
                    {[3, 7, 14, 30, 60, 90].map((value) => {
                      const isSelected = pendingUpcomingDays === String(value);

                      return (
                        <Pressable
                          key={value}
                          onPress={async () => {
                            if (isSavingUpcomingDays) return;
                            setPendingUpcomingDays(String(value));

                            const {
                              data: { user },
                              error: userError,
                            } = await supabase.auth.getUser();

                            if (userError || !user) {
                              console.log(
                                "Quick save home upcoming days user error:",
                                userError?.message
                              );
                              return;
                            }

                            setIsSavingUpcomingDays(true);

                            try {
                              const { error } = await supabase
                                .from("profiles")
                                .update({
                                  home_upcoming_days: value,
                                })
                                .eq("id", user.id);

                              if (error) {
                                console.log(
                                  "Quick save home upcoming days error:",
                                  error.message
                                );
                                Alert.alert("Could not save", error.message);
                                return;
                              }

                              setHomeUpcomingDays(value);
                              setShowUpcomingDaysModal(false);
                              await loadHomeEntries(value);

                              requestAnimationFrame(() => {
                                scrollViewRef.current?.scrollTo({
                                  y: Math.max(0, upcomingSectionYRef.current - 12),
                                  animated: true,
                                });
                              });
                            } finally {
                              setIsSavingUpcomingDays(false);
                            }
                          }}
                          style={{
                            paddingVertical: 9,
                            paddingHorizontal: 12,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: isSelected ? "#2563eb" : "#d1d5db",
                            backgroundColor: isSelected ? "#eff6ff" : "white",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: isSelected ? "#1d4ed8" : "#374151",
                            }}
                          >
                            {value} days
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <TextInput
                      value={pendingUpcomingDays}
                      onChangeText={(value) =>
                        setPendingUpcomingDays(value.replace(/[^0-9]/g, "").slice(0, 2))
                      }
                      keyboardType="number-pad"
                      placeholder="7"
                      placeholderTextColor="#9ca3af"
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: "#d1d5db",
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        backgroundColor: "white",
                        color: "black",
                        fontSize: 16,
                        textAlign: "center",
                      }}
                    />

                    <Pressable
                      onPress={saveHomeUpcomingDays}
                      disabled={isSavingUpcomingDays}
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 23,
                        backgroundColor: "#2563eb",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: isSavingUpcomingDays ? 0.7 : 1,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: "white",
                        }}
                      >
                        {isSavingUpcomingDays ? "..." : "Go"}
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>

          <Modal visible={showRestoreDeletedModal} transparent animationType="fade">
            <Pressable
              onPress={() => {
                if (isRestoringDeletedEntries) return;
                setShowRestoreDeletedModal(false);
                setSelectedDeletedEntryIds([]);
              }}
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.22)",
                justifyContent: "center",
                paddingHorizontal: 20,
                paddingVertical: 40,
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  backgroundColor: "rgba(255,255,255,0.97)",
                  borderRadius: 22,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.95)",
                }}
              >
                <Pressable
                  onPress={() => {
                    if (isRestoringDeletedEntries) return;
                    setShowRestoreDeletedModal(false);
                    setSelectedDeletedEntryIds([]);
                  }}
                  hitSlop={10}
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    zIndex: 2,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.08)",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: "#444",
                      lineHeight: 16,
                    }}
                  >
                    ×
                  </Text>
                </Pressable>

                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "700",
                    color: "#111827",
                    textAlign: "center",
                    marginBottom: 6,
                    paddingHorizontal: 20,
                  }}
                >
                  Restore Deleted Items
                </Text>

                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 19,
                    color: "#4b5563",
                    textAlign: "center",
                    marginBottom: 14,
                  }}
                >
                  Select from your 5 most recently deleted items.
                </Text>

                {deletedEntryOptions.length > 0 ? (
                  <>
                    <Pressable
                      onPress={() => {
                        const allIds = deletedEntryOptions.map((item) => item.deleted_entry_id);
                        const isAllSelected =
                          allIds.length > 0 &&
                          allIds.every((id) => selectedDeletedEntryIds.includes(id));

                        setSelectedDeletedEntryIds(isAllSelected ? [] : allIds);
                      }}
                      style={{
                        alignSelf: "flex-start",
                        marginBottom: 12,
                        backgroundColor: "rgba(243,244,246,0.95)",
                        borderRadius: 999,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: "#e5e7eb",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: "#374151",
                        }}
                      >
                        {deletedEntryOptions.length > 0 &&
                        deletedEntryOptions.every((item) =>
                          selectedDeletedEntryIds.includes(item.deleted_entry_id)
                        )
                          ? "Clear All"
                          : "Select All"}
                      </Text>
                    </Pressable>

                    <View style={{ marginBottom: 16 }}>
                      {deletedEntryOptions.map((item) => {
                        const isSelected = selectedDeletedEntryIds.includes(item.deleted_entry_id);

                        return (
                          <Pressable
                            key={item.deleted_entry_id}
                            onPress={() => {
                              setSelectedDeletedEntryIds((current) =>
                                current.includes(item.deleted_entry_id)
                                  ? current.filter((id) => id !== item.deleted_entry_id)
                                  : [...current, item.deleted_entry_id]
                              );
                            }}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingVertical: 11,
                              borderBottomWidth: 1,
                              borderBottomColor: "#f1f5f9",
                              gap: 10,
                            }}
                          >
                            <View
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 11,
                                borderWidth: 2,
                                borderColor: isSelected ? "#2563eb" : "#cbd5e1",
                                backgroundColor: isSelected ? "#2563eb" : "transparent",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {isSelected ? (
                                <Text
                                  style={{
                                    color: "white",
                                    fontSize: 12,
                                    fontWeight: "700",
                                    lineHeight: 12,
                                  }}
                                >
                                  ✓
                                </Text>
                              ) : null}
                            </View>

                            <Text
                              style={{
                                flex: 1,
                                fontSize: 15,
                                fontWeight: "600",
                                color: "#111827",
                              }}
                              numberOfLines={1}
                            >
                              {item.title?.trim() || "Untitled Entry"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          if (isRestoringDeletedEntries) return;
                          setShowRestoreDeletedModal(false);
                          setSelectedDeletedEntryIds([]);
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 13,
                          borderRadius: 12,
                          backgroundColor: "#f3f4f6",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: "#374151",
                          }}
                        >
                          Cancel
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={restoreDeletedEntries}
                        disabled={
                          selectedDeletedEntryIds.length === 0 || isRestoringDeletedEntries
                        }
                        style={{
                          flex: 1,
                          paddingVertical: 13,
                          borderRadius: 12,
                          backgroundColor:
                            selectedDeletedEntryIds.length === 0 || isRestoringDeletedEntries
                              ? "#93c5fd"
                              : "#2563eb",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: "white",
                          }}
                        >
                          {isRestoringDeletedEntries ? "Restoring..." : "Restore"}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <View
                      style={{
                        paddingVertical: 24,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: "#6b7280",
                          textAlign: "center",
                        }}
                      >
                        No recently deleted items.
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        setShowRestoreDeletedModal(false);
                        setSelectedDeletedEntryIds([]);
                      }}
                      style={{
                        alignSelf: "center",
                        paddingVertical: 10,
                        paddingHorizontal: 18,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: "#374151",
                        }}
                      >
                        Close
                      </Text>
                    </Pressable>
                  </>
                )}
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
      </ImageBackground>
    </GestureHandlerRootView>
  );
}