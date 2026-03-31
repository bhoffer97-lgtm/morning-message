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
import { supabase } from "../../lib/supabase";

const archivedHeaderImage = require("../../assets/images/morning-nature-4.jpg");

type CadenceFilter = "all" | "daily" | "weekly" | "monthly" | "yearly";

function getArchivedText(entry: any) {
  const eventDate = entry.archived_at || entry.retired_at;

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
  retired_at,
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
};

   const deleteEntry = async (id: string) => {
    console.log("Attempting to delete archived entry:", id);

    const { error } = await supabase.from("entries").delete().eq("id", id);

    if (error) {
      console.log("Error deleting archived entry:", error);
      Alert.alert("Unable to delete", error.message);
      return;
    }

    if (selectedArchivedEntry?.id === id) {
      setShowArchivedEntryModal(false);
      setSelectedArchivedEntry(null);
    }

    setArchivedEntries((current) => current.filter((entry) => entry.id !== id));
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
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.30)" }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>

          {/* ===== FIXED HEADER ===== */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 20,
              paddingHorizontal: 20,
              paddingTop: 100,
              paddingBottom: 28,
              backgroundColor: "rgba(0,0,0,0.25)",
            }}
          >
            {/* Title */}
           <View
            style={{
              marginTop: 10,
              marginBottom: 48,
              alignItems: "center",
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
                }}
              >
                Take time to reflect
              </Text>
            </View>

            {/* Search + Dropdown Row */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              {/* Search */}
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.92)",
                  borderRadius: 14,
                  paddingLeft: 14,
                  paddingRight: 10,
                }}
              >
                <TextInput
                  placeholder="Search..."
                  placeholderTextColor="rgba(0,0,0,0.45)"
                  value={searchText}
                  onChangeText={setSearchText}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: "black",
                  }}
                />

                {searchText.trim().length > 0 ? (
                  <Pressable
                    onPress={() => setSearchText("")}
                    hitSlop={10}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0,0,0,0.10)",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: "#374151",
                        lineHeight: 14,
                      }}
                    >
                      ×
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Dropdown */}
              <Pressable
                onPress={() => setShowCadenceMenu(true)}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: "#f3f4f6",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#333" }}>
                  {selectedCadence === "all"
                    ? "All"
                    : selectedCadence === "daily"
                    ? "Daily"
                    : selectedCadence === "weekly"
                    ? "Weekly"
                    : selectedCadence === "monthly"
                    ? "Monthly"
                    : "Yearly"} ▼
                </Text>
              </Pressable>
            </View>
          </View>

          {/* ===== SCROLLABLE CONTENT ===== */}
          <ScrollView
            ref={scrollViewRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingTop: 240,
              paddingHorizontal: 20,
              paddingBottom: 20,
            }}
          >
            <View style={{ paddingTop: 6 }}>

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

                    <View
                      style={{
                        alignSelf: "flex-start",
                        backgroundColor: "rgba(31,31,31,0.72)",
                        borderRadius: 10,
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: "white",
                        }}
                        numberOfLines={1}
                      >
                        {cadenceLabel} • {getArchivedText(entry)}
                      </Text>
                    </View>
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
  <ImageBackground
    source={archivedHeaderImage}
    resizeMode="cover"
    style={{ flex: 1 }}
  >
    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.28)" }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
        <Pressable
          onPress={() => {
            setShowArchivedEntryModal(false);
            setSelectedArchivedEntry(null);
          }}
          style={{
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(40,40,40,0.85)",
          }}
        >
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: "white",
              textAlign: "center",
            }}
          >
            {selectedArchivedEntry?.title?.trim() || "Untitled Entry"}
          </Text>
        </Pressable>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 36,
          }}
        >
          {!!selectedArchivedEntry && (
            <View
              style={{
                backgroundColor: "#fafafa",
                borderRadius: 18,
                padding: 18,
                borderWidth: 1,
                borderColor: "#e5e7eb",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 22,
                  color: "#222",
                  marginBottom: 28,
                }}
              >
                {selectedArchivedEntry.content}
              </Text>

               {selectedArchivedEntry.resolution_note ? (
                <View
                  style={{
                    backgroundColor: "#f8fafc",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 24,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#334155",
                      marginBottom: 6,
                    }}
                  >
                    Archive note
                  </Text>

                  <Text
                    style={{
                      fontSize: 14,
                      lineHeight: 22,
                      color: "#334155",
                    }}
                  >
                    {selectedArchivedEntry.resolution_note}
                  </Text>
                </View>
              ) : null}

              <View
                style={{
                  alignItems: "center",
                  marginBottom: 24,
                }}
              >
                <View
                  style={{
                    width: 120,
                    height: 1,
                    backgroundColor: "#d1d5db",
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  marginBottom: 14,
                  flexWrap: "wrap",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Pressable
                  onPress={() => {
                    setShowArchivedEntryModal(false);
                    setSelectedArchivedEntry(null);
                    restoreEntry(selectedArchivedEntry.id);
                  }}
                  style={{
                    backgroundColor: "#2f855a",
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    Restore
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => confirmDeleteEntry(selectedArchivedEntry.id)}
                  style={{
                    backgroundColor: "#fef2f2",
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                  }}
                >
                  <Text
                    style={{
                      color: "#b91c1c",
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    Delete
                  </Text>
                </Pressable>
              </View>

              <Text
                style={{
                  fontSize: 12,
                  color: "#666",
                  marginBottom: 18,
                }}
              >
                 {getCadenceLabel(selectedArchivedEntry)} • {getArchivedText(selectedArchivedEntry)}
              </Text>

              <Pressable
                onPress={() => {
                  setShowArchivedEntryModal(false);
                  setSelectedArchivedEntry(null);
                }}
                style={{
                  alignSelf: "stretch",
                  backgroundColor: "rgba(40,40,40,0.85)",
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "white",
                  }}
                >
                  Close / Return
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  </ImageBackground>
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
}}
