import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getManagedScheduledNotifications,
  syncLocalNotifications,
} from "../../lib/notifications/syncNotifications";
import { supabase } from "../../lib/supabase";

const reminderBackground = require("../../assets/images/morning-nature-5.jpg");

type ReminderCadence = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
type TimePeriod = "AM" | "PM";
type SelectorType = "weekday" | "month" | "day";

type ReminderSchedule = {
  id: string;
  cadence: ReminderCadence;
  is_enabled: boolean;
  anchor_date: string;
  time_of_day: string;
};

type SelectorState = {
  cadence: ReminderCadence;
  type: SelectorType;
} | null;

const TIME_HOURS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const TIME_MINUTES = ["00", "15", "30", "45"];
const TIME_PERIODS: Array<"AM" | "PM"> = ["AM", "PM"];
  const SELECTOR_ROW_HEIGHT = 60;
  const SELECTOR_VISIBLE_HEIGHT = 220;

const cadenceOrder: ReminderCadence[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function weekdayLabel(day: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ?? "Sunday";
}

function parseTimeForForm(time: string | null, fallback = "07:00") {
  const safeTime = time && time.includes(":") ? time : fallback;
  const [hours, minutes] = safeTime.split(":");
  const hourNum = Number(hours);
  const minuteNum = Number(minutes);

  const period: TimePeriod = hourNum >= 12 ? "PM" : "AM";
  const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;

  return {
    hour: String(hour12),
    minute: String(minuteNum).padStart(2, "0"),
    period,
  };
}

function build24HourTime(hour: string, minute: string, period: TimePeriod) {
  const cleanHour = Math.min(12, Math.max(1, Number(hour) || 12));
  const cleanMinute = Math.min(59, Math.max(0, Number(minute) || 0));

  let hour24 = cleanHour % 12;
  if (period === "PM") {
    hour24 += 12;
  }

  return `${String(hour24).padStart(2, "0")}:${String(cleanMinute).padStart(2, "0")}:00`;
}

function sanitizeMinuteInput(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 2);
}

function sanitizeHourInput(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 2);
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateParts(dateString: string | null) {
  const fallback = getTodayDateString();
  const safe = dateString || fallback;
  const [yearRaw, monthRaw, dayRaw] = safe.split("-");
  const year = Number(yearRaw) || new Date().getFullYear();
  const month = Number(monthRaw) || new Date().getMonth() + 1;
  const day = Number(dayRaw) || new Date().getDate();

  return { year, month, day };
}

function formatDateString(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function replaceDateParts(
  existingDate: string | null,
  nextParts: Partial<{ year: number; month: number; day: number }>
) {
  const current = parseDateParts(existingDate);
  const year = nextParts.year ?? current.year;
  const month = nextParts.month ?? current.month;
  const maxDay = getDaysInMonth(year, month);
  const day = Math.min(nextParts.day ?? current.day, maxDay);

  return formatDateString(year, month, day);
}

function getTimeStringToMinutes(time: string | null) {
  if (!time) return 0;
  const [hours, minutes] = time.split(":");
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function getCurrentMinuteOfDay() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getNextDateForWeekday(targetDay: number, timeOfDay?: string | null) {
  const now = new Date();
  const currentDay = now.getDay();
  let diff = targetDay - currentDay;

  if (diff < 0) diff += 7;

  if (diff === 0) {
    const selectedMinutes = getTimeStringToMinutes(timeOfDay ?? null);
    const currentMinutes = getCurrentMinuteOfDay();

    if (selectedMinutes < currentMinutes) {
      diff = 7;
    }
  }

  const result = new Date(now);
  result.setHours(0, 0, 0, 0);
  result.setDate(now.getDate() + diff);

  return formatDateString(
    result.getFullYear(),
    result.getMonth() + 1,
    result.getDate()
  );
}

function getCadenceTitle(cadence: ReminderCadence) {
  if (cadence === "daily") return "Daily Reminder";
  if (cadence === "weekly") return "Weekly Reminder";
  if (cadence === "monthly") return "Monthly Reminder";
  if (cadence === "quarterly") return "Quarterly Reminder";
  return "Yearly Reminder";
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

function formatPreviewDateTime(date: Date, includeYear = false) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return includeYear
    ? `${month}/${day}/${year} ${hours}:${minutes} ${period}`
    : `${month}/${day} ${hours}:${minutes} ${period}`;
}

function getNextOccurrences(schedule: ReminderSchedule, count = 3) {
  const results: Date[] = [];
  const { year, month, day } = parseDateParts(schedule.anchor_date);
  const time = parseTimeForForm(schedule.time_of_day);
  const hour24 = Number(build24HourTime(time.hour, time.minute, time.period).split(":")[0]);
  const minute = Number(time.minute);

  let cursor = new Date(year, month - 1, day, hour24, minute, 0, 0);
  const now = new Date();

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

  while (results.length < count) {
    results.push(new Date(cursor));

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

  return results;
}

function getUpcomingNotificationsText(schedule: ReminderSchedule) {
  const upcoming = getNextOccurrences(schedule, 3);
  const includeYear = schedule.cadence === "yearly";

  return `Upcoming ${upcoming
    .map((date) =>
      date.toLocaleDateString([], {
        month: "numeric",
        day: "numeric",
        ...(includeYear ? { year: "2-digit" as const } : {}),
      })
    )
    .join(", ")}`;
}

function getOrdinalLabel(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

function getTimePickerHeader(
  cadence: ReminderCadence,
  schedule: ReminderSchedule | null
) {
  if (!schedule) {
    return {
      title: getCadenceTitle(cadence),
      subtitle: "Set reminder time",
    };
  }

  const dateParts = parseDateParts(schedule.anchor_date);
  const weekday = new Date(`${schedule.anchor_date}T00:00:00`).getDay();

  if (cadence === "daily") {
    return {
      title: "Daily Reminder",
      subtitle: "Occurs every day at",
    };
  }

  if (cadence === "weekly") {
    return {
      title: "Weekly Reminder",
      subtitle: `Set for every ${weekdayLabel(weekday)} at`,
    };
  }

  if (cadence === "monthly") {
    return {
      title: "Monthly Reminder",
      subtitle: `Set for the ${getOrdinalLabel(dateParts.day)} of each month at`,
    };
  }

  if (cadence === "quarterly") {
    return {
      title: "Quarterly Reminder",
      subtitle: `Set for ${monthLabels[dateParts.month - 1]} ${getOrdinalLabel(dateParts.day)} at`,
    };
  }

  return {
    title: "Yearly Reminder",
    subtitle: `Set for ${monthLabels[dateParts.month - 1]} ${getOrdinalLabel(dateParts.day)} each year at`,
  };
}

function renderPickerWheelColumn(
  values: Array<{ label: string; value: number | string }>,
  selectedValue: number | string,
  onSelect: (value: number | string) => void,
  scrollRef?: React.RefObject<ScrollView | null>,
  visibleHeight = 220,
  flex = 1
) {
  const selectedIndex = Math.max(
    0,
    values.findIndex((item) => item.value === selectedValue)
  );

  return (
    <View
      style={{
        flex,
        backgroundColor: "rgba(255,255,255,0.82)",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#d1d5db",
        paddingVertical: 8,
      }}
    >
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingVertical: 2,
          gap: 6,
        }}
        style={{ maxHeight: visibleHeight }}
        onContentSizeChange={() => {
          const targetOffset = Math.max(
            0,
            selectedIndex * SELECTOR_ROW_HEIGHT -
              (visibleHeight / 2 - SELECTOR_ROW_HEIGHT / 2)
          );

          requestAnimationFrame(() => {
            scrollRef?.current?.scrollTo({
              y: targetOffset,
              animated: false,
            });
          });
        }}
      >
        {values.map((item) => {
          const selected = selectedValue === item.value;

          return (
            <Pressable
              key={String(item.value)}
              onPress={() => onSelect(item.value)}
              style={{
                marginHorizontal: 8,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected ? "#e0ecff" : "transparent",
                borderWidth: selected ? 1 : 0,
                borderColor: selected ? "#2563eb" : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: selected ? "700" : "600",
                  color: selected ? "#1d4ed8" : "#334155",
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function ReminderGroupsScreen() {
  const [schedules, setSchedules] = useState<ReminderSchedule[]>([]);
  const [hasLoadedSchedules, setHasLoadedSchedules] = useState(false);
  const [selectorState, setSelectorState] = useState<SelectorState>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [pendingTimeCadence, setPendingTimeCadence] = useState<ReminderCadence | null>(null);
  const [pendingTimeHour, setPendingTimeHour] = useState("7");
  const [pendingTimeMinute, setPendingTimeMinute] = useState("00");
  const [pendingTimePeriod, setPendingTimePeriod] = useState<TimePeriod>("AM");
  const selectorWheelRef = useRef<ScrollView | null>(null);


   async function loadReminderSchedules() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load reminder schedules user error:", userError?.message);
      return;
    }

    const { error: ensureError } = await supabase.rpc(
      "ensure_default_reminder_schedules",
      {
        p_user_id: user.id,
      }
    );

    if (ensureError) {
      console.log("Ensure default reminder schedules error:", ensureError.message);
      return;
    }

    const { data, error } = await supabase
      .from("reminder_schedules")
      .select("id, cadence, is_enabled, anchor_date, time_of_day")
      .eq("user_id", user.id);

    if (error) {
      console.log("Load reminder schedules error:", error.message);
      return;
    }

     const sorted = ((data as ReminderSchedule[]) ?? []).sort(
      (a, b) => cadenceOrder.indexOf(a.cadence) - cadenceOrder.indexOf(b.cadence)
    );

    setSchedules(sorted);
    setHasLoadedSchedules(true);
  }

    useFocusEffect(
    useCallback(() => {
      loadReminderSchedules();
    }, [])
  );

 const schedulesByCadence = useMemo(() => {
    return {
      daily: schedules.find((item) => item.cadence === "daily") ?? null,
      weekly: schedules.find((item) => item.cadence === "weekly") ?? null,
      monthly: schedules.find((item) => item.cadence === "monthly") ?? null,
      quarterly: schedules.find((item) => item.cadence === "quarterly") ?? null,
      yearly: schedules.find((item) => item.cadence === "yearly") ?? null,
    };
  }, [schedules]);

    async function updateSchedule(
    cadence: ReminderCadence,
    patch: Partial<ReminderSchedule>
  ) {
    const current = schedulesByCadence[cadence];

    if (!current) return;

    const optimistic: ReminderSchedule = {
      ...current,
      ...patch,
    };

    setSchedules((existing) =>
      existing.map((item) => (item.cadence === cadence ? optimistic : item))
    );

    setSavingKey(cadence);

    const { error } = await supabase
      .from("reminder_schedules")
      .update({
        is_enabled: optimistic.is_enabled,
        anchor_date: optimistic.anchor_date,
        time_of_day: optimistic.time_of_day,
      })
      .eq("id", current.id);

    setSavingKey(null);

    if (error) {
      console.log("Update reminder schedule error:", error.message);
      Alert.alert("Could not save reminder", error.message);
      await loadReminderSchedules();
      return;
    }

    try {
      await syncLocalNotifications();

      const scheduled = await getManagedScheduledNotifications();

      console.log(
        "REMINDER_SCHEDULE_DEBUG",
        scheduled.map((item) => ({
          id: item.identifier,
          title: item.content.title,
          body: item.content.body,
          data: item.content.data,
          trigger: item.trigger,
        }))
      );
    } catch (syncError) {
      console.log("Reminder notification sync error:", syncError);
      Alert.alert("Reminder saved", "Your reminder was saved, but notifications could not be refreshed.");
    }
  }

  function renderToggle(cadence: ReminderCadence, enabled: boolean) {
    return (
      <Pressable
        onPress={() => updateSchedule(cadence, { is_enabled: !enabled })}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: "700",
            color: enabled ? "#166534" : "#64748b",
          }}
        >
          {enabled ? "ON" : "OFF"}
        </Text>

        <View
          style={{
            width: 42,
            height: 24,
            borderRadius: 12,
            paddingHorizontal: 3,
            backgroundColor: enabled ? "#22c55e" : "#cbd5e1",
            justifyContent: "center",
            alignItems: enabled ? "flex-end" : "flex-start",
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: "white",
            }}
          />
        </View>
      </Pressable>
    );
  }

   function renderSettingRow(label: string, value: string, onPress: () => void) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          borderWidth: 1,
          borderColor: "#d1d5db",
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: "white",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {label ? (
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: "#475569",
              marginBottom: 2,
            }}
          >
            {label}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginLeft: 12,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: "#111827",
              marginRight: 8,
            }}
          >
            {value}
          </Text>

          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: "#6b7280",
            }}
          >
            ›
          </Text>
        </View>
      </Pressable>
    );
  }

 function renderUpcomingGrid(schedule: ReminderSchedule) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: "#475569",
          lineHeight: 20,
        }}
      >
        {getUpcomingNotificationsText(schedule)}
      </Text>

      {savingKey === schedule.cadence ? (
        <Text
          style={{
            fontSize: 12,
            color: "#64748b",
            marginTop: 6,
          }}
        >
          Saving...
        </Text>
      ) : null}
    </View>
  );
}

function renderTimeWheelColumn(
  values: string[],
  selectedValue: string,
  onSelect: (value: string) => void,
  flex = 1
) {
  return (
    <View
      style={{
        flex,
        backgroundColor: "rgba(255,255,255,0.82)",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#d1d5db",
        paddingVertical: 8,
      }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingVertical: 4,
          gap: 6,
        }}
        style={{ maxHeight: 220 }}
      >
        {values.map((value) => {
          const selected = selectedValue === value;

          return (
            <Pressable
              key={value}
              onPress={() => onSelect(value)}
              style={{
                marginHorizontal: 8,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected ? "#e0ecff" : "transparent",
                borderWidth: selected ? 1 : 0,
                borderColor: selected ? "#2563eb" : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: selected ? "700" : "600",
                  color: selected ? "#1d4ed8" : "#334155",
                }}
              >
                {value}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

  function renderSelectorButton(label: string, onPress: () => void) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          borderWidth: 1,
          borderColor: "#d1d5db",
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: "white",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: "#111827",
          }}
        >
          {label}
        </Text>

        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: "#6b7280",
          }}
        >
          ▼
        </Text>
      </Pressable>
    );
  }

  function openTimeEditor(schedule: ReminderSchedule) {
    const form = parseTimeForForm(schedule.time_of_day);
    setPendingTimeCadence(schedule.cadence);
    setPendingTimeHour(form.hour);
    setPendingTimeMinute(form.minute);
    setPendingTimePeriod(form.period);
  }

   async function applyPendingTime() {
    if (!pendingTimeCadence) return;

    const cadence = pendingTimeCadence;
    const schedule = schedulesByCadence[cadence];
    const nextTime = build24HourTime(
      pendingTimeHour || "12",
      pendingTimeMinute || "00",
      pendingTimePeriod
    );

    setPendingTimeCadence(null);

    if (!schedule) {
      await updateSchedule(cadence, {
        time_of_day: nextTime,
      });
      return;
    }

    if (cadence === "weekly") {
      const weekday = new Date(`${schedule.anchor_date}T00:00:00`).getDay();

      await updateSchedule(cadence, {
        time_of_day: nextTime,
        anchor_date: getNextDateForWeekday(weekday, nextTime),
      });
      return;
    }

    await updateSchedule(cadence, {
      time_of_day: nextTime,
    });
  }

   function renderScheduleCard(schedule: ReminderSchedule | null) {
    if (!schedule) return null;

    const dateParts = parseDateParts(schedule.anchor_date);
    const weekday = new Date(`${schedule.anchor_date}T00:00:00`).getDay();
    const timeLabel = formatPreviewDateTime(
      new Date(
        2026,
        0,
        1,
        Number(schedule.time_of_day.split(":")[0] || "7"),
        Number(schedule.time_of_day.split(":")[1] || "0"),
        0,
        0
      )
    ).replace(/^\d+\/\d+\s/, "");

    return (
      <View
        key={schedule.cadence}
        style={{
          backgroundColor: "rgba(255,255,255,0.72)",
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
          marginBottom: 14,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: "#111827",
            }}
          >
            {getCadenceTitle(schedule.cadence)}
          </Text>

          {renderToggle(schedule.cadence, schedule.is_enabled)}
        </View>

 <View style={{ gap: 10 }}>
  {schedule.cadence === "weekly" ? (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
      }}
    >
      <View style={{ flex: 1 }}>
        {renderSettingRow("", weekdayLabel(weekday), () =>
          setSelectorState({ cadence: "weekly", type: "weekday" })
        )}
      </View>

      <View style={{ flex: 1 }}>
        {renderSettingRow("", timeLabel, () => openTimeEditor(schedule))}
      </View>
    </View>
  ) : null}

  {schedule.cadence === "daily" ? (
    renderSettingRow("Every day at", timeLabel, () => openTimeEditor(schedule))
  ) : null}

  {schedule.cadence === "monthly" ? (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
      }}
    >
      <View style={{ flex: 1 }}>
        {renderSettingRow("Day", String(dateParts.day), () =>
          setSelectorState({ cadence: "monthly", type: "day" })
        )}
      </View>

      <View style={{ flex: 1 }}>
        {renderSettingRow("", timeLabel, () => openTimeEditor(schedule))}
      </View>
    </View>
  ) : null}

{schedule.cadence === "quarterly" || schedule.cadence === "yearly" ? (
  <View
    style={{
      flexDirection: "row",
      gap: 6,
    }}
  >
    <View style={{ flex: 0.9 }}>
      {renderSettingRow("", monthLabels[dateParts.month - 1], () =>
        setSelectorState({ cadence: schedule.cadence, type: "month" })
      )}
    </View>

    <View style={{ flex: 0.65 }}>
      {renderSettingRow("", String(dateParts.day), () =>
        setSelectorState({ cadence: schedule.cadence, type: "day" })
      )}
    </View>

    <View style={{ flex: 1.15 }}>
      {renderSettingRow("", timeLabel, () => openTimeEditor(schedule))}
    </View>
  </View>
) : null}
</View>

        {renderUpcomingGrid(schedule)}
      </View>
    );
  }
const selectorOptions = useMemo(() => {
  if (!selectorState) return [];

  if (selectorState.type === "weekday") {
    return [0, 1, 2, 3, 4, 5, 6].map((value) => ({
      label: weekdayLabel(value),
      value,
    }));
  }

  if (selectorState.type === "month") {
    return monthLabels.map((label, index) => ({
      label,
      value: index + 1,
    }));
  }

  return Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    const mod10 = day % 10;
    const mod100 = day % 100;

    const label =
      mod10 === 1 && mod100 !== 11
        ? `${day}st`
        : mod10 === 2 && mod100 !== 12
        ? `${day}nd`
        : mod10 === 3 && mod100 !== 13
        ? `${day}rd`
        : `${day}th`;

    return {
      label,
      value: day,
    };
  });
}, [selectorState]);

   async function applySelectorValue(value: number) {
    if (!selectorState) return;

    const currentSelector = selectorState;
    const schedule = schedulesByCadence[currentSelector.cadence];
    if (!schedule) return;

    setSelectorState(null);

    if (currentSelector.type === "weekday") {
      await updateSchedule(schedule.cadence, {
        anchor_date: getNextDateForWeekday(value, schedule.time_of_day),
      });
      return;
    }

    if (currentSelector.type === "month") {
      await updateSchedule(schedule.cadence, {
        anchor_date: replaceDateParts(schedule.anchor_date, { month: value }),
      });
      return;
    }

    await updateSchedule(schedule.cadence, {
      anchor_date: replaceDateParts(schedule.anchor_date, { day: value }),
    });
  }

  const quickTimeOptions = useMemo(() => {
    const options: Array<{
      label: string;
      hour: string;
      minute: string;
      period: TimePeriod;
    }> = [];

    for (let hour24 = 0; hour24 < 24; hour24 += 1) {
      for (let minute = 0; minute < 60; minute += 15) {
        const period: TimePeriod = hour24 >= 12 ? "PM" : "AM";
        const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

        options.push({
          label: `${hour12}:${String(minute).padStart(2, "0")} ${period}`,
          hour: String(hour12),
          minute: String(minute).padStart(2, "0"),
          period,
        });
      }
    }

    return options;
  }, []);

  return (
    <ImageBackground source={reminderBackground} style={{ flex: 1 }} resizeMode="cover">
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.55)" }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
           <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 8,
              paddingBottom: 10,
            }}
          >
            <View
              style={{
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "700",
                  color: "#111",
                  textAlign: "center",
                  marginBottom: 4,
                }}
              >
                Reminders
              </Text>

              <Text
                style={{
                  fontSize: 14,
                  color: "#111",
                  lineHeight: 20,
                  textAlign: "center",
                }}
              >
                Set your notifications
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: 24,
              paddingBottom: 140,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {!hasLoadedSchedules ? (
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.72)",
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: "#475569",
                  }}
                >
                  Loading cadence settings...
                </Text>
              </View>
            ) : (
              <>
                {renderScheduleCard(schedulesByCadence.daily)}
                {renderScheduleCard(schedulesByCadence.weekly)}
                {renderScheduleCard(schedulesByCadence.monthly)}
                {renderScheduleCard(schedulesByCadence.quarterly)}
                {renderScheduleCard(schedulesByCadence.yearly)}
              </>
            )}
          </ScrollView>

            <Modal visible={!!selectorState} transparent animationType="slide">
            <Pressable
              onPress={() => setSelectorState(null)}
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.25)",
                justifyContent: "flex-end",
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  backgroundColor: "rgba(255,255,255,0.96)",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingTop: 20,
                  paddingHorizontal: 20,
                  paddingBottom: 24,
                  maxHeight: "72%",
                }}
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "700",
                    color: "#111827",
                    textAlign: "center",
                    marginBottom: 6,
                  }}
                >
                  {selectorState?.type === "weekday"
                    ? "Select Day"
                    : selectorState?.type === "month"
                    ? "Select Month"
                    : "Select Day"}
                </Text>

                <Text
                  style={{
                    fontSize: 14,
                    color: "#64748b",
                    textAlign: "center",
                    marginBottom: 16,
                  }}
                >
                  {selectorState?.type === "weekday"
                    ? "Choose the day for this reminder"
                    : selectorState?.type === "month"
                    ? "Choose the month for this reminder"
                    : "Choose the day of the month"}
                </Text>

 {selectorState && selectorOptions.length > 0 ? (
<View
  style={{
    marginBottom: 18,
    minHeight: 220,
  }}
>
 {renderPickerWheelColumn(
  selectorOptions,
  (() => {
    const schedule = schedulesByCadence[selectorState.cadence];
    if (!schedule) return "";

    const dateParts = parseDateParts(schedule.anchor_date);
    const weekday = new Date(`${schedule.anchor_date}T00:00:00`).getDay();

    if (selectorState.type === "weekday") return weekday;
    if (selectorState.type === "month") return dateParts.month;
    return dateParts.day;
  })(),
  (value) => applySelectorValue(Number(value)),
  selectorWheelRef,
  SELECTOR_VISIBLE_HEIGHT,
  1
)}
  </View>
) : (
  <View
    style={{
      marginBottom: 18,
      paddingVertical: 24,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Text
      style={{
        fontSize: 14,
        color: "#64748b",
      }}
    >
      No options available
    </Text>
  </View>
)}

                <Pressable
                  onPress={() => setSelectorState(null)}
                  style={{
                    paddingVertical: 14,
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
              </Pressable>
            </Pressable>
          </Modal>
           <Modal visible={!!pendingTimeCadence} transparent animationType="slide">
            <Pressable
              onPress={() => setPendingTimeCadence(null)}
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.25)",
                justifyContent: "flex-end",
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  backgroundColor: "rgba(255,255,255,0.96)",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingTop: 20,
                  paddingHorizontal: 20,
                  paddingBottom: 24,
                  maxHeight: "78%",
                }}
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "700",
                    color: "#111827",
                    textAlign: "center",
                    marginBottom: 6,
                  }}
                >
                  {pendingTimeCadence
                    ? getTimePickerHeader(
                        pendingTimeCadence,
                        schedulesByCadence[pendingTimeCadence]
                      ).title
                    : "Set Reminder Time"}
                </Text>

                <Text
                  style={{
                    fontSize: 14,
                    color: "#64748b",
                    textAlign: "center",
                    marginBottom: 14,
                  }}
                >
                  {pendingTimeCadence
                    ? getTimePickerHeader(
                        pendingTimeCadence,
                        schedulesByCadence[pendingTimeCadence]
                      ).subtitle
                    : "Set reminder time"}
                </Text>

                <View
                  style={{
                    backgroundColor: "#f8fafc",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#d1d5db",
                    paddingVertical: 14,
                    paddingHorizontal: 12,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: "700",
                      color: "#111827",
                      textAlign: "center",
                      letterSpacing: 0.3,
                    }}
                  >
                    {(pendingTimeHour || "12")}:{(pendingTimeMinute || "00")} {pendingTimePeriod}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  {renderPickerWheelColumn(
                    [1,2,3,4,5,6,7,8,9,10,11,12].map((value) => ({
                      label: String(value),
                      value: String(value),
                    })),
                    pendingTimeHour || "12",
                    (value) => setPendingTimeHour(String(value)),
                    1
                  )}

                  {renderPickerWheelColumn(
                    ["00", "15", "30", "45"].map((value) => ({
                      label: value,
                      value,
                    })),
                    pendingTimeMinute || "00",
                    (value) => setPendingTimeMinute(String(value)),
                    1
                  )}

                  {renderPickerWheelColumn(
                    [
                      { label: "AM", value: "AM" },
                      { label: "PM", value: "PM" },
                    ],
                    pendingTimePeriod,
                    (value) => setPendingTimePeriod(value as TimePeriod),
                    0.9
                  )}
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                  }}
                >
                  <Pressable
                    onPress={() => setPendingTimeCadence(null)}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
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
                    onPress={applyPendingTime}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: "#2563eb",
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
                      Set
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}