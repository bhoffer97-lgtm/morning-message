import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type ReminderGroup = {
  id: string;
  name: string;
  cadence: "daily" | "weekly" | "monthly" | "yearly";
  time_of_day: string | null;
  day_of_week: number | null;
  day_of_month: number | null;
  month_of_year: number | null;
  is_active: boolean;
};

function formatTime(time: string | null) {
  if (!time) return "No time set";

  const [hours, minutes] = time.split(":");
  const hourNum = Number(hours);
  const minuteNum = Number(minutes);

  const suffix = hourNum >= 12 ? "PM" : "AM";
  const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;

  return `${displayHour}:${String(minuteNum).padStart(2, "0")} ${suffix}`;
}
function parseTimeForForm(time: string | null) {
  const safeTime = time && time.includes(":") ? time : "09:00";
  const [hours, minutes] = safeTime.split(":");
  const hourNum = Number(hours);
  const minuteNum = Number(minutes);

  const period: "AM" | "PM" = hourNum >= 12 ? "PM" : "AM";
  const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;

  return {
    hour: String(hour12),
    minute: String(minuteNum).padStart(2, "0"),
    period,
  };
}

function build24HourTime(
  hour: string,
  minute: string,
  period: "AM" | "PM"
) {
  const cleanHour = Math.min(12, Math.max(1, Number(hour) || 12));
  const cleanMinute = Math.min(59, Math.max(0, Number(minute) || 0));

  let hour24 = cleanHour % 12;
  if (period === "PM") {
    hour24 += 12;
  }

  return `${String(hour24).padStart(2, "0")}:${String(cleanMinute).padStart(2, "0")}`;
}

function sanitizeMinuteInput(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 2);
}

function sanitizeHourInput(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 2);
}

function formatGroupSchedule(group: ReminderGroup) {
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

    return `${group.day_of_week !== null ? days[group.day_of_week] : "Day not set"} • ${formatTime(group.time_of_day)}`;
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

export default function ReminderGroupsScreen() {
const [groups, setGroups] = useState<ReminderGroup[]>([]);
const [showDaily, setShowDaily] = useState(true);
const [showWeekly, setShowWeekly] = useState(true);
const [showMonthly, setShowMonthly] = useState(true);
const [showYearly, setShowYearly] = useState(true);
const [showCreateModal, setShowCreateModal] = useState(false);
const [newCadence, setNewCadence] = useState<ReminderGroup["cadence"]>("daily");
const [newName, setNewName] = useState("");
const defaultTimeParts = parseTimeForForm("09:00");
const [newHour, setNewHour] = useState(defaultTimeParts.hour);
const [newMinute, setNewMinute] = useState(defaultTimeParts.minute);
const [newPeriod, setNewPeriod] = useState<"AM" | "PM">(defaultTimeParts.period);
const [newDayOfWeek, setNewDayOfWeek] = useState("1");
const [newDayOfMonth, setNewDayOfMonth] = useState("1");
const [newMonthOfYear, setNewMonthOfYear] = useState("1");
const [isSavingGroup, setIsSavingGroup] = useState(false);
const [editingGroup, setEditingGroup] = useState<ReminderGroup | null>(null);
const [showEditModal, setShowEditModal] = useState(false);
const [isDeletingGroupId, setIsDeletingGroupId] = useState<string | null>(null);

const newTimeOfDay = useMemo(() => {
  return build24HourTime(newHour, newMinute, newPeriod);
}, [newHour, newMinute, newPeriod]);

  async function loadGroups() {
    const { data, error } = await supabase
      .from("reminder_groups")
      .select("id, name, cadence, time_of_day, day_of_week, day_of_month, month_of_year, is_active")
      .order("cadence", { ascending: true })
      .order("time_of_day", { ascending: true });

    if (error) {
      console.log("Load reminder groups error:", error.message);
      return;
    }

    setGroups((data as ReminderGroup[]) ?? []);
  }

  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [])
  );
function resetCreateForm(cadence: ReminderGroup["cadence"] = "daily") {
  const defaultNames: Record<ReminderGroup["cadence"], string> = {
    daily: "Daily Reminder",
    weekly: "Weekly Reminder",
    monthly: "Monthly Reminder",
    yearly: "Yearly Reminder",
    };

  setNewCadence(cadence);
  setNewName(defaultNames[cadence]);
  const defaultTime = parseTimeForForm("09:00");
  setNewHour(defaultTime.hour);
  setNewMinute(defaultTime.minute);
  setNewPeriod(defaultTime.period);
  setNewDayOfWeek("1");
  setNewDayOfMonth("1");
  setNewMonthOfYear("1");
}
function startEditGroup(group: ReminderGroup) {
  setEditingGroup(group);
  setNewCadence(group.cadence);
  setNewName(group.name);
  const parsedTime = parseTimeForForm(group.time_of_day ?? "09:00");
  setNewHour(parsedTime.hour);
  setNewMinute(parsedTime.minute);
  setNewPeriod(parsedTime.period);
  setNewDayOfWeek(String(group.day_of_week ?? 1));
  setNewDayOfMonth(String(group.day_of_month ?? 1));
  setNewMonthOfYear(String(group.month_of_year ?? 1));
  setShowCreateModal(false);
  setShowEditModal(true);
}

async function createReminderGroup() {

    if (!newName.trim()) {
    Alert.alert("Name required", "Please enter a reminder name.");
    return;
  }

  const hourNum = Number(newHour);
  const minuteNum = Number(newMinute);

  if (!hourNum || hourNum < 1 || hourNum > 12) {
    Alert.alert("Invalid time", "Please enter an hour between 1 and 12.");
    return;
  }

  if (Number.isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
    Alert.alert("Invalid time", "Please enter minutes between 00 and 59.");
    return;
  }


  setIsSavingGroup(true);

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    setIsSavingGroup(false);
    Alert.alert("Not signed in", "Please sign in again and try again.");
    return;
  }

  const payload: any = {
    user_id: userData.user.id,
    name: newName.trim(),
    cadence: newCadence,
    time_of_day: newTimeOfDay || null,
    is_active: true,
  };

  if (newCadence === "weekly") {
    payload.day_of_week = Number(newDayOfWeek);
  }

  if (newCadence === "monthly") {
    payload.day_of_month = Number(newDayOfMonth);
  }

  if (newCadence === "yearly") {
    payload.day_of_month = Number(newDayOfMonth);
    payload.month_of_year = Number(newMonthOfYear);
  }

  const { error } = await supabase.from("reminder_groups").insert(payload);

  setIsSavingGroup(false);

  if (error) {
    console.log("Create reminder group error:", error.message);
    Alert.alert("Could not save reminder", error.message);
    return;
  }

  setShowCreateModal(false);
  setShowEditModal(false);
  setEditingGroup(null);
  resetCreateForm("daily");
  await loadGroups();

}
async function updateReminderGroup() {
  if (!editingGroup) return;

   if (!newName.trim()) {
    Alert.alert("Name required", "Please enter a reminder name.");
    return;
  }

  const hourNum = Number(newHour);
  const minuteNum = Number(newMinute);

  if (!hourNum || hourNum < 1 || hourNum > 12) {
    Alert.alert("Invalid time", "Please enter an hour between 1 and 12.");
    return;
  }

  if (Number.isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
    Alert.alert("Invalid time", "Please enter minutes between 00 and 59.");
    return;
  }


  setIsSavingGroup(true);

  const payload: any = {
    name: newName.trim(),
    cadence: newCadence,
    time_of_day: newTimeOfDay || null,
  };

  payload.day_of_week = null;
  payload.day_of_month = null;
  payload.month_of_year = null;

  if (newCadence === "weekly") {
    payload.day_of_week = Number(newDayOfWeek);
  }

  if (newCadence === "monthly") {
    payload.day_of_month = Number(newDayOfMonth);
  }

  if (newCadence === "yearly") {
    payload.day_of_month = Number(newDayOfMonth);
    payload.month_of_year = Number(newMonthOfYear);
  }

  const { error } = await supabase
    .from("reminder_groups")
    .update(payload)
    .eq("id", editingGroup.id);

  setIsSavingGroup(false);

  if (error) {
    console.log("Update reminder group error:", error.message);
    Alert.alert("Could not update reminder", error.message);
    return;
  }

  setShowCreateModal(false);
  setShowEditModal(false);
  setEditingGroup(null);
  resetCreateForm("daily");
  await loadGroups();
}
async function deleteReminderGroup(group: ReminderGroup) {
  Alert.alert(
    "Delete reminder?",
    `Are you sure you want to delete "${group.name}"?`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setIsDeletingGroupId(group.id);

          const { error } = await supabase
            .from("reminder_groups")
            .delete()
            .eq("id", group.id);

          setIsDeletingGroupId(null);

          if (error) {
            console.log("Delete reminder group error:", error.message);
            Alert.alert("Could not delete reminder", error.message);
            return;
          }

          if (editingGroup?.id === group.id) {
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingGroup(null);
            resetCreateForm("daily");
          }

          await loadGroups();
        },
      },
    ]
  );
}

  const dailyGroups = groups.filter((group) => group.cadence === "daily");
  const weeklyGroups = groups.filter((group) => group.cadence === "weekly");
  const monthlyGroups = groups.filter((group) => group.cadence === "monthly");
  const yearlyGroups = groups.filter((group) => group.cadence === "yearly");

  const renderSection = (
    title: string,
    items: ReminderGroup[],
    expanded: boolean,
    setExpanded: (value: boolean) => void
  ) => (
    <View style={{ marginBottom: 18 }}>
      <Pressable onPress={() => setExpanded(!expanded)}>
        <View
          style={{
            backgroundColor: "#f3f4f6",
            borderRadius: 14,
            paddingVertical: 14,
            paddingHorizontal: 14,
            marginBottom: 10,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "700", color: "black" }}>
            {title} ({items.length})
          </Text>
          <Text style={{ fontSize: 16, color: "#555" }}>
            {expanded ? "▾" : "▸"}
          </Text>
        </View>
      </Pressable>

      {expanded && (
        <>
          {items.length > 0 ? (
            items.map((group) => (
              <View
                key={group.id}
                style={{
                  backgroundColor: "white",
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: "black",
                    marginBottom: 6,
                  }}
                >
                  {group.name}
                </Text>

                <Text
                  style={{
                    fontSize: 14,
                    color: "#666",
                    marginBottom: 6,
                  }}
                >
                  {formatGroupSchedule(group)}
                </Text>

                                                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: group.is_active ? "#2f855a" : "#999",
                      fontWeight: "600",
                    }}
                  >
                    {group.is_active ? "Active" : "Paused"}
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() => startEditGroup(group)}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        backgroundColor: "#f3f4f6",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: "#333",
                        }}
                      >
                        Edit
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => deleteReminderGroup(group)}
                      disabled={isDeletingGroupId === group.id}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        backgroundColor: "#fef2f2",
                        opacity: isDeletingGroupId === group.id ? 0.6 : 1,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: "#b91c1c",
                        }}
                      >
                        {isDeletingGroupId === group.id ? "Deleting..." : "Delete"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View
              style={{
                backgroundColor: "white",
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: "#e5e7eb",
              }}
            >
              <Text style={{ fontSize: 14, color: "#777" }}>
              No {title.toLowerCase()} reminders yet.
            </Text>
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingTop: 18,
          paddingBottom: 40,
        }}
      >
        <View style={{ marginBottom: 24 }}>
  <Text
    style={{
      fontSize: 28,
      fontWeight: "700",
      color: "black",
      marginBottom: 8,
    }}
  >
    Reminder Groups
  </Text>

  <Text
    style={{
      fontSize: 15,
      color: "#666",
      lineHeight: 22,
      marginBottom: 16,
    }}
  >
    Organize your reminders by schedule so one reminder can open the right set of entries.
  </Text>

  <Pressable
    onPress={() => {
      setShowEditModal(false);
      setEditingGroup(null);
      resetCreateForm("daily");
      setShowCreateModal(true);
    }}

    style={{
      backgroundColor: "#2e6cff",
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: "center",
    }}
  >
    <Text
      style={{
        color: "white",
        fontSize: 16,
        fontWeight: "600",
      }}
    >
      Create Reminder
    </Text>
    
  </Pressable>
</View>

        {renderSection("Daily", dailyGroups, showDaily, setShowDaily)}
        {renderSection("Weekly", weeklyGroups, showWeekly, setShowWeekly)}
        {renderSection("Monthly", monthlyGroups, showMonthly, setShowMonthly)}
        {renderSection("Yearly", yearlyGroups, showYearly, setShowYearly)}
      </ScrollView>
      <Modal visible={showCreateModal || showEditModal} transparent animationType="slide">
  <Pressable
        onPress={() => {
          setShowCreateModal(false);
          setShowEditModal(false);
          setEditingGroup(null);
          resetCreateForm("daily");
        }}

    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "flex-end",
    }}
  >
       <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{
        backgroundColor: "white",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: "85%",
      }}
        contentContainerStyle={{
        padding: 24,
        paddingBottom: 40,
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
       {editingGroup ? "Edit Reminder" : "Create Reminder"}
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: "#666",
          lineHeight: 20,
          marginBottom: 18,
        }}
      >
       {editingGroup
        ? "Update this reminder group and its schedule."
        : "Set up a reminder group for entries you want to revisit together."}
      </Text>

      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: "black",
          marginBottom: 8,
        }}
      >
        Reminder name
      </Text>

      <TextInput
        value={newName}
        onChangeText={setNewName}
        placeholder="Morning Reminder"
        style={{
          borderWidth: 1,
          borderColor: "#d6d6d6",
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 12,
          fontSize: 15,
          color: "black",
          marginBottom: 16,
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
        Cadence
      </Text>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginBottom: 16,
          marginHorizontal: -4,
        }}
      >
        {(["daily", "weekly", "monthly", "yearly"] as ReminderGroup["cadence"][]).map((cadence) => {
          const selected = newCadence === cadence;

          return (
            <View
              key={cadence}
              style={{
                width: "50%",
                paddingHorizontal: 4,
                marginBottom: 8,
              }}
            >
              <Pressable
                onPress={() => {
                  resetCreateForm(cadence);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: selected ? "#2e6cff" : "#f3f4f6",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: selected ? "white" : "#333",
                    fontSize: 14,
                    fontWeight: "600",
                    textTransform: "capitalize",
                  }}
                >
                  {cadence}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

            <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: "black",
          marginBottom: 8,
        }}
      >
        Time
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <TextInput
            value={newHour}
            onFocus={() => {
              if (newHour === "9" || newHour === "09") {
                setNewHour("");
              }
            }}
            onBlur={() => {
              if (!newHour) {
                setNewHour("9");
              }
            }}
            onChangeText={(value) => setNewHour(sanitizeHourInput(value))}
            placeholder="9"
            keyboardType="number-pad"
            maxLength={2}
            style={{
              width: 72,
              borderWidth: 1,
              borderColor: "#d6d6d6",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 16,
              color: "black",
              textAlign: "center",
              backgroundColor: "white",
            }}
          />

        <Text
          style={{
            fontSize: 20,
            fontWeight: "600",
            color: "#333",
            marginHorizontal: 8,
          }}
        >
          :
        </Text>

        <TextInput
            value={newMinute}
            onFocus={() => {
              if (newMinute === "00") {
                setNewMinute("");
              }
            }}
            onBlur={() => {
              if (!newMinute) {
                setNewMinute("00");
              }
            }}
            onChangeText={(value) => setNewMinute(sanitizeMinuteInput(value))}
            placeholder="00"
            keyboardType="number-pad"
            maxLength={2}
            style={{
              width: 72,
              borderWidth: 1,
              borderColor: "#d6d6d6",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 16,
              color: "black",
              textAlign: "center",
              backgroundColor: "white",
            }}
          />

        <View
          style={{
            flexDirection: "row",
            marginLeft: 12,
            backgroundColor: "#f3f4f6",
            borderRadius: 999,
            padding: 4,
          }}
        >
          {(["AM", "PM"] as const).map((period) => {
            const selected = newPeriod === period;

            return (
              <Pressable
                key={period}
                onPress={() => setNewPeriod(period)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: selected ? "#2e6cff" : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: selected ? "white" : "#333",
                  }}
                >
                  {period}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text
        style={{
          fontSize: 12,
          color: "#777",
          lineHeight: 18,
          marginBottom: 16,
        }}
      >
        Example: 2:00 PM
      </Text>


      {newCadence === "weekly" && (
        <>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: "black",
              marginBottom: 8,
            }}
          >
            Day of week (0=Sun, 1=Mon ... 6=Sat)
          </Text>

          <TextInput
            value={newDayOfWeek}
            onChangeText={setNewDayOfWeek}
            placeholder="1"
            style={{
              borderWidth: 1,
              borderColor: "#d6d6d6",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 15,
              color: "black",
              marginBottom: 16,
            }}
          />
        </>
      )}

      {newCadence === "monthly" && (
        <>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: "black",
              marginBottom: 8,
            }}
          >
            Day of month
          </Text>

          <TextInput
            value={newDayOfMonth}
            onChangeText={setNewDayOfMonth}
            placeholder="1"
            style={{
              borderWidth: 1,
              borderColor: "#d6d6d6",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 15,
              color: "black",
              marginBottom: 8,
            }}
          />

          <Text
            style={{
              fontSize: 12,
              color: "#777",
              lineHeight: 18,
              marginBottom: 16,
            }}
          >
            If a month is shorter, this reminder will occur on the last valid day.
          </Text>
        </>
      )}

      {newCadence === "yearly" && (
        <>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: "black",
              marginBottom: 8,
            }}
          >
            Month of year
          </Text>

          <TextInput
            value={newMonthOfYear}
            onChangeText={setNewMonthOfYear}
            placeholder="1"
            style={{
              borderWidth: 1,
              borderColor: "#d6d6d6",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 15,
              color: "black",
              marginBottom: 16,
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
            Day of month
          </Text>

          <TextInput
            value={newDayOfMonth}
            onChangeText={setNewDayOfMonth}
            placeholder="1"
            style={{
              borderWidth: 1,
              borderColor: "#d6d6d6",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 15,
              color: "black",
              marginBottom: 8,
            }}
          />

          <Text
            style={{
              fontSize: 12,
              color: "#777",
              lineHeight: 18,
              marginBottom: 16,
            }}
          >
            If that date does not exist in a given year, this reminder will occur on the last valid day.
          </Text>
        </>
      )}

            <View style={{ marginTop: 4, gap: 10 }}>
        <Pressable
          onPress={editingGroup ? updateReminderGroup : createReminderGroup}
          disabled={isSavingGroup}
          style={{
            backgroundColor: "#2e6cff",
            borderRadius: 10,
            paddingVertical: 14,
            opacity: isSavingGroup ? 0.7 : 1,
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
            {isSavingGroup ? "Saving..." : editingGroup ? "Save Changes" : "Save Reminder"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingGroup(null);
            resetCreateForm("daily");
          }}
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
</Modal>
    </SafeAreaView>
  );
}