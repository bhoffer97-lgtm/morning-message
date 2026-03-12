import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Dimensions, ImageBackground, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const morningImages = [
  require("../../assets/images/morning-nature-1.jpg"),
  require("../../assets/images/morning-nature-2.jpg"),
  require("../../assets/images/morning-nature-3.jpg"),
  require("../../assets/images/morning-nature-4.jpg"),
];

function getEntryTypeStyles(type: string) {
  switch (type) {
    case "prayer":
      return {
        badgeBackground: "#e8f0ff",
        badgeText: "#2e6cff",
      };
    case "gratitude":
      return {
        badgeBackground: "#ffeaea",
        badgeText: "#d64545",
      };
    case "affirmation":
      return {
        badgeBackground: "#fff6cc",
        badgeText: "#d4a000",
      };
    case "goal":
      return {
        badgeBackground: "#e8f7ee",
        badgeText: "#2f855a",
      };
    default:
      return {
        badgeBackground: "#f1f1f1",
        badgeText: "#666",
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

export default function HomeScreen() {
  const [dailyMessages, setDailyMessages] = useState<any[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [verseText, setVerseText] = useState<string | null>(null);
  const [showVerseModal, setShowVerseModal] = useState(false);
  const [activeEntries, setActiveEntries] = useState<any[]>([]);
  const [answeredPrayers, setAnsweredPrayers] = useState<any[]>([]);
  const [showAnswered, setShowAnswered] = useState(false);
  const [showCurrentPrayers, setShowCurrentPrayers] = useState(true);
  const [showCurrentGratitude, setShowCurrentGratitude] = useState(true);
  const [showCurrentAffirmations, setShowCurrentAffirmations] = useState(true);
  const [showCurrentGoals, setShowCurrentGoals] = useState(true);
  const [showCompletedPrayers, setShowCompletedPrayers] = useState(false);
  const [showCompletedGratitude, setShowCompletedGratitude] = useState(false);
  const [showCompletedAffirmations, setShowCompletedAffirmations] = useState(false);
  const [showCompletedGoals, setShowCompletedGoals] = useState(false);
  const [newPrayer, setNewPrayer] = useState("");
  const [searchText, setSearchText] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedEntryType, setSelectedEntryType] = useState("prayer");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [updatingPrayerId, setUpdatingPrayerId] = useState<string | null>(null);
  const [isSavingPrayer, setIsSavingPrayer] = useState(false);
  const [isAIWorking, setIsAIWorking] = useState(false);
  const [showAnswerNoteModal, setShowAnswerNoteModal] = useState(false);
  const [answerNoteText, setAnswerNoteText] = useState("");
  const [entryToCompleteId, setEntryToCompleteId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const messageScrollRef = useRef<ScrollView | null>(null);
  const currentSectionY = useRef(0);
  const inputRef = useRef<TextInput | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const textFadeAnim = useRef(new Animated.Value(1)).current;
  const textScaleAnim = useRef(new Animated.Value(1)).current;
  const messageFadeAnim = useRef(new Animated.Value(0)).current;
  const dotAnim1 = useRef(new Animated.Value(0.35)).current;
  const dotAnim2 = useRef(new Animated.Value(0.35)).current;
  const dotAnim3 = useRef(new Animated.Value(0.35)).current;

  const [backgroundImage] = useState(
    morningImages[Math.floor(Math.random() * morningImages.length)]
  );
  const messageCardWidth = Dimensions.get("window").width - 48;

  const filteredActiveEntries = activeEntries.filter((entry) =>
    entry.content?.toLowerCase().includes(searchText.toLowerCase())
  );

  const currentPrayers = filteredActiveEntries.filter((entry) => entry.type === "prayer");
  const currentGratitude = filteredActiveEntries.filter((entry) => entry.type === "gratitude");
  const currentAffirmations = filteredActiveEntries.filter((entry) => entry.type === "affirmation");
  const currentGoals = filteredActiveEntries.filter((entry) => entry.type === "goal");

  const completedPrayers = answeredPrayers.filter((entry) => entry.type === "prayer");
  const completedGratitude = answeredPrayers.filter((entry) => entry.type === "gratitude");
  const completedAffirmations = answeredPrayers.filter((entry) => entry.type === "affirmation");
  const completedGoals = answeredPrayers.filter((entry) => entry.type === "goal");
  const currentDailyMessage = dailyMessages[currentMessageIndex] ?? null;

 async function loadMessage() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("No user found for daily message load");
    return false;
  }

  const today = new Date();
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(today.getDate() - 2);

  const todayString = today.toISOString().split("T")[0];
  const twoDaysAgoString = twoDaysAgo.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("daily_messages")
    .select("id, message_text, verse_reference, verse_query, message_date")
    .eq("user_id", user.id)
    .gte("message_date", twoDaysAgoString)
    .lte("message_date", todayString)
    .order("message_date", { ascending: false });

  console.log("daily messages result:", data, error);

  if (error) {
    console.log("Daily message load error:", error.message);
    return false;
  }

  if (data && data.length > 0) {
    setDailyMessages(
      data.map((item) => ({
        ...item,
        message: item.message_text,
      }))
    );

    setCurrentMessageIndex(0);

    requestAnimationFrame(() => {
      messageScrollRef.current?.scrollTo({
        x: 0,
        animated: false,
      });
    });

    messageFadeAnim.setValue(0);
    Animated.timing(messageFadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();

    const hasToday = data.some((item) => item.message_date === todayString);
    return hasToday;
  }

  return false;
}
async function generateDailyMessage() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    console.log("Generating daily message...");

    const { data: activeContextEntries, error: activeContextError } = await supabase
      .from("entries")
      .select("type, content")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(8);

    if (activeContextError) {
      console.log("Load active entries for daily message error:", activeContextError.message);
    }

    const { data, error } = await supabase.functions.invoke("generate-entry", {
      body: {
        mode: "daily",
        activeEntries: activeContextEntries ?? [],
      },
      headers: session?.access_token
        ? {
            Authorization: `Bearer ${session.access_token}`,
          }
        : {},
    });

    console.log("Daily message function response:", data);
    console.log("Daily message function error:", error);

    if (error) {
      console.log("Daily message generation error:", error);
      return;
    }

    if (data?.message) {
      await loadMessage();
    }
  } catch (err) {
    console.log("Unexpected daily generation error:", err);
  }
}
 async function loadPrayers() {
  const { data: activeData, error: activeError } = await supabase
    .from("entries")
    .select("id, content, type, status, answered_at, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (activeError) {
    console.log("Load active prayers error:", activeError.message);
  } else if (activeData) {
    setActiveEntries(activeData);
  }

  const { data: answeredData, error: answeredError } = await supabase
    .from("entries")
    .select("id, content, type, status, answered_at, created_at")
    .eq("status", "answered")
    .order("answered_at", { ascending: false });

  if (answeredError) {
    console.log("Load answered prayers error:", answeredError.message);
  } else if (answeredData) {
    setAnsweredPrayers(answeredData);
  }
}
async function loadVerse(reference: string) {
  console.log("Loading verse for reference:", reference);

  const { data, error } = await supabase
    .from("bible_verses")
    .select("verse_text")
    .eq("reference", reference)
    .maybeSingle();

  console.log("Verse query result:", data, error);

  if (error) {
    console.log("Verse load error:", error.message);
    return;
  }

  if (data?.verse_text) {
    setVerseText(data.verse_text);
    setShowVerseModal(true);
  } else {
    console.log("No verse found for reference:", reference);
  }
}

    const savePrayer = async (entryType: string) => {
  if (!newPrayer.trim() || isSavingPrayer) return;

  setIsSavingPrayer(true);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("No user found");
      return;
    }

const { error } = await supabase.from("entries").insert({
  user_id: user.id,
  type: entryType,
  status: "active",
  content: newPrayer.trim(),
});

if (error) {
  console.log("Error saving entry:", error);
  return;
}

setNewPrayer("");
setSelectedEntryType("prayer");
Keyboard.dismiss();
await loadPrayers();

setTimeout(() => {
  scrollViewRef.current?.scrollTo({ y: 350, animated: true });
}, 150);
  } finally {
    setIsSavingPrayer(false);
  }
};

const markEntryCompleted = async (id: string) => {
  setEntryToCompleteId(id);
  setAnswerNoteText("");
  setShowAnswerNoteModal(true);
};
const saveAnswerNote = async () => {
  if (!entryToCompleteId) return;

  setUpdatingPrayerId(entryToCompleteId);

  const { error } = await supabase
    .from("entries")
    .update({
      status: "answered",
      answered_at: new Date(),
      answer_notes: answerNoteText.trim() || null,
    })
    .eq("id", entryToCompleteId);

  if (error) {
    console.log("Error saving answer note:", error.message);
    setUpdatingPrayerId(null);
    return;
  }

  setShowAnswerNoteModal(false);
  setEntryToCompleteId(null);
  setAnswerNoteText("");

  await loadPrayers();

  setUpdatingPrayerId(null);
};
const restoreEntry = async (id: string) => {
  const { error } = await supabase
    .from("entries")
    .update({ status: "active", answered_at: null })
    .eq("id", id);

  if (error) {
    console.log("Error restoring entry:", error.message);
    return;
  }

  await loadPrayers();
};

const deleteEntry = async (id: string) => {
  const { error } = await supabase.from("entries").delete().eq("id", id);

  if (error) {
    console.log("Error deleting entry:", error.message);
    return;
  }

  await loadPrayers();
};

const confirmDeleteEntry = (id: string) => {
  Alert.alert(
    "Delete entry?",
    "This will permanently delete this entry.",
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

const renderCurrentPrayerRightActions = (id: string) => {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        marginBottom: 10,
      }}
    >
      <Pressable
        onPress={() => markEntryCompleted(id)}
        style={{
          width: 88,
          backgroundColor: "#2e6cff",
          justifyContent: "center",
          alignItems: "center",
          borderTopLeftRadius: 10,
          borderBottomLeftRadius: 10,
        }}
      >
        <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>
          Answered
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

const renderCurrentGratitudeRightActions = (id: string) => {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        marginBottom: 10,
      }}
    >
      <Pressable
        onPress={() => markEntryCompleted(id)}
        style={{
          width: 88,
          backgroundColor: "#2e6cff",
          justifyContent: "center",
          alignItems: "center",
          borderTopLeftRadius: 10,
          borderBottomLeftRadius: 10,
        }}
      >
        <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>
          Archive
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

const renderCurrentAffirmationRightActions = (id: string) => {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        marginBottom: 10,
      }}
    >
      <Pressable
        onPress={() => markEntryCompleted(id)}
        style={{
          width: 88,
          backgroundColor: "#2e6cff",
          justifyContent: "center",
          alignItems: "center",
          borderTopLeftRadius: 10,
          borderBottomLeftRadius: 10,
        }}
      >
        <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>
          Archive
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
const renderCurrentGoalRightActions = (id: string) => {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        marginBottom: 10,
      }}
    >
      <Pressable
        onPress={() => markEntryCompleted(id)}
        style={{
          width: 88,
          backgroundColor: "#2e6cff",
          justifyContent: "center",
          alignItems: "center",
          borderTopLeftRadius: 10,
          borderBottomLeftRadius: 10,
        }}
      >
        <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>
          Done
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

const handleAIHelp = async () => {
  if (isAIWorking) return;

  setIsAIWorking(true);
  startAIDotsAnimation();
  try {
const {
  data: { session },
} = await supabase.auth.getSession();

const { data, error } = await supabase.functions.invoke("generate-entry", {
  body: {
    mode: "write",
    type: selectedEntryType,
    text: newPrayer,
  },
  headers: session?.access_token
    ? {
        Authorization: `Bearer ${session.access_token}`,
      }
    : {},
});

if (error) {
  console.log("AI help error:", error);

  try {
    const errorBody = await error.context.json();
    console.log("AI help error body:", errorBody);
  } catch (readError) {
    console.log("Could not read AI help error body:", readError);
  }

  return;
}

     if (data?.text) {
  Animated.parallel([
    Animated.timing(textFadeAnim, {
      toValue: 0.4,
      duration: 200,
      useNativeDriver: true,
    }),
    Animated.timing(textScaleAnim, {
      toValue: 0.97,
      duration: 200,
      useNativeDriver: true,
    }),
  ]).start(() => {
    setNewPrayer(data.text);

    Animated.parallel([
      Animated.timing(textFadeAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(textScaleAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  });
}
  } catch (error) {
    console.log("AI help unexpected error:", error);
  }
    setIsAIWorking(false);
};
  function startAIDotsAnimation() {
  Animated.loop(
    Animated.sequence([
      Animated.parallel([
        Animated.timing(dotAnim1, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(dotAnim2, {
          toValue: 0.35,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(dotAnim3, {
          toValue: 0.35,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(dotAnim1, {
          toValue: 0.35,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(dotAnim2, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(dotAnim3, {
          toValue: 0.35,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(dotAnim1, {
          toValue: 0.35,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(dotAnim2, {
          toValue: 0.35,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(dotAnim3, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
    ])
  ).start();
}
    useEffect(() => {
    async function initialize() {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        await supabase.auth.signInAnonymously();
        console.log("Anonymous user signed in");
      }

      const foundMessage = await loadMessage();

      if (!foundMessage) {
        await generateDailyMessage();
      }

      await loadPrayers();
    }

    initialize();

// Removed auto-focus so the screen does not jump on app open.
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPrayers();
    }, [])
  );
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
<ScrollView
  ref={scrollViewRef}
  keyboardShouldPersistTaps="handled"
  contentContainerStyle={{
    padding: 24,
    flexGrow: 1,
  }}
>

 <ImageBackground
  source={backgroundImage}
  imageStyle={{ borderRadius: 16 }}
  style={{
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    minHeight: 240,
    justifyContent: "flex-end",
  }}
>
  <LinearGradient
    colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.45)"]}
    style={{
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 18,
    }}
  >
    {dailyMessages.length > 0 ? (
      <>
        <ScrollView
          ref={messageScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const screenWidth = event.nativeEvent.layoutMeasurement.width;
            const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
            setCurrentMessageIndex(index);
          }}
          style={{ width: "100%" }}
          contentContainerStyle={{ alignItems: "stretch" }}
        >
          {dailyMessages.map((item, index) => (
            <View
              key={item.id ?? `${item.message_date}-${index}`}
              style={{
              width: messageCardWidth,
              paddingHorizontal: 18,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
              <Animated.Text
                style={{
                  fontSize: 18,
                  textAlign: "center",
                  color: "white",
                  lineHeight: 26,
                  marginBottom: 10,
                  fontWeight: "500",
                  opacity: messageFadeAnim,
                }}
              >
                {item.message}
              </Animated.Text>

              <Text
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.78)",
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                {new Date(item.message_date).toLocaleDateString()}
              </Text>

              <Pressable
  hitSlop={12}
  onPress={() => {
    if (item.verse_reference) {
      loadVerse(item.verse_reference);
    }
  }}
  style={{
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  }}
>
  <Text
    style={{
      fontSize: 13,
      color: "rgba(255,255,255,0.92)",
      textAlign: "center",
      letterSpacing: 0.3,
      textDecorationLine: "underline",
      fontWeight: "600",
    }}
  >
    {item.verse_reference ? `Read ${item.verse_reference}` : " "}
  </Text>
</Pressable>
            </View>
          ))}
        </ScrollView>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 10,
            gap: 8,
          }}
        >
          {dailyMessages.map((_, index) => (
            <View
              key={index}
              style={{
                width: index === currentMessageIndex ? 18 : 7,
                height: 7,
                borderRadius: 999,
                backgroundColor:
                  index === currentMessageIndex
                    ? "rgba(255,255,255,0.95)"
                    : "rgba(255,255,255,0.45)",
              }}
            />
          ))}
        </View>
      </>
    ) : (
      <Text
        style={{
          fontSize: 18,
          textAlign: "center",
          color: "white",
          lineHeight: 26,
          marginBottom: 10,
          fontWeight: "500",
          maxWidth: 320,
          opacity: 0.7,
          paddingHorizontal: 18,
        }}
      >
        Preparing your morning message…
      </Text>
    )}
  </LinearGradient>
</ImageBackground>
 
 <Animated.View
  style={{
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    marginBottom: 16,
    backgroundColor: "white",
    opacity: textFadeAnim,
    transform: [{ scale: textScaleAnim }],
  }}
>
  <TextInput
    ref={inputRef}
    placeholder="Write what’s on your mind… we’ll turn it into a prayer, goal, or affirmation."
    value={newPrayer}
    onChangeText={setNewPrayer}
    onFocus={() => {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 260, animated: true });
      }, 250);
    }}
    multiline
    style={{
      padding: 12,
      paddingRight: 40,
      minHeight: 100,
      textAlignVertical: "top",
    }}
  />

  <Pressable
    onPress={handleAIHelp}
    style={{
      position: "absolute",
      right: 10,
      top: 10,
      padding: 6,
    }}
  >
{isAIWorking ? (
  <View style={{ flexDirection: "row", gap: 3 }}>
    <Animated.View
      style={{
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: "#2e6cff",
        opacity: dotAnim1,
      }}
    />
    <Animated.View
      style={{
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: "#2e6cff",
        opacity: dotAnim2,
      }}
    />
    <Animated.View
      style={{
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: "#2e6cff",
        opacity: dotAnim3,
      }}
    />
  </View>
) : (
  <Text style={{ fontSize: 16 }}>✨</Text>
)}
  </Pressable>
</Animated.View>
<View style={{ marginBottom: 14 }}>
  <Pressable
    disabled={!newPrayer.trim() || isSavingPrayer}
    onPress={() => setShowTypePicker(true)}
    style={{
      backgroundColor: !newPrayer.trim() || isSavingPrayer ? "#bfc8d8" : "#2e6cff",
      borderRadius: 10,
      paddingVertical: 14,
      opacity: isSavingPrayer ? 0.7 : 1,
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
      {isSavingPrayer ? "Saving..." : "Save"}
    </Text>
  </Pressable>
</View>

{showSearch && (
  <View style={{ marginBottom: 20 }}>
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ flex: 1, marginRight: 8 }}>
        <TextInput
          ref={searchInputRef}
          placeholder="Search entries..."
          value={searchText}
          onChangeText={setSearchText}
          onFocus={() => {
            setTimeout(() => {
              scrollViewRef.current?.scrollTo({ y: 260, animated: true });
            }, 250);
          }}
          style={{
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: "#d8d8d8",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 12,
            fontSize: 15,
            color: "black",
          }}
        />
      </View>

      <Pressable
        onPress={() => {
          setShowSearch(false);
          setSearchText("");
          Keyboard.dismiss();
        }}
        style={{
          paddingHorizontal: 8,
          paddingVertical: 8,
        }}
      >
        <Text style={{ fontSize: 14, color: "#666" }}>Close</Text>
      </Pressable>
    </View>
  </View>
)}


{currentPrayers.length > 0 && (
<View style={{ marginTop: 10, marginBottom: 12 }}>
    <View
  style={{
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  }}
>
  <Pressable onPress={() => setShowCurrentPrayers(!showCurrentPrayers)}>
    <Text
      style={{
        fontSize: 16,
        fontWeight: "600",
        color: "black",
      }}
    >
      🙏 Prayers ({currentPrayers.length}) {showCurrentPrayers ? "▾" : "▸"}
    </Text>
  </Pressable>

  {!showSearch && (
    <Pressable onPress={() => setShowSearch(true)}>
      <Text style={{ fontSize: 14, color: "#666" }}>Search</Text>
    </Pressable>
  )}
</View>

    {showCurrentPrayers &&
      currentPrayers.map((p) => (
                <Swipeable
          key={p.id}
          renderRightActions={() => renderCurrentPrayerRightActions(p.id)}
          overshootRight={false}
        >
          <View
            style={{
              backgroundColor: "#f7f7f7",
              padding: 14,
              borderRadius: 10,
              marginBottom: 10,
              borderLeftWidth: 4,
              borderLeftColor: getEntryTypeStyles(p.type).badgeText,
            }}
          >
            <View style={{ flex: 1 }}>
               <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: "black" }}>
                  {p.content}
                </Text>

                <Text style={{ fontSize: 11, color: "#6a6a6a", marginTop: 8 }}>
                  Added {p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}
                </Text>
              </View>
            </View>
          </View>
        </Swipeable>
      ))}
  </View>
)}

{currentGratitude.length > 0 && (
  <View style={{ marginBottom: 12 }}>
    <Pressable onPress={() => setShowCurrentGratitude(!showCurrentGratitude)}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          marginBottom: 10,
          color: "black",
        }}
      >
        ❤️ Gratitude ({currentGratitude.length}) {showCurrentGratitude ? "▾" : "▸"}
      </Text>
    </Pressable>

    {showCurrentGratitude &&
      currentGratitude.map((p) => (
        <Swipeable
          key={p.id}
          renderRightActions={() => renderCurrentGratitudeRightActions(p.id)}
          overshootRight={false}
        >
          <View
              style={{
                backgroundColor: "#f7f7f7",
                padding: 14,
                borderRadius: 10,
                marginBottom: 10,
                borderLeftWidth: 4,
                borderLeftColor: getEntryTypeStyles(p.type).badgeText,
              }}
          >
            <View style={{ flex: 1 }}>
               <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: "black" }}>
                  {p.content}
                </Text>

                <Text style={{ fontSize: 11, color: "#6a6a6a", marginTop: 8 }}>
                  Added {p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}
                </Text>
              </View>
            </View>
          </View>
        </Swipeable>
      ))}
  </View>
)}

{currentAffirmations.length > 0 && (
  <View style={{ marginBottom: 12 }}>
    <Pressable onPress={() => setShowCurrentAffirmations(!showCurrentAffirmations)}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          marginBottom: 10,
          color: "black",
        }}
      >
        ✨ Affirmations ({currentAffirmations.length}) {showCurrentAffirmations ? "▾" : "▸"}
      </Text>
    </Pressable>

    {showCurrentAffirmations &&
      currentAffirmations.map((p) => (
        <Swipeable
          key={p.id}
          renderRightActions={() => renderCurrentAffirmationRightActions(p.id)}
          overshootRight={false}
        >
          <View
              style={{
                backgroundColor: "#f7f7f7",
                padding: 14,
                borderRadius: 10,
                marginBottom: 10,
                borderLeftWidth: 4,
                borderLeftColor: getEntryTypeStyles(p.type).badgeText,
              }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: "black" }}>
                  {p.content}
                </Text>

                <Text style={{ fontSize: 11, color: "#6a6a6a", marginTop: 8 }}>
                  Added {p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}
                </Text>
              </View>
            </View>
          </View>
        </Swipeable>
      ))}
  </View>
)}

{currentGoals.length > 0 && (
  <View style={{ marginBottom: 12 }}>
    <Pressable onPress={() => setShowCurrentGoals(!showCurrentGoals)}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          marginBottom: 10,
          color: "black",
        }}
      >
        🎯 Goals ({currentGoals.length}) {showCurrentGoals ? "▾" : "▸"}
      </Text>
    </Pressable>

    {showCurrentGoals &&
      currentGoals.map((p) => (
                <Swipeable
          key={p.id}
          renderRightActions={() => renderCurrentGoalRightActions(p.id)}
          overshootRight={false}
        >
          <View
            style={{
              backgroundColor: "#f7f7f7",
              padding: 14,
              borderRadius: 10,
              marginBottom: 10,
              borderLeftWidth: 4,
              borderLeftColor: getEntryTypeStyles(p.type).badgeText,
            }}
          >
            <View style={{ flex: 1 }}>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: "black" }}>
                  {p.content}
                </Text>

                <Text style={{ fontSize: 11, color: "#6a6a6a", marginTop: 8 }}>
                  Added {p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}
                </Text>
              </View>
            </View>
          </View>
        </Swipeable>
      ))}
  </View>
)}

</ScrollView>
</TouchableWithoutFeedback>
</KeyboardAvoidingView>
<Modal
  visible={showTypePicker}
  transparent
  animationType="slide"
>
  <Pressable
    onPress={() => setShowTypePicker(false)}
    style={{
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.35)",
  justifyContent: "flex-end",
}}
  >
    <Pressable
      onPress={() => {}}
style={{
  backgroundColor: "white",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  padding: 20,
  paddingBottom: 32,
}}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: "600",
          marginBottom: 16,
          textAlign: "center",
        }}
      >
        What kind of entry is this?
      </Text>

      {["prayer", "gratitude", "affirmation", "goal"].map((type) => (
        <Pressable
          key={type}
                    onPress={async () => {
            setSelectedEntryType(type);
            setShowTypePicker(false);
            await savePrayer(type);
          }}
          style={{
            paddingVertical: 14,
            borderRadius: 10,
            backgroundColor: "#eef3ff",
            marginBottom: 8,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 15,
              color: "#2e6cff",
              fontWeight: "600",
              textTransform: "capitalize",
            }}
          >
            {type}
          </Text>
        </Pressable>
      ))}
    </Pressable>
  </Pressable>
</Modal>
<Modal
  visible={showAnswerNoteModal}
  transparent
  animationType="slide"
>
  <Pressable
    onPress={() => {
      setShowAnswerNoteModal(false);
      setEntryToCompleteId(null);
      setAnswerNoteText("");
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
        backgroundColor: "white",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: 18,
      }}
    >
      <TextInput
        placeholder="Add a note for future reference..."
        placeholderTextColor="#888"
        value={answerNoteText}
        onChangeText={setAnswerNoteText}
        multiline
        style={{
          borderWidth: 1,
          borderColor: "#d6d6d6",
          borderRadius: 10,
          padding: 14,
          minHeight: 125,
          textAlignVertical: "top",
          marginBottom: 16,
        }}
      />

      <View>
        <Pressable
          onPress={saveAnswerNote}
          style={{
            backgroundColor: "#2e6cff",
            borderRadius: 10,
            paddingVertical: 14,
            marginBottom: 10,
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
            Save
          </Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            if (!entryToCompleteId) return;

            await supabase
              .from("entries")
              .update({
                status: "answered",
                answered_at: new Date(),
              })
              .eq("id", entryToCompleteId);

            setShowAnswerNoteModal(false);
            setEntryToCompleteId(null);
            setAnswerNoteText("");
            await loadPrayers();
          }}
          style={{ paddingVertical: 8 }}
        >
          <Text
            style={{
              textAlign: "center",
              color: "#666",
              fontSize: 14,
            }}
          >
            Skip
          </Text>
        </Pressable>
      </View>
    </Pressable>
  </Pressable>
</Modal>
<Modal
  visible={showVerseModal}
  transparent
  animationType="slide"
>
  <Pressable
    onPress={() => setShowVerseModal(false)}
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "flex-end",
    }}
  >
    <Pressable
      onPress={() => {}}
      style={{
        backgroundColor: "white",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: 40,
      }}
    >
            <Text
        style={{
          fontSize: 18,
          fontWeight: "600",
          marginBottom: 12,
        }}
      >
        {currentDailyMessage?.verse_reference ? `${currentDailyMessage.verse_reference} (NET)` : "Verse (NET)"}
      </Text>

      <Text
        style={{
          fontSize: 16,
          lineHeight: 24,
          marginBottom: 20,
        }}
      >
        {verseText}
      </Text>

      <Text
        style={{
          fontSize: 11,
          color: "#777",
        }}
      >
        NET Bible® copyright ©1996–2019 Biblical Studies Press.
      </Text>
    </Pressable>
  </Pressable>
</Modal>
</SafeAreaView>
  </GestureHandlerRootView>
);
}