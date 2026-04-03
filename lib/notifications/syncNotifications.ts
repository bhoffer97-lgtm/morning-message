import * as Notifications from "expo-notifications";
import { supabase } from "../supabase";

type ReminderCadence = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

type ReminderScheduleRow = {
  id: string;
  cadence: ReminderCadence;
  is_enabled: boolean;
  anchor_date: string;
  time_of_day: string;
};

type EntryRow = {
  id: string;
  title: string | null;
  content: string;
  schedule_mode: string;
  digest_assignment: string;
  next_due_at: string | null;
};

const NOTIFICATION_CHANNEL_ID = "morning-message-reminders";
const NOTIFICATION_SCOPE_PREFIX = "morning-message:";
let activeSyncPromise: Promise<void> | null = null;
let syncQueued = false;

function parseLocalDateParts(dateString: string) {
  const [yearRaw, monthRaw, dayRaw] = dateString.split("-");
  return {
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
  };
}

function parseTimeParts(timeString: string) {
  const [hourRaw, minuteRaw] = timeString.split(":");
  return {
    hour: Number(hourRaw),
    minute: Number(minuteRaw),
  };
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

function buildBaseDateTime(anchorDate: string, timeOfDay: string) {
  const { year, month, day } = parseLocalDateParts(anchorDate);
  const { hour, minute } = parseTimeParts(timeOfDay);

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function getNextReminderScheduleOccurrence(schedule: ReminderScheduleRow) {
  const now = new Date();
  let cursor = buildBaseDateTime(schedule.anchor_date, schedule.time_of_day);

  while (cursor <= now) {
    if (schedule.cadence === "daily") {
      cursor = addDays(cursor, 1);
    } else if (schedule.cadence === "weekly") {
      cursor = addDays(cursor, 7);
    } else if (schedule.cadence === "monthly") {
      cursor = addMonths(cursor, 1);
    } else if (schedule.cadence === "quarterly") {
      cursor = addMonths(cursor, 3);
    } else {
      cursor = addYears(cursor, 1);
    }
  }

  return cursor;
}

function buildReminderTitle(cadence: ReminderCadence) {
  if (cadence === "daily") return "Morning Message";
  if (cadence === "weekly") return "Morning Message";
  if (cadence === "monthly") return "Morning Message";
  if (cadence === "quarterly") return "Morning Message";
  return "Morning Message";
}

function buildReminderBody(cadence: ReminderCadence) {
  if (cadence === "daily") return "Your daily reminder is ready.";
  if (cadence === "weekly") return "Your weekly reminder is ready.";
  if (cadence === "monthly") return "Your monthly reminder is ready.";
  if (cadence === "quarterly") return "Your quarterly reminder is ready.";
  return "Your yearly reminder is ready.";
}

function buildCustomEntryTitle(entry: EntryRow) {
  return entry.title?.trim() || "Reminder";
}

function buildCustomEntryBody(entry: EntryRow) {
  const trimmed = entry.content?.trim() || "";
  if (!trimmed) return "You have a reminder due.";
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

async function ensureNotificationSetup(): Promise<boolean> {
  const permissions = await Notifications.getPermissionsAsync();

  if (!permissions.granted) {
    const requested = await Notifications.requestPermissionsAsync();

    if (!requested.granted) {
      return false;
    }
  }

   await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: "Reminders",
    importance: Notifications.AndroidImportance.HIGH,
  });
  
  return true;
}

async function cancelManagedNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  const ours = scheduled.filter((item) => {
    const scope = item.content.data?.scope;
    return typeof scope === "string" && scope.startsWith(NOTIFICATION_SCOPE_PREFIX);
  });

  await Promise.all(
    ours.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
  );
}

async function scheduleCadenceReminder(schedule: ReminderScheduleRow) {
  if (!schedule.is_enabled) return;

  const nextTriggerAt = getNextReminderScheduleOccurrence(schedule);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: buildReminderTitle(schedule.cadence),
      body: buildReminderBody(schedule.cadence),
      sound: true,
      data: {
        scope: `${NOTIFICATION_SCOPE_PREFIX}cadence`,
        kind: "cadence",
        cadence: schedule.cadence,
        scheduleId: schedule.id,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextTriggerAt,
      channelId: NOTIFICATION_CHANNEL_ID,
    },
  });
}

async function scheduleCustomEntryReminder(entry: EntryRow) {
  if (!entry.next_due_at) return;

  const nextTriggerAt = new Date(entry.next_due_at);

  if (Number.isNaN(nextTriggerAt.getTime())) return;
  if (nextTriggerAt <= new Date()) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: buildCustomEntryTitle(entry),
      body: buildCustomEntryBody(entry),
      sound: true,
      data: {
        scope: `${NOTIFICATION_SCOPE_PREFIX}entry`,
        kind: "entry",
        entryId: entry.id,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextTriggerAt,
      channelId: NOTIFICATION_CHANNEL_ID,
    },
  });
}

export async function getManagedScheduledNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  return scheduled.filter((item) => {
    const scope = item.content.data?.scope;
    return typeof scope === "string" && scope.startsWith(NOTIFICATION_SCOPE_PREFIX);
  });
}

export async function syncLocalNotifications() {
  if (activeSyncPromise) {
    syncQueued = true;
    await activeSyncPromise;
    if (!syncQueued) return;
  }

  const runSync = async () => {
    do {
      syncQueued = false;

      const isReady = await ensureNotificationSetup();

      if (!isReady) {
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("notifications_enabled")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      await cancelManagedNotifications();

      if (profile?.notifications_enabled === false) {
        continue;
      }

      const { data: schedules, error: schedulesError } = await supabase
        .from("reminder_schedules")
        .select("id, cadence, is_enabled, anchor_date, time_of_day")
        .eq("user_id", user.id);

      if (schedulesError) {
        throw schedulesError;
      }

      const { data: entries, error: entriesError } = await supabase
        .from("entries")
        .select("id, title, content, schedule_mode, digest_assignment, next_due_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .eq("digest_assignment", "none")
        .in("schedule_mode", ["daily_time", "fixed_date", "interval", "annual_date"]);

      if (entriesError) {
        throw entriesError;
      }

      for (const schedule of (schedules ?? []) as ReminderScheduleRow[]) {
        await scheduleCadenceReminder(schedule);
      }

      for (const entry of (entries ?? []) as EntryRow[]) {
        await scheduleCustomEntryReminder(entry);
      }
    } while (syncQueued);
  };

  activeSyncPromise = runSync();

  try {
    await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}