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
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const completedHeaderImage = require("../../assets/images/morning-nature-4.jpg");

type CadenceFilter = "all" | "daily" | "weekly" | "monthly" | "yearly";

function getArchivedText(answeredAt?: string | null, createdAt?: string | null) {
  if (!answeredAt) return "";

  const archivedDate = new Date(answeredAt);
  const formattedDate = archivedDate.toLocaleDateString();

  if (!createdAt) {
    return `Archived on ${formattedDate}`;
  }

  const createdDate = new Date(createdAt);
  const diffMs = archivedDate.getTime() - createdDate.getTime();
  const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return `Archived on ${formattedDate} after ${diffDays} day${diffDays === 1 ? "" : "s"}`;
}

function getCadenceLabel(cadence?: string | null) {
  switch ((cadence || "").toLowerCase()) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    default:
      return "Archived";
  }
}

function cadenceMatchesFilter(cadence: string | null | undefined, filter: CadenceFilter) {
  if (filter === "all") return true;
  return (cadence || "").toLowerCase() === filter;
}

export default function CompletedScreen() {
    const [answeredEntries, setAnsweredEntries] = useState<any[]>([]);
    const [searchText, setSearchText] = useState("");
    const [selectedCadence, setSelectedCadence] = useState<CadenceFilter>("all");
    const [showCadenceMenu, setShowCadenceMenu] = useState(false);
    const [selectedArchivedEntry, setSelectedArchivedEntry] = useState<any | null>(null);
    const [showArchivedEntryModal, setShowArchivedEntryModal] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const scrollViewRef = useRef<ScrollView | null>(null);
  async function loadCompletedEntries() {
    const { data, error } = await supabase
      .from("entries")
      .select(`
        id,
        title,
        content,
        status,
        answered_at,
        created_at,
        answer_notes,
        reminder_group_id,
        reminder_groups (
          id,
          name,
          cadence
        )
      `)
      .eq("status", "answered")
      .order("answered_at", { ascending: false });

    if (error) {
      console.log("Load archived entries error:", error.message);
      return;
    }

    if (data) {
      setAnsweredEntries(data);
    }
  }

  const restoreEntry = async (id: string) => {
    const { error } = await supabase
      .from("entries")
      .update({ status: "active", answered_at: null })
      .eq("id", id);

    if (error) {
      console.log("Error restoring entry:", error.message);
      return;
    }

    await loadCompletedEntries();
  };

  const deleteEntry = async (id: string) => {
  console.log("Attempting to delete archived entry:", id);

  const { error } = await supabase.from("entries").delete().eq("id", id);

  if (error) {
    console.log("Error deleting archived entry:", error);
    Alert.alert("Unable to delete", error.message);
    return;
  }

  setAnsweredEntries((current) => current.filter((entry) => entry.id !== id));
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

  const renderCompletedRightActions = (id: string) => {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "stretch",
          marginBottom: 12,
        }}
      >
        <Pressable
          onPress={() => restoreEntry(id)}
          style={{
            width: 88,
            backgroundColor: "#2f855a",
            justifyContent: "center",
            alignItems: "center",
            borderTopLeftRadius: 18,
            borderBottomLeftRadius: 18,
          }}
        >
          <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>
            Restore
          </Text>
        </Pressable>

        <Pressable
          onPress={() => confirmDeleteEntry(id)}
          style={{
            width: 80,
            backgroundColor: "#d64545",
            justifyContent: "center",
            alignItems: "center",
            borderTopRightRadius: 18,
            borderBottomRightRadius: 18,
          }}
        >
          <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>
            Delete
          </Text>
        </Pressable>
      </View>
    );
  };

   useFocusEffect(
    useCallback(() => {
      loadCompletedEntries();
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return answeredEntries.filter((entry) => {
      const title = entry.title?.toLowerCase() ?? "";
      const content = entry.content?.toLowerCase() ?? "";
      const notes = entry.answer_notes?.toLowerCase() ?? "";
      const groupName = entry.reminder_groups?.name?.toLowerCase() ?? "";
      const cadence = entry.reminder_groups?.cadence ?? null;

      const matchesSearch =
        !normalizedSearch ||
        title.includes(normalizedSearch) ||
        content.includes(normalizedSearch) ||
        notes.includes(normalizedSearch) ||
        groupName.includes(normalizedSearch);

      const matchesCadence = cadenceMatchesFilter(cadence, selectedCadence);

      return matchesSearch && matchesCadence;
    });
  }, [answeredEntries, searchText, selectedCadence]);

  const hasSearch = searchText.trim().length > 0;

  return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <ImageBackground source={completedHeaderImage} style={{ flex: 1 }} resizeMode="cover">
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
                const reminderGroup = Array.isArray(entry.reminder_groups)
                  ? entry.reminder_groups[0]
                  : entry.reminder_groups;

                const cadenceLabel = getCadenceLabel(reminderGroup?.cadence);
                const hasTitle = !!entry.title?.trim();

                return (
                <Swipeable
                  key={entry.id}
                  renderRightActions={() => renderCompletedRightActions(entry.id)}
                  overshootRight={false}
                >
                <Pressable
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
                        {cadenceLabel} • {getArchivedText(entry.answered_at, entry.created_at)}
                      </Text>
                    </View>
                  </Pressable>
                </Swipeable>
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

<Modal visible={showArchivedEntryModal} transparent animationType="slide">
  <Pressable
    onPress={() => {
      setShowArchivedEntryModal(false);
      setSelectedArchivedEntry(null);
    }}
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "flex-end",
    }}
  >
    <Pressable
      onPress={() => {}}
      style={{
        maxHeight: "82%",
        backgroundColor: "white",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: "hidden",
      }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 36,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
            gap: 10,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 22,
              fontWeight: "700",
              color: "black",
              paddingRight: 12,
            }}
          >
            {selectedArchivedEntry?.title?.trim() || "Untitled Entry"}
          </Text>

          <Pressable
            onPress={() => {
              setShowArchivedEntryModal(false);
              setSelectedArchivedEntry(null);
            }}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 10,
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
              Close
            </Text>
          </Pressable>
        </View>

        {!!selectedArchivedEntry && (
          <>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 22,
                color: "#222",
                marginBottom: 14,
              }}
            >
              {selectedArchivedEntry.content}
            </Text>

            {selectedArchivedEntry.answer_notes ? (
              <Text
                style={{
                  marginBottom: 14,
                  fontSize: 13,
                  color: "#555",
                  lineHeight: 20,
                  fontStyle: "italic",
                }}
              >
                Reflection: {selectedArchivedEntry.answer_notes}
              </Text>
            ) : null}

            <Text
              style={{
                fontSize: 12,
                color: "#666",
              }}
            >
              {getCadenceLabel(
                Array.isArray(selectedArchivedEntry.reminder_groups)
                  ? selectedArchivedEntry.reminder_groups[0]?.cadence
                  : selectedArchivedEntry.reminder_groups?.cadence
              )}{" "}
              • {getArchivedText(selectedArchivedEntry.answered_at, selectedArchivedEntry.created_at)}
            </Text>
          </>
        )}
      </ScrollView>
    </Pressable>
  </Pressable>
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
