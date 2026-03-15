import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  ImageBackground,
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
    const { error } = await supabase.from("entries").delete().eq("id", id);

    if (error) {
      console.log("Error deleting entry:", error.message);
      return;
    }

    await loadCompletedEntries();
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

  const cadencePills = [
    { key: "all" as CadenceFilter, label: "All" },
    { key: "daily" as CadenceFilter, label: "Daily" },
    { key: "weekly" as CadenceFilter, label: "Wkly" },
    { key: "monthly" as CadenceFilter, label: "Mthly" },
    { key: "yearly" as CadenceFilter, label: "Yrly" },
  ];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ImageBackground source={completedHeaderImage} style={{ flex: 1 }} resizeMode="cover">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.30)" }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
            <ScrollView
  ref={scrollViewRef}
  keyboardShouldPersistTaps="handled"
  stickyHeaderIndices={[0]}
  contentContainerStyle={{
    paddingBottom: 40,
    flexGrow: 1,
  }}
>
  <View
    style={{
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 10,
      backgroundColor: "rgba(0,0,0,0.28)",
    }}
  >
    <View
      style={{
        minHeight: isSearchFocused ? 90 : 150,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 14,
        paddingHorizontal: 12,
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
          letterSpacing: 0.3,
        }}
      >
        Take time to reflect
      </Text>
    </View>

    <View style={{ marginBottom: 14 }}>
      <TextInput
        placeholder="Search archived entries..."
        placeholderTextColor="rgba(0,0,0,0.45)"
        value={searchText}
        onChangeText={setSearchText}
        onFocus={() => {
          setIsSearchFocused(true);
          setTimeout(() => {
            scrollViewRef.current?.scrollTo({
              y: 0,
              animated: true,
            });
          }, 150);
        }}
        onBlur={() => {
          setIsSearchFocused(false);
        }}
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.35)",
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 15,
          color: "black",
        }}
      />
    </View>

   <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{
    gap: 8,
    paddingRight: 4,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  }}
  style={{ marginBottom: 8 }}
>


      {cadencePills.map((pill) => {
        const isSelected = selectedCadence === pill.key;

        return (
          <Pressable
            key={pill.key}
            onPress={() => setSelectedCadence(pill.key)}
            style={{
            backgroundColor: isSelected ? "#3b6df6" : "rgba(255,255,255,0.88)",
            paddingHorizontal: 13,
            paddingVertical: 9,
            borderRadius: 999,
            alignSelf: "center",
          }}

          >
            <Text
              style={{
              color: isSelected ? "white" : "#2d2d2d",
              fontSize: 14,
              fontWeight: "700",
            }}

            >
              {pill.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>

  <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>


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
                    <View
                      style={{
                      backgroundColor: "rgba(255,255,255,0.88)",
                      borderRadius: 18,
                      padding: 16,
                      marginBottom: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: "#3b6df6",
                    }}

                    >
                      {hasTitle ? (
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: "#1f1f1f",
                            marginBottom: 4,
                          }}
                          numberOfLines={1}
                        >
                          {entry.title}
                        </Text>
                      ) : null}

                      <Text
                        style={{
                          fontSize: hasTitle ? 17 : 18,
                          fontWeight: hasTitle ? "400" : "600",
                          color: "#2d2d2d",
                          lineHeight: hasTitle ? 24 : 26,
                        }}
                      >
                        {entry.content}
                      </Text>

                      {entry.answer_notes ? (
                        <Text
                          style={{
                            marginTop: 10,
                            fontSize: 13,
                            color: "#555",
                            lineHeight: 19,
                            fontStyle: "italic",
                          }}
                        >
                          Reflection: {entry.answer_notes}
                        </Text>
                      ) : null}

                      <Text
                        style={{
                          marginTop: 10,
                          fontSize: 13,
                          color: "#6a6a6a",
                          lineHeight: 18,
                        }}
                      >
                        {cadenceLabel} • {getArchivedText(entry.answered_at, entry.created_at)}
                      </Text>
                    </View>
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
                          lineHeight: 19,
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

          </SafeAreaView>
        </View>
      </ImageBackground>
    </GestureHandlerRootView>
  );
}
