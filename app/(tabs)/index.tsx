import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
 if (entry.digest_assignment === "none" && entry.schedule_mode === "none") {
    return !!entry.last_completed_at;
}}

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
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [homeEntries, setHomeEntries] = useState<DisplayEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<DisplayEntry | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [isArchivingEntry, setIsArchivingEntry] = useState(false);
  const [isCompletingEntryId, setIsCompletingEntryId] = useState<string | null>(null);
  const [reminderSchedules, setReminderSchedules] = useState<ReminderScheduleRow[]>([]);
   const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRegeneratingMessage, setIsRegeneratingMessage] = useState(false);
  const [pendingNotificationData, setPendingNotificationData] = useState<{
    kind?: string;
    cadence?: string;
    entryId?: string;
  } | null>(null);

  const scrollViewRef = useRef<ScrollView | null>(null);
  const messageScrollRef = useRef<ScrollView | null>(null);
  const injectedNotificationHandledRef = useRef(false);

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

  async function loadHomeEntries() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load home entries user error:", userError?.message);
      return;
    }

    const { data, error } = await supabase.rpc("get_home_entries", {
      p_user_id: user.id,
      p_reference_ts: new Date().toISOString(),
      p_upcoming_days: 7,
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
    const { error } = await supabase.from("entries").delete().eq("id", id);

    if (error) {
      console.log("Error deleting entry:", error.message);
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

    setIsCompletingEntryId(entry.id);

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
      showToast("Moved to Handled Today");
      
      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Complete entry notification sync error:", syncError);
      }
    } finally {
      setIsCompletingEntryId(null);
    }
  };

  const uncompleteEntryCycle = async (entry: DisplayEntry) => {
    if (isCompletingEntryId) return;

    setIsCompletingEntryId(entry.id);

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
      showToast("Moved back to For Today");

      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Undo entry notification sync error:", syncError);
      }
    } finally {
      setIsCompletingEntryId(null);
    }
  };

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

      await loadProfileDigestSettings();
      await loadHomeEntries();

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
      loadHomeEntries();

      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      });
    }, [])
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

  function renderComposeCard() {
    return (
      <Pressable
        onPress={() => {
          router.push({
            pathname: "/compose",
            params: {
              mode: "create",
            },
          });
        }}
        style={{
          backgroundColor: "rgba(255,255,255,0.82)",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.82)",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
          marginHorizontal: 20,
          marginBottom: 14,
          paddingHorizontal: 16,
          paddingVertical: 18,
          minHeight: 84,
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#6b7280",
            lineHeight: 24,
            fontSize: 17,
            fontWeight: "500",
            fontStyle: "italic",
            textAlign: "center",
          }}
        >
          ✏️ Tap to write a prayer, goal, affirmation or reminder
        </Text>
      </Pressable>
    );
  }

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
              color: "#4b5563",
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
    const isHandled = entry.section === "handled_today";

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
            style={{
              width: 38,
              alignItems: "center",
              paddingTop: 2,
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
    emptyText?: string
  ) {
    if (entries.length === 0 && !emptyText) return null;

    return (
      <View
        style={{
          backgroundColor: "rgba(255,255,255,0.18)",
          borderRadius: 18,
          padding: 14,
          marginBottom: 14,
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
              color: "#4b5563",
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
              <View
                style={{
                  marginBottom: 8,
                  backgroundColor: "rgba(40,40,40,0.25)",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontSize: 16,
                    fontWeight: "700",
                    color: "white",
                    letterSpacing: 0.2,
                  }}
                >
                  Morning Message
                  {currentDailyMessage?.message_date
                    ? ` - ${new Date(currentDailyMessage.message_date).toLocaleDateString()}`
                    : ""}
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  if (dailyMessages.length > 0) {
                    setShowMessageModal(true);
                  }
                }}
                onLongPress={() => {
                  generateDailyMessage(true);
                }}
                style={{
                  marginBottom: 12,
                  marginHorizontal: 20,
                  minHeight: 104,
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.76)",
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.76)",
                  overflow: "hidden",
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                }}
              >
                {dailyMessages.length > 0 ? (
                  <View
                    style={{
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        textAlign: "center",
                        color: "#111",
                        lineHeight: 22,
                        fontWeight: "500",
                      }}
                      numberOfLines={3}
                    >
                      {currentDailyMessage?.message || "Preparing your morning message…"}
                    </Text>

                    {!!currentDailyMessage?.verse_reference && (
                      <Pressable
                        onPress={() => {
                          if (currentDailyMessage?.verse_reference) {
                            loadVerse(currentDailyMessage.verse_reference);
                          }
                        }}
                        hitSlop={10}
                        style={{ marginTop: 8 }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#111",
                            textAlign: "center",
                            textDecorationLine: "underline",
                            fontWeight: "600",
                          }}
                        >
                          {currentDailyMessage.verse_reference}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      textAlign: "center",
                      color: "#111",
                      lineHeight: 22,
                      fontWeight: "500",
                      maxWidth: 320,
                      opacity: 0.7,
                    }}
                  >
                    Preparing your morning message…
                  </Text>
                )}
              </Pressable>

              {renderComposeCard()}

              <ScrollView
                ref={scrollViewRef}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingBottom: 220,
                  paddingTop: 4,
                }}
              >
                {renderSectionCard(
                  "For Today",
                  forTodayEntries,
                  true,
                  "Nothing needs attention right now."
                )}

                {renderSectionCard("Handled Today", handledTodayEntries, false)}

                {renderSectionCard("Carried Over", carriedOverEntries, true)}

                {renderSectionCard("Upcoming", upcomingEntries, true)}
              </ScrollView>
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

          <Modal visible={showMessageModal} transparent animationType="fade">
            <Pressable
              onPress={() => setShowMessageModal(false)}
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
                  backgroundColor: "rgba(255,255,255,0.96)",
                  borderRadius: 22,
                  padding: 22,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.95)",
                }}
              >
                <Pressable
                  onPress={() => setShowMessageModal(false)}
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
                    fontSize: 18,
                    fontWeight: "700",
                    color: "#111",
                    textAlign: "center",
                    marginBottom: 10,
                    paddingHorizontal: 20,
                  }}
                >
                  Morning Message
                  {currentDailyMessage?.message_date
                    ? ` - ${new Date(currentDailyMessage.message_date).toLocaleDateString()}`
                    : ""}
                </Text>

                <Text
                  style={{
                    fontSize: 17,
                    lineHeight: 28,
                    color: "#111",
                    textAlign: "center",
                    fontWeight: "500",
                    marginBottom: 14,
                  }}
                >
                  {currentDailyMessage?.message || "Preparing your morning message…"}
                </Text>

                {!!currentDailyMessage?.verse_reference && (
                  <Text
                    style={{
                      fontSize: 13,
                      color: "#111",
                      textAlign: "center",
                      fontWeight: "700",
                      marginBottom: 12,
                    }}
                  >
                    {currentDailyMessage.verse_reference}
                  </Text>
                )}

                {!!currentDailyMessage?.verse_reference && (
                  <Pressable
                    hitSlop={12}
                    onPress={() => {
                      setShowMessageModal(false);
                      if (currentDailyMessage?.verse_reference) {
                        loadVerse(currentDailyMessage.verse_reference);
                      }
                    }}
                    style={{
                      paddingTop: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#111",
                        textAlign: "center",
                        textDecorationLine: "underline",
                        fontWeight: "600",
                      }}
                    >
                      Read {currentDailyMessage.verse_reference}
                    </Text>
                  </Pressable>
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