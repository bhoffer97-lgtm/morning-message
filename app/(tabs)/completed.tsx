import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import { Alert, ImageBackground, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const completedHeaderImage = require("../../assets/images/morning-nature-4.jpg");

function getEntryTypeStyles(type: string) {
  switch (type) {
    case "prayer":
      return {
        badgeBackground: "rgba(232,240,255,0.22)",
        badgeText: "#dbe8ff",
        borderLeftColor: "#2e6cff",
      };

    case "gratitude":
      return {
        badgeBackground: "#ffeaea",
        badgeText: "#d64545",
        borderLeftColor: "#d64545",
      };

    case "affirmation":
      return {
        badgeBackground: "#fff6cc",
        badgeText: "#d4a000",
        borderLeftColor: "#d4a000",
      };

    case "goal":
      return {
        badgeBackground: "rgba(232,247,238,0.22)",
        badgeText: "#c9f0d7",
        borderLeftColor: "#2f855a",
      };
    default:
      return {
        badgeBackground: "rgba(255,255,255,0.16)",
        badgeText: "#fff",
        borderLeftColor: "rgba(255,255,255,0.45)",
      };
  }
}

function getEntryTypeIcon(type: string) {
  switch (type) {
    case "prayer":
      return "🙏";
    case "gratitude":
      return "❤️";
    case "affirmation":
      return "✨";
    case "goal":
      return "🎯";
    default:
      return "•";
  }
}

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

export default function CompletedScreen() {
  const [answeredEntries, setAnsweredEntries] = useState<any[]>([]);
  const [searchText, setSearchText] = useState("");
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showCompletedPrayers, setShowCompletedPrayers] = useState(false);
  const [showCompletedGratitude, setShowCompletedGratitude] = useState(false);
  const [showCompletedAffirmations, setShowCompletedAffirmations] = useState(false);
  const [showCompletedGoals, setShowCompletedGoals] = useState(false);

  const filteredEntries = answeredEntries.filter((entry) =>
  entry.content?.toLowerCase().includes(searchText.toLowerCase())
);
  const completedPrayers = filteredEntries.filter((entry) => entry.type === "prayer");
  const completedGratitude = filteredEntries.filter((entry) => entry.type === "gratitude");
  const completedAffirmations = filteredEntries.filter((entry) => entry.type === "affirmation");
  const completedGoals = filteredEntries.filter((entry) => entry.type === "goal");

  async function loadCompletedEntries() {
    const { data, error } = await supabase
      .from("entries")
      .select("id, content, type, status, answered_at, created_at, answer_notes")
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
          marginBottom: 10,
        }}
      >
        <Pressable
          onPress={() => restoreEntry(id)}
          style={{
            width: 88,
            backgroundColor: "#2f855a",
            justifyContent: "center",
            alignItems: "center",
            borderTopLeftRadius: 10,
            borderBottomLeftRadius: 10,
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
            borderTopRightRadius: 10,
            borderBottomRightRadius: 10,
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ImageBackground source={completedHeaderImage} style={{ flex: 1 }} resizeMode="cover">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.28)" }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
            <ScrollView
             ref={scrollViewRef}
              contentContainerStyle={{
                padding: 24,
                paddingTop: 10,
                paddingBottom: 40,
                flexGrow: 1,
              }}
            >
              <View
                style={{
                  minHeight: 180,
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 24,
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
                    letterSpacing: 0.4,
                  }}
                >
                  Take time to reflect
                </Text>
              </View>
<View style={{ marginBottom: 20 }}>
  <TextInput
    placeholder="Search completed entries..."
    value={searchText}
    onChangeText={setSearchText}
    style={{
      backgroundColor: "rgba(255,255,255,0.95)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.35)",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      color: "black",
    }}
  />
</View>
              {completedPrayers.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Pressable onPress={() => setShowCompletedPrayers(!showCompletedPrayers)}>
                    <View
                      style={{
                        backgroundColor: "rgba(255,255,255,0.14)",
                        borderRadius: 14,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: "white",
                        }}
                      >
                        🙏 Prayers ({completedPrayers.length}) {showCompletedPrayers ? "▾" : "▸"}
                      </Text>
                    </View>
                  </Pressable>

                  {showCompletedPrayers &&
                    completedPrayers.map((p) => (
                      <Swipeable
                        key={p.id}
                        renderRightActions={() => renderCompletedRightActions(p.id)}
                        overshootRight={false}
                      >
                        <View
                          style={{
                            backgroundColor: "rgba(255,255,255,0.14)",
                            padding: 14,
                            borderRadius: 14,
                            marginBottom: 10,
                            borderLeftWidth: 4,
                            borderLeftColor: getEntryTypeStyles(p.type).borderLeftColor,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 12,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 16, color: "white", lineHeight: 22 }}>
                                  {p.content}
                                </Text>

                                <Text
                                        style={{
                                          fontSize: 11,
                                          color: "rgba(255,255,255,0.82)",
                                          marginTop: 8,
                                        }}
                                      >
                                        {getArchivedText(p.answered_at, p.created_at)}
                                      </Text>

                                      {p.answer_notes ? (
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      color: "rgba(255,255,255,0.92)",
                                      marginTop: 10,
                                      lineHeight: 20,
                                      fontStyle: "italic",
                                    }}
                                  >
                                    Reflection: {p.answer_notes}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        </View>
                      </Swipeable>
                    ))}
                </View>
              )}

              {completedGratitude.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Pressable onPress={() => setShowCompletedGratitude(!showCompletedGratitude)}>
                    <View
                      style={{
                        backgroundColor: "rgba(255,255,255,0.14)",
                        borderRadius: 14,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: "white",
                        }}
                      >
                        ❤️ Gratitude ({completedGratitude.length}) {showCompletedGratitude ? "▾" : "▸"}
                      </Text>
                    </View>
                  </Pressable>

                  {showCompletedGratitude &&
                    completedGratitude.map((p) => (
                      <Swipeable
                        key={p.id}
                        renderRightActions={() => renderCompletedRightActions(p.id)}
                        overshootRight={false}
                      >
                        <View
                          style={{
                            backgroundColor: "rgba(255,255,255,0.14)",
                            padding: 14,
                            borderRadius: 14,
                            marginBottom: 10,
                            borderLeftWidth: 4,
                            borderLeftColor: getEntryTypeStyles(p.type).borderLeftColor,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 12,
                            }}
                          >
                           <View style={{ flex: 1 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 16, color: "white", lineHeight: 22 }}>
                                  {p.content}
                                </Text>

                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: "rgba(255,255,255,0.82)",
                                    marginTop: 8,
                                  }}
                                >
                                  {getArchivedText(p.answered_at, p.created_at)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      </Swipeable>
                    ))}
                </View>
              )}

              {completedAffirmations.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Pressable onPress={() => setShowCompletedAffirmations(!showCompletedAffirmations)}>
                    <View
                      style={{
                        backgroundColor: "rgba(255,255,255,0.14)",
                        borderRadius: 14,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: "white",
                        }}
                      >
                        ✨ Affirmations ({completedAffirmations.length}) {showCompletedAffirmations ? "▾" : "▸"}
                      </Text>
                    </View>
                  </Pressable>

                  {showCompletedAffirmations &&
                    completedAffirmations.map((p) => (
                      <Swipeable
                        key={p.id}
                        renderRightActions={() => renderCompletedRightActions(p.id)}
                        overshootRight={false}
                      >
                        <View
                          style={{
                            backgroundColor: "rgba(255,255,255,0.14)",
                            padding: 14,
                            borderRadius: 14,
                            marginBottom: 10,
                            borderLeftWidth: 4,
                            borderLeftColor: getEntryTypeStyles(p.type).borderLeftColor,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 12,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 16, color: "white", lineHeight: 22 }}>
                                  {p.content}
                                </Text>

                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: "rgba(255,255,255,0.82)",
                                    marginTop: 8,
                                  }}
                                >
                                  {getArchivedText(p.answered_at, p.created_at)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      </Swipeable>
                    ))}
                </View>
              )}

              {completedGoals.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Pressable onPress={() => setShowCompletedGoals(!showCompletedGoals)}>
                    <View
                      style={{
                        backgroundColor: "rgba(255,255,255,0.14)",
                        borderRadius: 14,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: "white",
                        }}
                      >
                        🎯 Goals ({completedGoals.length}) {showCompletedGoals ? "▾" : "▸"}
                      </Text>
                    </View>
                  </Pressable>

                  {showCompletedGoals &&
                    completedGoals.map((p) => (
                      <Swipeable
                        key={p.id}
                        renderRightActions={() => renderCompletedRightActions(p.id)}
                        overshootRight={false}
                      >
                        <View
                          style={{
                            backgroundColor: "rgba(255,255,255,0.14)",
                            padding: 14,
                            borderRadius: 14,
                            marginBottom: 10,
                            borderLeftWidth: 4,
                            borderLeftColor: getEntryTypeStyles(p.type).borderLeftColor,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 12,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 16, color: "white", lineHeight: 22 }}>
                                  {p.content}
                                </Text>

                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: "rgba(255,255,255,0.82)",
                                    marginTop: 8,
                                  }}
                                >
                                  {getArchivedText(p.answered_at, p.created_at)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      </Swipeable>
                    ))}
                </View>
              )}

              {answeredEntries.length === 0 && (
                <View
                  style={{
                    marginTop: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      color: "rgba(255,255,255,0.9)",
                      textAlign: "center",
                    }}
                  >
                    No archived entries yet.
                  </Text>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </ImageBackground>
    </GestureHandlerRootView>
  );
}