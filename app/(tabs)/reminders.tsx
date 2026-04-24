import { useFocusEffect } from "@react-navigation/native";
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
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { syncLocalNotifications } from "../../lib/notifications/syncNotifications";
import { supabase } from "../../lib/supabase";

const reminderBackground = require("../../assets/images/morning-nature-19.jpg");

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
  last_completed_at: string | null;
  last_completed_due_at: string | null;
  next_due_at: string | null;
  schedule_mode: string;
  due_date: string | null;
  due_time: string | null;
  interval_value: number | null;
  interval_unit: string | null;
  annual_month: number | null;
  annual_day: number | null;
  anchor_date: string | null;
  digest_assignment: "none" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  last_surface_at: string | null;
  last_surface_window_key: string | null;
};

type UpcomingEntry = Entry & {
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
  next_run_at: Date | null;
  last_completed_at_date: Date | null;
  last_completed_due_at_date: Date | null;
  surface_label: string;
};

type WeekdayValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type ReminderScheduleRow = {
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  is_enabled: boolean;
  anchor_date: string;
  time_of_day: string;
};

type ReminderScheduleStatus = {
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  is_enabled: boolean;
};

type EntryGroupKey =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom"
  | "handled";

type EntryGroup = {
  key: EntryGroupKey;
  title: string;
  statusText?: string;
  showCustomNote?: boolean;
  entries: UpcomingEntry[];
};

type CadenceFilterOption =
  | "all"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom"
  | "handled";

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
  entry: UpcomingEntry,
  schedules: ReminderScheduleRow[]
) {
  if (entry.digest_assignment === "none") return null;
  return schedules.find((item) => item.cadence === entry.digest_assignment) ?? null;
}

function isEntryCurrentlyHandled(
  entry: Entry | UpcomingEntry,
  schedules: ReminderScheduleRow[]
) {
  if (!entry.last_completed_at) return false;

   if (entry.digest_assignment === "none" && entry.schedule_mode === "none") {
    return !!entry.last_completed_at;
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
    if (!entry.last_completed_due_at || !entry.next_due_at) return false;
    return Date.now() < new Date(entry.next_due_at).getTime();
  }

  if (entry.schedule_mode === "fixed_date") {
    return !!entry.last_completed_at;
  }

  return false;
}

function getEntryMetaLines(entry: UpcomingEntry, schedules: ReminderScheduleRow[]) {
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

function formatUpcomingLabel(nextRunAt: Date | null) {
  if (!nextRunAt) return "";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(
    nextRunAt.getFullYear(),
    nextRunAt.getMonth(),
    nextRunAt.getDate()
  );

  const dayDiff = Math.round(
    (targetStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timeLabel = nextRunAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (dayDiff === 0) return `Today • ${timeLabel}`;
  if (dayDiff === 1) return `Tomorrow • ${timeLabel}`;
  if (dayDiff > 1 && dayDiff <= 7) return `In ${dayDiff} days • ${timeLabel}`;

  return nextRunAt.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function getCustomInlineSummary(entry: UpcomingEntry) {
  if (entry.schedule_mode === "none") {
    return "No schedule";
  }

  const dueLabel = entry.next_run_at
    ? `Due ${entry.next_run_at.toLocaleDateString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
      })}${entry.next_run_at ? ` • ${entry.next_run_at.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}` : ""}`
    : null;

  const scheduleSummary = getEntryScheduleSummary(entry);

  if (entry.schedule_mode === "fixed_date") {
    return dueLabel || scheduleSummary || "Custom schedule";
  }

  if (dueLabel && scheduleSummary) {
    return `${dueLabel} • ${scheduleSummary}`;
  }

  if (dueLabel) {
    return dueLabel;
  }

  if (scheduleSummary) {
    return scheduleSummary;
  }

  return "Custom schedule";
}

function formatCadenceHeaderLabel(
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "yearly",
  schedules: ReminderScheduleRow[]
) {
  const schedule = schedules.find((item) => item.cadence === cadence) ?? null;

  if (!schedule) {
    return cadence.charAt(0).toUpperCase() + cadence.slice(1);
  }

  const timeLabel = formatDisplayTime(schedule.time_of_day);

  if (cadence === "daily") {
    return `Daily - ${timeLabel}`;
  }

  if (cadence === "weekly") {
    const weeklyAnchorDay = schedule.anchor_date
      ? new Date(`${schedule.anchor_date}T00:00:00`).getDay()
      : 0;

    return `Weekly - ${weekdayLabel(weeklyAnchorDay as WeekdayValue)} @ ${timeLabel}`;
  }

  if (cadence === "monthly") {
    const monthlyDay = schedule.anchor_date
      ? new Date(`${schedule.anchor_date}T00:00:00`).getDate()
      : 1;

    return `Monthly - Day ${monthlyDay} @ ${timeLabel}`;
  }

  const recurringDate = schedule.anchor_date
    ? new Date(`${schedule.anchor_date}T00:00:00`)
    : new Date("2026-01-01T00:00:00");

  const monthDay = recurringDate.toLocaleDateString([], {
    month: "long",
    day: "numeric",
  });

  if (cadence === "quarterly") {
    return `Quarterly - ${monthDay} @ ${timeLabel}`;
  }

  return `Yearly - ${monthDay} @ ${timeLabel}`;
}

function getCadenceSummaryText(
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "yearly",
  schedules: ReminderScheduleRow[]
) {
  const schedule = schedules.find((item) => item.cadence === cadence) ?? null;

  if (!schedule) {
    return "";
  }

  const timeLabel = formatDisplayTime(schedule.time_of_day);

  let firstSentence = "";

  if (cadence === "daily") {
    firstSentence = `Daily reminder is set for ${timeLabel}.`;
  } else if (cadence === "weekly") {
    const weeklyAnchorDay = schedule.anchor_date
      ? new Date(`${schedule.anchor_date}T00:00:00`).getDay()
      : 0;

    firstSentence = `Weekly reminder is set for ${weekdayLabel(
      weeklyAnchorDay as WeekdayValue
    )}'s at ${timeLabel}.`;
  } else if (cadence === "monthly") {
    const monthlyDay = schedule.anchor_date
      ? new Date(`${schedule.anchor_date}T00:00:00`).getDate()
      : 1;

firstSentence = `Monthly reminder is set for the ${getOrdinal(monthlyDay)} at ${timeLabel}.`;
  } else {
    const recurringDate = schedule.anchor_date
      ? new Date(`${schedule.anchor_date}T00:00:00`)
      : new Date("2026-01-01T00:00:00");

    const monthDay = recurringDate.toLocaleDateString([], {
      month: "long",
      day: "numeric",
    });

     const monthName = recurringDate.toLocaleDateString([], {
      month: "long",
    });
    const dayOfMonth = recurringDate.getDate();
    const monthDayWithOrdinal = `${monthName} ${getOrdinal(dayOfMonth)}`;

    firstSentence =
      cadence === "quarterly"
        ? `Quarterly reminder is set for ${monthDayWithOrdinal} at ${timeLabel}.`
        : `Yearly reminder is set for ${monthDayWithOrdinal} at ${timeLabel}.`;
  }

  if (!schedule.is_enabled) {
    return `${firstSentence} ${cadence.charAt(0).toUpperCase() + cadence.slice(1)} cadence notifications are currently turned off.`;
  }

  return firstSentence;
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

function getHandledInlineSummary(entry: UpcomingEntry) {
  const origin =
    entry.digest_assignment === "daily"
      ? "DAILY"
      : entry.digest_assignment === "weekly"
      ? "WEEKLY"
      : entry.digest_assignment === "monthly"
      ? "MONTHLY"
      : entry.digest_assignment === "quarterly"
      ? "QUARTERLY"
      : entry.digest_assignment === "yearly"
      ? "YEARLY"
      : entry.schedule_mode !== "none"
      ? "CUSTOM"
      : "REMINDER";

  const showDueLabel = origin === "CUSTOM";

  const dueDate = entry.last_completed_due_at_date
    ? `${entry.last_completed_due_at_date.toLocaleDateString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
      })} • ${entry.last_completed_due_at_date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : null;

  const handledDate = entry.last_completed_at_date
    ? entry.last_completed_at_date.toLocaleDateString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
      })
    : null;

  if (dueDate && handledDate) {
    return showDueLabel
      ? `${origin} • Due ${dueDate} • Handled ${handledDate}`
      : `${origin} • ${dueDate} • Handled ${handledDate}`;
  }

  if (dueDate) {
    return showDueLabel ? `${origin} • Due ${dueDate}` : `${origin} • ${dueDate}`;
  }

  if (handledDate) {
    return `${origin} • Handled ${handledDate}`;
  }

  return `${origin} • Handled`;
}

function getEntryModalMeta(entry: UpcomingEntry) {
  if (entry.digest_assignment === "daily") {
    return entry.surface_label;
  }

  if (entry.digest_assignment === "weekly") {
    return entry.surface_label;
  }

  if (entry.digest_assignment === "monthly") {
    const anchor = entry.anchor_date ? new Date(`${entry.anchor_date}T00:00:00`) : null;
    const dayOfMonth = anchor ? anchor.getDate() : null;

    if (dayOfMonth && entry.due_time) {
      return `Monthly Reminder • Day ${dayOfMonth} • ${formatTimeLabel(entry.due_time)}`;
    }

    if (dayOfMonth) {
      return `Monthly Reminder • Day ${dayOfMonth}`;
    }

    return "Monthly Reminder";
  }

  if (entry.digest_assignment === "quarterly" || entry.digest_assignment === "yearly") {
    const anchor = entry.anchor_date ? new Date(`${entry.anchor_date}T00:00:00`) : null;
    const monthDay = anchor
      ? anchor.toLocaleDateString([], { month: "long", day: "numeric" })
      : null;

    const prefix = entry.digest_assignment === "quarterly" ? "Quarterly Reminder" : "Yearly Reminder";

    if (monthDay && entry.due_time) {
      return `${prefix} • ${monthDay} • ${formatTimeLabel(entry.due_time)}`;
    }

    if (monthDay) {
      return `${prefix} • ${monthDay}`;
    }

    return prefix;
  }

  if (entry.schedule_mode !== "none") {
    return getEntryScheduleSummary(entry) || "Custom Reminder";
  }

  return "No schedule";
}

function getNextCadenceOccurrence(anchorDate: string, timeOfDay: string, cadence: ReminderScheduleRow["cadence"]) {
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

export default function RemindersScreen() {
  const params = useLocalSearchParams<{
    returnTo?: string;
    reminderEntryId?: string;
    editReturnAt?: string;
  }>();

  const [activeEntries, setActiveEntries] = useState<Entry[]>([]);
  const [selectedCadenceFilter, setSelectedCadenceFilter] =
    useState<CadenceFilterOption>("all");
  const [showCadenceMenu, setShowCadenceMenu] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<UpcomingEntry | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [isRestoringEntryDetail, setIsRestoringEntryDetail] = useState(false);
  const [isArchivingEntry, setIsArchivingEntry] = useState(false);
  const [isCompletingEntryId, setIsCompletingEntryId] = useState<string | null>(null);
  const [reminderSchedules, setReminderSchedules] = useState<ReminderScheduleRow[]>([]);
  const [reminderScheduleStatuses, setReminderScheduleStatuses] = useState<
    ReminderScheduleStatus[]
  >([]);

  const scrollViewRef = useRef<ScrollView | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const handledEditReturnRef = useRef<string | null>(null);

  async function loadEntries() {
    const { data, error } = await supabase
      .from("entries")
      .select(
         "id, title, content, type, status, created_at, updated_at, resolution_note, archived_at, retired_at, needs_read, last_read_at, last_completed_at, last_completed_due_at, next_due_at, schedule_mode, due_date, due_time, interval_value, interval_unit, annual_month, annual_day, anchor_date, digest_assignment, last_surface_at, last_surface_window_key"
      )
      .eq("status", "active")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.log("Load active entries error:", error.message);
      return;
    }

    setActiveEntries((data as Entry[]) ?? []);
  }

   async function loadProfileDigestSettings() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load reminder schedules for reminders user error:", userError?.message);
      return;
    }

    const { error: ensureError } = await supabase.rpc(
      "ensure_default_reminder_schedules",
      {
        p_user_id: user.id,
      }
    );

    if (ensureError) {
      console.log("Ensure default reminder schedules for reminders error:", ensureError.message);
      return;
    }

    const { data, error } = await supabase
      .from("reminder_schedules")
      .select("cadence, is_enabled, anchor_date, time_of_day")
      .eq("user_id", user.id);

    if (error) {
      console.log("Load reminder schedules for reminders error:", error.message);
      return;
    }

    setReminderSchedules((data as ReminderScheduleRow[]) ?? []);
  }

  async function loadReminderScheduleStatuses() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load reminder schedule statuses user error:", userError?.message);
      return;
    }

    const { error: ensureError } = await supabase.rpc(
      "ensure_default_reminder_schedules",
      {
        p_user_id: user.id,
      }
    );

    if (ensureError) {
      console.log("Ensure default reminder schedules on reminders error:", ensureError.message);
      return;
    }

    const { data, error } = await supabase
      .from("reminder_schedules")
      .select("cadence, is_enabled")
      .eq("user_id", user.id);

    if (error) {
      console.log("Load reminder schedule statuses error:", error.message);
      return;
    }

    setReminderScheduleStatuses((data as ReminderScheduleStatus[]) ?? []);
  }

   async function fetchEntryById(entryId: string) {
    const { data, error } = await supabase
      .from("entries")
      .select(
        "id, title, content, type, status, created_at, updated_at, resolution_note, archived_at, retired_at, needs_read, last_read_at, last_completed_at, last_completed_due_at, next_due_at, schedule_mode, due_date, due_time, interval_value, interval_unit, annual_month, annual_day, anchor_date, digest_assignment, last_surface_at, last_surface_window_key"
      )
      .eq("id", entryId)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.log("Fetch reminder entry by id error:", error.message);
      return null;
    }

    if (!data) {
      return null;
    }

    const entry = data as Entry;
    const nextRun = entry.next_due_at ? new Date(entry.next_due_at) : null;
    const lastCompletedAtDate = entry.last_completed_at ? new Date(entry.last_completed_at) : null;
    const lastCompletedDueAtDate = entry.last_completed_due_at
      ? new Date(entry.last_completed_due_at)
      : null;

    const cadence: UpcomingEntry["cadence"] =
      entry.digest_assignment === "daily" ||
      entry.digest_assignment === "weekly" ||
      entry.digest_assignment === "monthly" ||
      entry.digest_assignment === "quarterly" ||
      entry.digest_assignment === "yearly"
        ? entry.digest_assignment
        : "custom";

    return {
      ...entry,
      cadence,
      next_run_at: nextRun,
      last_completed_at_date: lastCompletedAtDate,
      last_completed_due_at_date: lastCompletedDueAtDate,
      surface_label:
        entry.digest_assignment === "daily"
          ? "Daily Reminder"
          : entry.digest_assignment === "weekly"
          ? "Weekly Reminder"
          : entry.digest_assignment === "monthly"
          ? "Monthly Reminder"
          : entry.digest_assignment === "quarterly"
          ? "Quarterly Reminder"
          : entry.digest_assignment === "yearly"
          ? "Yearly Reminder"
          : entry.schedule_mode !== "none"
          ? "Custom schedule"
          : "Ungrouped",
    } as UpcomingEntry;
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

      await loadEntries();

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

    await loadEntries();

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

  const confirmArchiveEntry = (id: string) => {
    Alert.alert(
      "Are you sure you want to archive?",
      'Please note, archived entries will no longer appear in your notifications but can be accessed under the "Archived" tab.',
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Archive",
          style: "default",
          onPress: () => archiveEntry(id),
        },
      ]
    );
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

    try {
      await syncLocalNotifications();
    } catch (syncError) {
      console.log("Open entry notification sync error:", syncError);
    }
  };

  const completeEntryCycle = async (entry: UpcomingEntry) => {
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

       let completedDueAt: string | null = entry.next_run_at
        ? entry.next_run_at.toISOString()
        : null;

      if (!completedDueAt && entry.digest_assignment !== "none") {
        const schedule =
          reminderSchedules.find((item) => item.cadence === entry.digest_assignment) ?? null;

        if (schedule) {
          completedDueAt = getCurrentCadenceOccurrence(
            schedule.anchor_date,
            schedule.time_of_day,
            schedule.cadence
          ).toISOString();
        }
      }

      const { data, error } = await supabase.rpc("complete_entry_cycle", {
        p_entry_id: entry.id,
        p_user_id: user.id,
        p_completed_due_at: completedDueAt,
      });

      if (error) {
        console.log("complete_entry_cycle error:", error.message);
        Alert.alert("Unable to handle", error.message);
        return;
      }

      if (selectedEntry?.id === entry.id && data) {
        setSelectedEntry((current) =>
          current
            ? {
                ...current,
                ...data,
                next_run_at: data.next_due_at ? new Date(data.next_due_at) : null,
                last_completed_at_date: data.last_completed_at
                  ? new Date(data.last_completed_at)
                  : null,
                last_completed_due_at_date: data.last_completed_due_at
                  ? new Date(data.last_completed_due_at)
                  : null,
              }
            : current
        );
      }

      await loadEntries();

      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Complete notification sync error:", syncError);
      }
    } finally {
      setIsCompletingEntryId(null);
    }
  };

  const uncompleteEntryCycle = async (entry: UpcomingEntry) => {
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
        setSelectedEntry((current) =>
          current
            ? {
                ...current,
                ...data,
                next_run_at: data.next_due_at ? new Date(data.next_due_at) : null,
                last_completed_at_date: data.last_completed_at
                  ? new Date(data.last_completed_at)
                  : null,
                last_completed_due_at_date: data.last_completed_due_at
                  ? new Date(data.last_completed_due_at)
                  : null,
              }
            : current
        );
      }

      await loadEntries();

      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Undo notification sync error:", syncError);
      }
    } finally {
      setIsCompletingEntryId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadEntries();
      loadProfileDigestSettings();
      loadReminderScheduleStatuses();

      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      });
    }, [])
  );

  const filteredActiveEntries = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return activeEntries.filter((entry) => {
      if (!query) return true;

      return (
        entry.content?.toLowerCase().includes(query) ||
        entry.title?.toLowerCase().includes(query)
      );
    });
  }, [activeEntries, searchText]);

   const groupedUpcomingEntries = useMemo<EntryGroup[]>(() => {
    const now = new Date();

    const dailySchedule = reminderSchedules.find((item) => item.cadence === "daily") ?? null;
    const weeklySchedule = reminderSchedules.find((item) => item.cadence === "weekly") ?? null;

    const cadenceScheduleMap = new Map(
      reminderSchedules.map((item) => [item.cadence, item] as const)
    );

    const mappedEntries: UpcomingEntry[] = filteredActiveEntries.map((entry) => {
      const nextRun = entry.next_due_at ? new Date(entry.next_due_at) : null;
      const lastCompletedAtDate = entry.last_completed_at ? new Date(entry.last_completed_at) : null;
      const lastCompletedDueAtDate = entry.last_completed_due_at
        ? new Date(entry.last_completed_due_at)
        : null;

      const cadence: UpcomingEntry["cadence"] =
        entry.digest_assignment === "daily" ||
        entry.digest_assignment === "weekly" ||
        entry.digest_assignment === "monthly" ||
        entry.digest_assignment === "quarterly" ||
        entry.digest_assignment === "yearly"
          ? entry.digest_assignment
          : "custom";

      const weeklyAnchorDay =
        weeklySchedule?.anchor_date
          ? new Date(`${weeklySchedule.anchor_date}T00:00:00`).getDay()
          : 0;

      const surfaceLabel =
        entry.digest_assignment === "daily"
          ? `Daily Reminder • ${formatDisplayTime(dailySchedule?.time_of_day ?? "07:00:00")}`
          : entry.digest_assignment === "weekly"
          ? `Weekly Reminder • ${weekdayLabel(
              weeklyAnchorDay as WeekdayValue
            )} • ${formatDisplayTime(weeklySchedule?.time_of_day ?? "08:00:00")}`
          : entry.digest_assignment === "monthly"
          ? "Monthly Reminder"
          : entry.digest_assignment === "quarterly"
          ? "Quarterly Reminder"
          : entry.digest_assignment === "yearly"
          ? "Yearly Reminder"
          : entry.schedule_mode !== "none"
          ? "Custom schedule"
          : "Ungrouped";

      return {
        ...entry,
        cadence,
        next_run_at: nextRun,
        last_completed_at_date: lastCompletedAtDate,
        last_completed_due_at_date: lastCompletedDueAtDate,
        surface_label: surfaceLabel,
      };
    });

     function isCurrentlyHandled(entry: UpcomingEntry) {
      return isEntryCurrentlyHandled(entry, reminderSchedules);
    }

    const activeOnlyEntries = mappedEntries.filter((entry) => !isCurrentlyHandled(entry));
    const handledEntries = mappedEntries.filter((entry) => isCurrentlyHandled(entry));

    const grouped: Record<EntryGroupKey, UpcomingEntry[]> = {
      daily: [],
      weekly: [],
      monthly: [],
      quarterly: [],
      yearly: [],
      custom: [],
      handled: [],
    };

    activeOnlyEntries.forEach((entry) => {
      grouped[entry.cadence].push(entry);
    });

    grouped.handled = handledEntries;

    const sortAlphabetically = (entries: UpcomingEntry[]) =>
      [...entries].sort((a, b) =>
        (a.title?.trim() || "Untitled Entry").localeCompare(
          b.title?.trim() || "Untitled Entry"
        )
      );

    const sortCustomByNextDue = (entries: UpcomingEntry[]) =>
      [...entries].sort((a, b) => {
        const aTime = a.next_run_at ? a.next_run_at.getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.next_run_at ? b.next_run_at.getTime() : Number.MAX_SAFE_INTEGER;

        if (aTime !== bTime) {
          return aTime - bTime;
        }

        return (a.title?.trim() || "Untitled Entry").localeCompare(
          b.title?.trim() || "Untitled Entry"
        );
      });

    const sortHandledByMostRecent = (entries: UpcomingEntry[]) =>
      [...entries].sort((a, b) => {
        const aTime = a.last_completed_at_date
          ? a.last_completed_at_date.getTime()
          : 0;
        const bTime = b.last_completed_at_date
          ? b.last_completed_at_date.getTime()
          : 0;

        if (aTime !== bTime) {
          return bTime - aTime;
        }

        return (a.title?.trim() || "Untitled Entry").localeCompare(
          b.title?.trim() || "Untitled Entry"
        );
      });

    const allGroups: EntryGroup[] = [
      {
        key: "daily",
        title: formatCadenceHeaderLabel("daily", reminderSchedules),
        entries: sortAlphabetically(grouped.daily),
      },
      {
        key: "weekly",
        title: formatCadenceHeaderLabel("weekly", reminderSchedules),
        entries: sortAlphabetically(grouped.weekly),
      },
      {
        key: "monthly",
        title: formatCadenceHeaderLabel("monthly", reminderSchedules),
        entries: sortAlphabetically(grouped.monthly),
      },
      {
        key: "quarterly",
        title: formatCadenceHeaderLabel("quarterly", reminderSchedules),
        entries: sortAlphabetically(grouped.quarterly),
      },
      {
        key: "yearly",
        title: formatCadenceHeaderLabel("yearly", reminderSchedules),
        entries: sortAlphabetically(grouped.yearly),
      },
      {
        key: "custom",
        title: "Custom",
        showCustomNote: true,
        entries: sortCustomByNextDue(grouped.custom),
      },
      {
        key: "handled",
        title: "Handled",
        entries: sortHandledByMostRecent(grouped.handled),
      },
    ];

    if (selectedCadenceFilter === "all") {
      return allGroups.filter((group) => group.entries.length > 0);
    }

    return allGroups.filter(
      (group) => group.key === selectedCadenceFilter && group.entries.length > 0
    );
  }, [filteredActiveEntries, selectedCadenceFilter, reminderSchedules]);

  
   const availableFilterOptions = useMemo<CadenceFilterOption[]>(() => {
    const options: CadenceFilterOption[] = ["all"];

    const cadenceScheduleMap = new Map(
      reminderSchedules.map((item) => [item.cadence, item] as const)
    );

     function isCurrentlyHandled(entry: Entry) {
      return isEntryCurrentlyHandled(entry, reminderSchedules);
    }

    const allGroups: EntryGroupKey[] = [
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
      "custom",
      "handled",
    ];

    allGroups.forEach((key) => {
      const hasEntries = activeEntries.some((entry) => {
        if (key === "handled") {
          return isCurrentlyHandled(entry);
        }

        if (isCurrentlyHandled(entry)) {
          return false;
        }

        const cadence =
          entry.digest_assignment === "daily" ||
          entry.digest_assignment === "weekly" ||
          entry.digest_assignment === "monthly" ||
          entry.digest_assignment === "quarterly" ||
          entry.digest_assignment === "yearly"
            ? entry.digest_assignment
            : "custom";

        return cadence === key;
      });

      if (hasEntries) {
        options.push(key);
      }
    });

    return options;
  }, [activeEntries, reminderSchedules]);

     const selectedCadenceSummary = useMemo(() => {
    if (
      selectedCadenceFilter === "all" ||
      selectedCadenceFilter === "custom"
    ) {
      return "";
    }

    return getCadenceSummaryText(selectedCadenceFilter, reminderSchedules);
  }, [selectedCadenceFilter, reminderSchedules]);

  const selectedEntryIsHandled = useMemo(() => {
    return selectedEntry ? isEntryCurrentlyHandled(selectedEntry, reminderSchedules) : false;
  }, [selectedEntry, reminderSchedules]);

   useEffect(() => {
    if (!availableFilterOptions.includes(selectedCadenceFilter)) {
      setSelectedCadenceFilter("all");
    }
  }, [availableFilterOptions, selectedCadenceFilter]);

   useEffect(() => {
    const returnTo = typeof params.returnTo === "string" ? params.returnTo : null;
    const reminderEntryId =
      typeof params.reminderEntryId === "string" ? params.reminderEntryId : null;
    const editReturnAt =
      typeof params.editReturnAt === "string" ? params.editReturnAt : null;

    if (returnTo !== "reminders" || !reminderEntryId || !editReturnAt) {
      setIsRestoringEntryDetail(false);
      return;
    }

    if (handledEditReturnRef.current === editReturnAt) {
      return;
    }

    handledEditReturnRef.current = editReturnAt;
    setIsRestoringEntryDetail(true);

    let cancelled = false;

    const reopenEntry = async () => {
      const entry = await fetchEntryById(reminderEntryId);

      if (cancelled) {
        return;
      }

      router.replace("/reminders");

      if (entry) {
        setSelectedEntry(entry);
        setShowEntryModal(true);
      }

      setIsRestoringEntryDetail(false);
    };

    reopenEntry();

    return () => {
      cancelled = true;
    };
  }, [params.returnTo, params.reminderEntryId, params.editReturnAt]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ImageBackground source={reminderBackground} resizeMode="cover" style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.48)" }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 45,
                paddingBottom: 12,
              }}
            >
              <View
                style={{
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <Text
                  style={{
                    fontSize: 28,
                    fontWeight: "700",
                    color: "#111",
                    textAlign: "center",
                    textShadowColor: "rgba(0,0,0,0.35)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 6,
                    marginBottom: 6,
                  }}
                >
                  Entries
                </Text>

                <Text
                  style={{
                    fontSize: 15,
                    color: "#111",
                    textAlign: "center",
                    lineHeight: 22,
                    textShadowColor: "rgba(0,0,0,0.25)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 4,
                  }}
                >
                  Search and browse your library of entries
                </Text>
              </View>

               <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Pressable
                  onPress={() => setShowCadenceMenu(true)}
                  style={{
                    paddingVertical: 11,
                    paddingHorizontal: 13,
                    borderRadius: 10,
                    backgroundColor: "#e5e7eb",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151" }}>
                    {selectedCadenceFilter === "all"
                      ? "All"
                      : selectedCadenceFilter === "daily"
                      ? "Daily"
                      : selectedCadenceFilter === "weekly"
                      ? "Weekly"
                      : selectedCadenceFilter === "monthly"
                      ? "Monthly"
                      : selectedCadenceFilter === "quarterly"
                      ? "Quarterly"
                      : selectedCadenceFilter === "yearly"
                      ? "Yearly"
                      : selectedCadenceFilter === "handled"
                      ? "Handled"
                      : "Custom"}{" "}
                    ▼
                  </Text>
                </Pressable>

                <View style={{ flex: 1, position: "relative" }}>
                  <TextInput
                    ref={searchInputRef}
                    placeholder="Search..."
                    placeholderTextColor="#6b7280"
                    value={searchText}
                    onChangeText={setSearchText}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.88)",
                      borderWidth: 1,
                      borderColor: "#d8d8d8",
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingRight: 44,
                      paddingVertical: 11,
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
                        top: 11,
                        padding: 2,
                      }}
                    >
                      <Text style={{ fontSize: 16, color: "#777", fontWeight: "600" }}>×</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>

             <ScrollView
              ref={scrollViewRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 220,
                paddingTop: 4,
              }}
            >
              {isRestoringEntryDetail ? (
                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.7)",
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.75)",
                  }}
                >
                  <Text style={{ fontSize: 14, color: "#666" }}>
                    Opening entry...
                  </Text>
                </View>
              ) : groupedUpcomingEntries.length === 0 ? (
                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.7)",
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.75)",
                  }}
                >
                  <Text style={{ fontSize: 14, color: "#666" }}>
                    No entries for this filter yet.
                  </Text>
                </View>
              ) : (
                groupedUpcomingEntries.map((group) => (
                  <View key={group.key} style={{ marginBottom: 18 }}>
{selectedCadenceFilter !== "custom" && selectedCadenceFilter !== "handled" ? (
  <View
    style={{
      width: "100%",
      marginTop: group.key === groupedUpcomingEntries[0]?.key ? 2 : 10,
      marginBottom: 12,
      borderRadius: 14,
      paddingVertical: 11,
      paddingHorizontal: 14,
      backgroundColor: "rgba(139,111,71,0.14)",
      borderWidth: 1,
      borderColor: "rgba(78,59,39,0.16)",
    }}
  >
    <Text
      style={{
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "700",
        color: "#3f2f1f",
      }}
    >
      {group.key === "daily"
        ? getCadenceSummaryText("daily", reminderSchedules)
        : group.key === "weekly"
        ? getCadenceSummaryText("weekly", reminderSchedules)
        : group.key === "monthly"
        ? getCadenceSummaryText("monthly", reminderSchedules)
        : group.key === "quarterly"
        ? getCadenceSummaryText("quarterly", reminderSchedules)
        : group.key === "yearly"
        ? getCadenceSummaryText("yearly", reminderSchedules)
        : group.key === "custom"
        ? "Custom"
        : "Handled"}
    </Text>
  </View>
) : null}

                     {group.entries.map((entry) => (
                      <Pressable
                        key={entry.id}
                        onPress={() => openEntry(entry)}
                        style={{
                          marginBottom: 8,
                          paddingVertical: 2,
                          paddingHorizontal: 0,
                        }}
                      >
                        <View
                          style={{
                            alignSelf: "flex-start",
                            backgroundColor:
                              entry.type === "reminder"
                                ? entry.needs_read
                                  ? "#2563eb"
                                  : "rgba(219,234,254,0.95)"
                                : entry.needs_read
                                ? "rgba(0,0,0,0.82)"
                                : "rgba(255,255,255,0.58)",
                            borderRadius: 10,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "700",
                              color:
                                entry.type === "reminder"
                                  ? entry.needs_read
                                    ? "white"
                                    : "#1d4ed8"
                                  : entry.needs_read
                                  ? "white"
                                  : "black",
                            }}
                            numberOfLines={1}
                          >
                            {entry.title?.trim() || "Untitled Entry"}
                          </Text>
                        </View>

                         {group.key === "custom" || group.key === "handled" ? (
                        <Text
                          style={{
                            marginTop: 6,
                            marginLeft: 2,
                            fontSize: 12,
                            lineHeight: 17,
                            fontWeight: "500",
                            color: "rgba(17,24,39,0.72)",
                          }}
                          numberOfLines={1}
                        >
                          {group.key === "custom"
                            ? getCustomInlineSummary(entry)
                            : getHandledInlineSummary(entry)}
                        </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>

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
                    borderColor: "rgba(107,114,128,0.38)",
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

            <Modal visible={showCadenceMenu} transparent animationType="fade">
              <Pressable
                onPress={() => setShowCadenceMenu(false)}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.18)",
                  justifyContent: "flex-start",
                  paddingTop: 180,
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
                  }}
                >
                  {availableFilterOptions.map((option) => (
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
              <View style={{ flex: 1 }}>
                <ImageBackground
                  source={reminderBackground}
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
                                    borderColor: "rgba(107,114,128,0.38)",
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
                                        returnTo: "reminders",
                                        reminderEntryId: selectedEntry.id,
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
                                    confirmArchiveEntry(selectedEntry.id);
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
          </SafeAreaView>
        </View>
      </ImageBackground>
    </GestureHandlerRootView>
  );
}