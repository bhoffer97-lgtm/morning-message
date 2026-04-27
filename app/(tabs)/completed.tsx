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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { syncLocalNotifications } from "../../lib/notifications/syncNotifications";
import { supabase } from "../../lib/supabase";

const archivedHeaderImage = require("../../assets/images/morning-nature-21.jpg");

type CadenceFilter = "all" | "daily" | "weekly" | "monthly" | "yearly";

function getArchivedText(entry: any) {
  const eventDate = entry.archived_at

  if (!eventDate) return "";

  const eventDateObj = new Date(eventDate);
  const formattedDate = eventDateObj.toLocaleDateString();

  const prefix = entry.status === "retired" ? "Retired" : "Archived";

  if (!entry.created_at) {
    return `${prefix} on ${formattedDate}`;
  }

  const createdDate = new Date(entry.created_at);
  const diffMs = eventDateObj.getTime() - createdDate.getTime();
  const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return `${prefix} on ${formattedDate} after ${diffDays} day${diffDays === 1 ? "" : "s"}`;
}

function getCadenceLabel(entry: any) {
  const digestAssignment = (entry.digest_assignment || "").toLowerCase();
  const scheduleMode = (entry.schedule_mode || "").toLowerCase();

  if (digestAssignment === "daily") return "Daily";
  if (digestAssignment === "weekly") return "Weekly";
  if (digestAssignment === "monthly") return "Monthly";
  if (digestAssignment === "yearly") return "Yearly";

  if (scheduleMode === "daily_time") return "Daily";
  if (scheduleMode === "annual_date") return "Yearly";
  if (scheduleMode === "interval") return "Repeating";
  if (scheduleMode === "fixed_date") return "One Date";
  if (scheduleMode === "holiday") return "Holiday";

  return "Archived";
}

function cadenceMatchesFilter(
  cadence: string | null | undefined,
  filter: CadenceFilter
) {
  if (filter === "all") return true;
  return (cadence || "").toLowerCase() === filter;
}

export default function CompletedScreen() {
  const [archivedEntries, setArchivedEntries] = useState<any[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedCadence, setSelectedCadence] = useState<CadenceFilter>("all");
  const [showCadenceMenu, setShowCadenceMenu] = useState(false);
  const [selectedArchivedEntry, setSelectedArchivedEntry] = useState<any | null>(null);
  const [showArchivedEntryModal, setShowArchivedEntryModal] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);

  async function loadArchivedEntries() {
    const { data, error } = await supabase
      .from("entries")
      .select(`
        id,
        title,
        content,
        status,
        created_at,
        archived_at,
        resolution_note,
        digest_assignment,
        schedule_mode,
        next_due_at,
        due_date,
        due_time,
        annual_month,
        annual_day,
        interval_value,
        interval_unit
      `)
      .in("status", ["archived", "retired"])
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.log("Load archived entries error:", error.message);
      return;
    }

    if (data) {
      setArchivedEntries(data);
    }
  }

 const restoreEntry = async (id: string) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("No user found for restore");
    return;
  }

  const { error } = await supabase.rpc("reactivate_entry", {
    p_entry_id: id,
    p_user_id: user.id,
  });

  if (error) {
    console.log("Error restoring entry:", error.message);
    return;
  }

    await loadArchivedEntries();

    try {
      await syncLocalNotifications();
    } catch (syncError) {
      console.log("Restore notification sync error:", syncError);
    }
};

    const deleteEntry = async (id: string) => {
    console.log("Attempting to soft delete archived entry:", id);

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
      console.log("Error soft deleting archived entry:", error);
      Alert.alert("Unable to delete", error.message);
      return;
    }

    if (selectedArchivedEntry?.id === id) {
      setShowArchivedEntryModal(false);
      setSelectedArchivedEntry(null);
    }
    setArchivedEntries((current) => current.filter((entry) => entry.id !== id));

    try {
      await syncLocalNotifications();
    } catch (syncError) {
      console.log("Archived delete notification sync error:", syncError);
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

    useFocusEffect(
    useCallback(() => {
      loadArchivedEntries();
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return archivedEntries.filter((entry) => {
      const title = entry.title?.toLowerCase() ?? "";
      const content = entry.content?.toLowerCase() ?? "";
      const archiveNote = (entry.resolution_note || "").toLowerCase();
      const cadence = entry.digest_assignment ?? null;
      const scheduleMode = entry.schedule_mode ?? "";

      const matchesSearch =
        !normalizedSearch ||
        title.includes(normalizedSearch) ||
        content.includes(normalizedSearch) ||
        archiveNote.includes(normalizedSearch) ||
        scheduleMode.toLowerCase().includes(normalizedSearch);

      const matchesCadence = cadenceMatchesFilter(cadence, selectedCadence);

      return matchesSearch && matchesCadence;
    });
   }, [archivedEntries, searchText, selectedCadence]);

  const hasSearch = searchText.trim().length > 0;

  return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <ImageBackground source={archivedHeaderImage} style={{ flex: 1 }} resizeMode="cover">
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.45)" }}>
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
                  color: "white",
                  textAlign: "center",
                  textShadowColor: "rgba(0,0,0,0.35)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 6,
                  marginBottom: 6,
                }}
              >
                Take time to reflect
              </Text>

              <Text
                style={{
                  fontSize: 15,
                  color: "rgba(255,255,255,0.92)",
                  textAlign: "center",
                  lineHeight: 22,
                  textShadowColor: "rgba(0,0,0,0.25)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 4,
                }}
              >
                Read through your archived entries
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
                  backgroundColor: "rgba(255,255,255,0.88)",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151" }}>
                  {selectedCadence === "all"
                    ? "All"
                    : selectedCadence === "daily"
                    ? "Daily"
                    : selectedCadence === "weekly"
                    ? "Weekly"
                    : selectedCadence === "monthly"
                    ? "Monthly"
                    : "Yearly"}{" "}
                  ▼
                </Text>
              </Pressable>

              <View style={{ flex: 1, position: "relative" }}>
                <TextInput
                  placeholder="Search..."
                  placeholderTextColor="#6b7280"
                  value={searchText}
                  onChangeText={setSearchText}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
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
                    onPress={() => setSearchText("")}
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

          {/* ===== SCROLLABLE CONTENT ===== */}
           <ScrollView
            ref={scrollViewRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 20,
            }}
          >
            <View style={{ paddingTop: 2 }}>

              {filteredEntries.map((entry) => {
                 const cadenceLabel = getCadenceLabel(entry);

                 return (
                  <Pressable
                    key={entry.id}
                    onPress={() => {
                      setSelectedArchivedEntry(entry);
                      setShowArchivedEntryModal(true);
                    }}
                    style={{
                      paddingVertical: 8,
                      marginBottom: 8,
                    }}
                  >
                    <View
                      style={{
                        alignSelf: "flex-start",
                        backgroundColor: "rgba(255,255,255,0.68)",
                        borderRadius: 10,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: "#1f1f1f",
                        }}
                        numberOfLines={1}
                      >
                        {entry.title?.trim() || "Untitled Entry"}
                      </Text>
                    </View>
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
                      {cadenceLabel} • {getArchivedText(entry)}
                    </Text>
                  </Pressable>
                );
              })}

              {filteredEntries.length === 0 && (
                <View
                  style={{
                    marginTop: 28,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 20,
                    backgroundColor: "rgba(255,255,255,0.16)",
                    borderRadius: 18,
                    paddingVertical: 28,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      color: "rgba(255,255,255,0.94)",
                      textAlign: "center",
                      fontWeight: "600",
                      marginBottom: 6,
                    }}
                  >
                    {hasSearch || selectedCadence !== "all"
                      ? "No archived entries found"
                      : "No archived entries yet"}
                  </Text>

                  <Text
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.78)",
                      textAlign: "center",
                    }}
                  >
                    {hasSearch || selectedCadence !== "all"
                      ? "Try a different search or cadence filter."
                      : "Archived items will appear here newest to oldest."}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

<Modal visible={showArchivedEntryModal} animationType="slide" presentationStyle="fullScreen">
  <View style={{ flex: 1 }}>
    <ImageBackground
      source={archivedHeaderImage}
      resizeMode="cover"
      style={{ flex: 1 }}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.58)" }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
          <View
            style={{
              flex: 1,
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 20,
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
                  setShowArchivedEntryModal(false);
                  setSelectedArchivedEntry(null);
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

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: 170,
                alignItems: "stretch",
              }}
            >
              {!!selectedArchivedEntry && (
                <>
                  <View
                    style={{
                      alignItems: "center",
                      marginBottom: 18,
                      paddingHorizontal: 14,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        letterSpacing: 1.2,
                        color: "#4b5563",
                        textTransform: "uppercase",
                        marginBottom: 8,
                      }}
                    >
                      Saved Reflection
                    </Text>

                    <Text
                      style={{
                        fontSize: 28,
                        fontWeight: "700",
                        color: "#111827",
                        textAlign: "center",
                        lineHeight: 34,
                        marginBottom: 10,
                      }}
                    >
                      {selectedArchivedEntry.title?.trim() || "Untitled Entry"}
                    </Text>

                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        lineHeight: 17,
                        fontWeight: "500",
                        color: "rgba(17,24,39,0.72)",
                        textAlign: "center",
                      }}
                      numberOfLines={1}
                    >
                      {getCadenceLabel(selectedArchivedEntry)} • {getArchivedText(selectedArchivedEntry)}
                    </Text>
                  </View>

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
                      {selectedArchivedEntry.content}
                    </Text>
                  </View>

                  <View style={{ height: 6 }} />
                </>
              )}
            </ScrollView>

            {!!selectedArchivedEntry && (
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
                  }}
                >
                  <Pressable
                    onPress={() => {
                      setShowArchivedEntryModal(false);
                      setSelectedArchivedEntry(null);
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
                      paddingHorizontal: 8,
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
                      if (!selectedArchivedEntry) return;
                      setShowArchivedEntryModal(false);
                      setSelectedArchivedEntry(null);
                      restoreEntry(selectedArchivedEntry.id);
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
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: "#166534",
                        fontSize: 15,
                        fontWeight: "700",
                        textAlign: "center",
                      }}
                    >
                      Restore
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (!selectedArchivedEntry) return;
                      confirmDeleteEntry(selectedArchivedEntry.id);
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
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: "#7f1d1d",
                        fontSize: 15,
                        fontWeight: "700",
                        textAlign: "center",
                      }}
                    >
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </ImageBackground>
  </View>
</Modal>
          {/* ===== DROPDOWN MODAL (UNCHANGED) ===== */}
          <Modal visible={showCadenceMenu} transparent animationType="fade">
            <Pressable
              onPress={() => setShowCadenceMenu(false)}
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
                          setSelectedCadence(option);
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
        </SafeAreaView>
      </View>
    </ImageBackground>
  </GestureHandlerRootView>
);
}
