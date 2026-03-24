import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
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

function build24HourTime(hour: string, minute: string, period: "AM" | "PM") {
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
  const [selectedCadenceFilter, setSelectedCadenceFilter] = useState<
    "all" | "daily" | "weekly" | "monthly" | "yearly"
  >("all");
  const [showCadenceMenu, setShowCadenceMenu] = useState(false);
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
  const scrollRef = useRef<ScrollView>(null);
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

    // reset scroll to top
    scrollRef.current?.scrollTo({ y: 0, animated: false });
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

  const filteredGroups = useMemo(() => {
    if (selectedCadenceFilter === "all") return groups;

    return groups.filter((group) => group.cadence === selectedCadenceFilter);
  }, [groups, selectedCadenceFilter]);

  return (
    <ImageBackground source={reminderBackground} style={{ flex: 1 }} resizeMode="cover">
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.55)" }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
 {/* HEADER (FIXED) */}
<View
  style={{
    padding: 24,
    paddingTop: 20,
    paddingBottom: 14,
    backgroundColor: "rgba(255,255,255,0.35)", // lighter = more glass
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
    Reminder Groups
  </Text>

  <Text
    style={{
      fontSize: 15,
      color: "black",
      lineHeight: 22,
      marginBottom: 16,
    }}
  >
    Create reminders to group entries and control notifications.
  </Text>

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
        paddingVertical: 9,
        paddingHorizontal: 13,
        borderRadius: 10,
        backgroundColor: "rgba(40,40,40,0.85)",
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

    <Pressable
      onPress={() => {
        setShowEditModal(false);
        setEditingGroup(null);
        resetCreateForm("daily");
        setShowCreateModal(true);
      }}
      style={{
        backgroundColor: "rgba(40,40,40,0.95)",
        borderRadius: 12,
        paddingVertical: 9,
        paddingHorizontal: 13,
      }}
    >
      <Text
        style={{
          color: "white",
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        Create Reminder
      </Text>
    </Pressable>
  </View>
</View>

<ScrollView
  ref={scrollRef}
  contentContainerStyle={{
    padding: 24,
    paddingTop: 10,
    paddingBottom: 40,
  }}
>

            {filteredGroups.length > 0 ? (
              filteredGroups.map((group) => (
                <View
                  key={group.id}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.92)",
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    shadowColor: "#000",
                    shadowOpacity: 0.06,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 2,
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
                  backgroundColor: "rgba(255,255,255,0.92)",
                  borderRadius: 14,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 2,
                }}
              >
                <Text style={{ fontSize: 14, color: "#777" }}>
                  No reminders for this filter yet.
                </Text>
              </View>
            )}
          </ScrollView>

          <Modal visible={showCadenceMenu} transparent animationType="fade">
            <Pressable
              onPress={() => setShowCadenceMenu(false)}
              style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: "rgba(40,40,40,0.85)",
              alignItems: "center",
            }}
            >
              <View
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  paddingVertical: 8,
                }}
              >
                {(["all", "daily", "weekly", "monthly", "yearly"] as const).map(
                  (option) => {
                    const labelMap = {
                      all: "All",
                      daily: "Daily",
                      weekly: "Weekly",
                      monthly: "Monthly",
                      yearly: "Yearly",
                    };

                    return (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setSelectedCadenceFilter(option);
                          setShowCadenceMenu(false);
                        }}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                        }}
                      >
                        <Text style={{ fontSize: 15, color: "#333" }}>
                          {labelMap[option]}
                        </Text>
                      </Pressable>
                    );
                  }
                )}
              </View>
            </Pressable>
          </Modal>

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
                  {(["daily", "weekly", "monthly", "yearly"] as ReminderGroup["cadence"][]).map(
                    (cadence) => {
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
                            paddingVertical: 12,
                            paddingHorizontal: 16,
                            borderRadius: 12,
                           backgroundColor: selected ? "#2e6cff" : "rgba(0,0,0,0.6)",
                            marginLeft: 20,
                          }}
                          >
                            <Text
                              style={{
                                color: selected ? "white" : "white",
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
                    }
                  )}
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
                      If that date does not exist in a given year, this reminder will occur on the
                      last valid day.
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
                      {isSavingGroup
                        ? "Saving..."
                        : editingGroup
                        ? "Save Changes"
                        : "Save Reminder"}
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
      </View>
    </ImageBackground>
  );
}