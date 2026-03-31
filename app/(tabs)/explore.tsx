import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const reminderBackground = require("../../assets/images/morning-nature-2.jpg");

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

const cadenceOrder: ReminderCadence[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

const monthLabels = [
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

function getNextDateForWeekday(targetDay: number) {
  const now = new Date();
  const currentDay = now.getDay();
  let diff = targetDay - currentDay;

  if (diff < 0) diff += 7;
  if (diff === 0) diff = 7;

  now.setDate(now.getDate() + diff);

  return formatDateString(now.getFullYear(), now.getMonth() + 1, now.getDate());
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

  return `Upcoming notifications: ${upcoming
    .map((date) => formatPreviewDateTime(date, includeYear))
    .join(", ")}`;
}

export default function ReminderGroupsScreen() {
  const [schedules, setSchedules] = useState<ReminderSchedule[]>([]);
  const [selectorState, setSelectorState] = useState<SelectorState>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function loadReminderSchedules() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load reminder schedules user error:", userError?.message);
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

  function renderTimeRow(schedule: ReminderSchedule) {
    const form = parseTimeForForm(schedule.time_of_day);

    return (
      <View>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: "#475569",
            marginBottom: 6,
          }}
        >
          Time
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput
            value={form.hour}
            onChangeText={(value) => {
              const nextHour = sanitizeHourInput(value);
              updateSchedule(schedule.cadence, {
                time_of_day: build24HourTime(nextHour || "12", form.minute, form.period),
              });
            }}
            keyboardType="number-pad"
            placeholder="7"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#d1d5db",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "white",
              color: "black",
              fontSize: 14,
            }}
          />

          <TextInput
            value={form.minute}
            onChangeText={(value) => {
              const nextMinute = sanitizeMinuteInput(value);
              updateSchedule(schedule.cadence, {
                time_of_day: build24HourTime(form.hour, nextMinute || "00", form.period),
              });
            }}
            keyboardType="number-pad"
            placeholder="00"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#d1d5db",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "white",
              color: "black",
              fontSize: 14,
            }}
          />

          <Pressable
            onPress={() =>
              updateSchedule(schedule.cadence, {
                time_of_day: build24HourTime(
                  form.hour,
                  form.minute,
                  form.period === "AM" ? "PM" : "AM"
                ),
              })
            }
            style={{
              minWidth: 72,
              borderWidth: 1,
              borderColor: "#d1d5db",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "white",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: "#111827",
              }}
            >
              {form.period}
            </Text>
          </Pressable>
        </View>
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

  function renderScheduleCard(schedule: ReminderSchedule | null) {
    if (!schedule) return null;

    const dateParts = parseDateParts(schedule.anchor_date);
    const weekday = new Date(`${schedule.anchor_date}T00:00:00`).getDay();

    return (
    <View
      key={schedule.cadence}
      style={{
        backgroundColor: "rgba(255,255,255,0.92)",
        borderRadius: 14,
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
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: "#111827",
          }}
        >
          {getCadenceTitle(schedule.cadence)}
        </Text>

        {renderToggle(schedule.cadence, schedule.is_enabled)}
      </View>

      {schedule.cadence === "weekly" ? (
        <View style={{ marginBottom: 14 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: "#475569",
              marginBottom: 6,
            }}
          >
            Day
          </Text>

          {renderSelectorButton(weekdayLabel(weekday), () =>
            setSelectorState({ cadence: "weekly", type: "weekday" })
          )}
        </View>
      ) : null}

      {schedule.cadence === "monthly" ? (
        <View style={{ marginBottom: 14 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: "#475569",
              marginBottom: 6,
            }}
          >
            Day of month
          </Text>

          {renderSelectorButton(String(dateParts.day), () =>
            setSelectorState({ cadence: "monthly", type: "day" })
          )}
        </View>
      ) : null}

      {schedule.cadence === "quarterly" || schedule.cadence === "yearly" ? (
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: "#475569",
                marginBottom: 6,
              }}
            >
              Month
            </Text>

            {renderSelectorButton(monthLabels[dateParts.month - 1], () =>
              setSelectorState({ cadence: schedule.cadence, type: "month" })
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: "#475569",
                marginBottom: 6,
              }}
            >
              Day
            </Text>

            {renderSelectorButton(String(dateParts.day), () =>
              setSelectorState({ cadence: schedule.cadence, type: "day" })
            )}
          </View>
        </View>
      ) : null}

      {renderTimeRow(schedule)}

      <Text
        style={{
          fontSize: 14,
          lineHeight: 22,
          color: "#4b5563",
          marginTop: 12,
        }}
      >
        {getUpcomingNotificationsText(schedule)}
        {savingKey === schedule.cadence ? "  •  Saving..." : ""}
      </Text>
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

    return Array.from({ length: 31 }, (_, index) => ({
      label: String(index + 1),
      value: index + 1,
    }));
  }, [selectorState]);

  async function applySelectorValue(value: number) {
    if (!selectorState) return;

    const schedule = schedulesByCadence[selectorState.cadence];
    if (!schedule) return;

    if (selectorState.type === "weekday") {
      await updateSchedule(schedule.cadence, {
        anchor_date: getNextDateForWeekday(value),
      });
      setSelectorState(null);
      return;
    }

    if (selectorState.type === "month") {
      await updateSchedule(schedule.cadence, {
        anchor_date: replaceDateParts(schedule.anchor_date, { month: value }),
      });
      setSelectorState(null);
      return;
    }

    await updateSchedule(schedule.cadence, {
      anchor_date: replaceDateParts(schedule.anchor_date, { day: value }),
    });
    setSelectorState(null);
  }

  return (
    <ImageBackground source={reminderBackground} style={{ flex: 1 }} resizeMode="cover">
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.55)" }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
          <View
            style={{
              padding: 24,
              paddingTop: 20,
              paddingBottom: 14,
              backgroundColor: "rgba(255,255,255,0.35)",
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.4)",
            }}
          >
            <Text
              style={{
                fontSize: 28,
                fontWeight: "700",
                color: "#111",
                textShadowColor: "rgba(255,255,255,0.4)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
                marginBottom: 8,
              }}
            >
              Reminders
            </Text>

            <Text
              style={{
                fontSize: 15,
                color: "black",
                lineHeight: 22,
              }}
            >
              Set when your reminders should appear.
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: 24,
              paddingBottom: 40,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {renderScheduleCard(schedulesByCadence.daily)}
            {renderScheduleCard(schedulesByCadence.weekly)}
            {renderScheduleCard(schedulesByCadence.monthly)}
            {renderScheduleCard(schedulesByCadence.quarterly)}
            {renderScheduleCard(schedulesByCadence.yearly)}
          </ScrollView>

          <Modal visible={!!selectorState} transparent animationType="fade">
            <Pressable
              onPress={() => setSelectorState(null)}
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.2)",
                justifyContent: "center",
                padding: 40,
              }}
            >
              <View
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  paddingVertical: 8,
                  maxHeight: "70%",
                }}
              >
                <ScrollView>
                  {selectorOptions.map((option) => (
                    <Pressable
                      key={`${selectorState?.type}-${option.value}`}
                      onPress={() => applySelectorValue(option.value)}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          color: "#333",
                          fontWeight: "500",
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </Pressable>
          </Modal>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}