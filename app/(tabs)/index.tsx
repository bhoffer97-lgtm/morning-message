import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, ImageBackground, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";
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
        badgeBackground: "#fff4db",
        badgeText: "#b7791f",
      };
    case "affirmation":
      return {
        badgeBackground: "#f3e8ff",
        badgeText: "#7c3aed",
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
  const [message, setMessage] = useState<string | null>(null);
  const [verseRef, setVerseRef] = useState<string | null>(null);
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
  const [selectedEntryType, setSelectedEntryType] = useState("prayer");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [updatingPrayerId, setUpdatingPrayerId] = useState<string | null>(null);
  const [isSavingPrayer, setIsSavingPrayer] = useState(false);
  const [isAIWorking, setIsAIWorking] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const currentSectionY = useRef(0);
  const inputRef = useRef<TextInput | null>(null);
  const textFadeAnim = useRef(new Animated.Value(1)).current;
  const textScaleAnim = useRef(new Animated.Value(1)).current;
  const messageFadeAnim = useRef(new Animated.Value(0)).current;
  const dotAnim1 = useRef(new Animated.Value(0.35)).current;
  const dotAnim2 = useRef(new Animated.Value(0.35)).current;
  const dotAnim3 = useRef(new Animated.Value(0.35)).current;

  const [backgroundImage] = useState(
    morningImages[Math.floor(Math.random() * morningImages.length)]
  );

  const currentPrayers = activeEntries.filter((entry) => entry.type === "prayer");
  const currentGratitude = activeEntries.filter((entry) => entry.type === "gratitude");
  const currentAffirmations = activeEntries.filter((entry) => entry.type === "affirmation");
  const currentGoals = activeEntries.filter((entry) => entry.type === "goal");

  const completedPrayers = answeredPrayers.filter((entry) => entry.type === "prayer");
  const completedGratitude = answeredPrayers.filter((entry) => entry.type === "gratitude");
  const completedAffirmations = answeredPrayers.filter((entry) => entry.type === "affirmation");
  const completedGoals = answeredPrayers.filter((entry) => entry.type === "goal");

  async function loadMessage() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("No user found for daily message load");
      return false;
    }

    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("daily_messages")
      .select("message_text, verse_reference")
      .eq("user_id", user.id)
      .eq("message_date", today)
      .maybeSingle();

    console.log("daily message result:", data, error);

    if (error) {
      console.log("Daily message load error:", error.message);
      return false;
    }

if (data) {
  setMessage(data.message_text);
  setVerseRef(data.verse_reference);

  Animated.timing(messageFadeAnim, {
    toValue: 1,
    duration: 700,
    useNativeDriver: true,
  }).start();

  return true;
}

    return false;
  }
async function generateDailyMessage() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    console.log("Generating daily message...");

    const { data, error } = await supabase.functions.invoke("generate-entry", {
      body: {
        mode: "daily",
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
  setMessage(data.message);
  setVerseRef(data.verse_reference);

  Animated.timing(messageFadeAnim, {
    toValue: 1,
    duration: 700,
    useNativeDriver: true,
  }).start();
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
  const { data, error } = await supabase
    .from("bible_verses")
    .select("verse_text")
    .eq("reference", reference)
    .maybeSingle();

  if (error) {
    console.log("Verse load error:", error.message);
    return;
  }

  if (data) {
    setVerseText(data.verse_text);
    setShowVerseModal(true);
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
  setUpdatingPrayerId(id);

  const { error } = await supabase
    .from("entries")
    .update({ status: "answered", answered_at: new Date() })
    .eq("id", id);

  if (error) {
    console.log("Error marking prayer answered:", error.message);
    setUpdatingPrayerId(null);
    return;
  }

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
  minHeight: 220,
  justifyContent: "flex-end",
}}
>
<LinearGradient
  colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.45)"]}
  style={{
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  }}
>
{message ? (
  <Animated.Text
    style={{
      fontSize: 18,
      textAlign: "center",
      color: "white",
      lineHeight: 26,
      marginBottom: 10,
      fontWeight: "500",
      maxWidth: 320,
      opacity: messageFadeAnim,
    }}
  >
    {message}
  </Animated.Text>
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
    }}
  >
    Preparing your morning message…
  </Text>
)}

    <Text
    style={{
      fontSize: 13,
      color: "rgba(255,255,255,0.92)",
      marginTop: 6,
      textAlign: "center",
      letterSpacing: 0.3,
      textDecorationLine: "underline",
      fontWeight: "600",
    }}
onPress={() => {
  if (verseRef) {
    loadVerse(verseRef);
  }
}}
  >
    {verseRef ? `Read ${verseRef}` : "Read Psalm 46:10"}
  </Text>
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
<View style={{ marginBottom: 20 }}>
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


{currentPrayers.length > 0 && (
  <View style={{ marginBottom: 12 }}>
    <Pressable onPress={() => setShowCurrentPrayers(!showCurrentPrayers)}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          marginBottom: 10,
          color: "black",
        }}
      >
        Prayers ({currentPrayers.length}) {showCurrentPrayers ? "▾" : "▸"}
      </Text>
    </Pressable>

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
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
              <Text
                style={{
                  fontSize: 18,
                  marginRight: 8,
                  color: getEntryTypeStyles(p.type).badgeText,
                }}
              >
                {getEntryTypeIcon(p.type)}
              </Text>

              <Text style={{ fontSize: 16, color: "black", flex: 1 }}>
                {p.content}
              </Text>
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
        Gratitude ({currentGratitude.length}) {showCurrentGratitude ? "▾" : "▸"}
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
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
              <Text
                style={{
                  fontSize: 18,
                  marginRight: 8,
                  color: getEntryTypeStyles(p.type).badgeText,
                }}
              >
                {getEntryTypeIcon(p.type)}
              </Text>

              <Text style={{ fontSize: 16, color: "black", flex: 1 }}>
                {p.content}
              </Text>
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
        Affirmations ({currentAffirmations.length}) {showCurrentAffirmations ? "▾" : "▸"}
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
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
              <Text
                style={{
                  fontSize: 18,
                  marginRight: 8,
                  color: getEntryTypeStyles(p.type).badgeText,
                }}
              >
                {getEntryTypeIcon(p.type)}
              </Text>

              <Text style={{ fontSize: 16, color: "black", flex: 1 }}>
                {p.content}
              </Text>
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
        Goals ({currentGoals.length}) {showCurrentGoals ? "▾" : "▸"}
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
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
              <Text
                style={{
                  fontSize: 18,
                  marginRight: 8,
                  color: getEntryTypeStyles(p.type).badgeText,
                }}
              >
                {getEntryTypeIcon(p.type)}
              </Text>

              <Text style={{ fontSize: 16, color: "black", flex: 1 }}>
                {p.content}
              </Text>
            </View>
          </View>
        </Swipeable>
      ))}
  </View>
)}

{answeredPrayers.length > 0 && (
  <View style={{ marginTop: 24 }}>
    <Pressable onPress={() => setShowAnswered(!showAnswered)}>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "600",
          marginBottom: 12,
          color: "black",
        }}
      >
        Completed ({answeredPrayers.length}) {showAnswered ? "▴" : "▾"}
      </Text>
    </Pressable>

    {showAnswered && (
      <>
        {completedPrayers.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Pressable onPress={() => setShowCompletedPrayers(!showCompletedPrayers)}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  marginBottom: 10,
                  color: "black",
                }}
              >
                Prayers ({completedPrayers.length}) {showCompletedPrayers ? "▾" : "▸"}
              </Text>
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
                      backgroundColor: "#eef6ee",
                      padding: 14,
                      borderRadius: 10,
                      marginBottom: 10,
                      borderLeftWidth: 4,
                      borderLeftColor: "#6aa56a",
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
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
                        <Text
                          style={{
                            fontSize: 18,
                            marginRight: 8,
                            color: getEntryTypeStyles(p.type).badgeText,
                          }}
                        >
                          {getEntryTypeIcon(p.type)}
                        </Text>

                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, color: "black" }}>
                            {p.content}
                          </Text>

                          <Text style={{ fontSize: 11, color: "#6a6a6a", marginTop: 8 }}>
                            Answered {p.answered_at ? new Date(p.answered_at).toLocaleDateString() : ""}
                          </Text>

                          {p.answered_at && p.created_at && (() => {
                            const days = Math.ceil(
                              (new Date(p.answered_at).getTime() - new Date(p.created_at).getTime()) /
                                (1000 * 60 * 60 * 24)
                            );

                            return (
                              <Text style={{ fontSize: 11, color: "#6a6a6a" }}>
                                Answered in {days} {days === 1 ? "day" : "days"}
                              </Text>
                            );
                          })()}
                        </View>
                      </View>

                      <Pressable
                        onPress={() => restoreEntry(p.id)}
                        style={{
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            borderWidth: 2,
                            borderColor: "#6aa56a",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: 4,
                          }}
                        >
                          <Text style={{ color: "#6aa56a", fontSize: 14, fontWeight: "700" }}>
                            ↺
                          </Text>
                        </View>

                        <Text style={{ fontSize: 11, color: "#666" }}>Restore</Text>
                      </Pressable>
                    </View>
                  </View>
                </Swipeable>
              ))}
          </View>
        )}

        {completedGratitude.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Pressable onPress={() => setShowCompletedGratitude(!showCompletedGratitude)}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  marginBottom: 10,
                  color: "black",
                }}
              >
                Gratitude ({completedGratitude.length}) {showCompletedGratitude ? "▾" : "▸"}
              </Text>
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
                      backgroundColor: "#eef6ee",
                      padding: 14,
                      borderRadius: 10,
                      marginBottom: 10,
                      borderLeftWidth: 4,
                      borderLeftColor: "#6aa56a",
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
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
                        <Text
                          style={{
                            fontSize: 18,
                            marginRight: 8,
                            color: getEntryTypeStyles(p.type).badgeText,
                          }}
                        >
                          {getEntryTypeIcon(p.type)}
                        </Text>

                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, color: "black" }}>
                            {p.content}
                          </Text>

                          <Text style={{ fontSize: 11, color: "#6a6a6a", marginTop: 8 }}>
                            Archived {p.answered_at ? new Date(p.answered_at).toLocaleDateString() : ""}
                          </Text>

                          {p.answered_at && p.created_at && (() => {
                            const days = Math.ceil(
                              (new Date(p.answered_at).getTime() - new Date(p.created_at).getTime()) /
                                (1000 * 60 * 60 * 24)
                            );

                            return (
                              <Text style={{ fontSize: 11, color: "#6a6a6a" }}>
                                Thankful for {days} {days === 1 ? "day" : "days"}
                              </Text>
                            );
                          })()}
                        </View>
                      </View>
                    </View>
                  </View>
                </Swipeable>
              ))}
          </View>
        )}

        {completedAffirmations.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Pressable onPress={() => setShowCompletedAffirmations(!showCompletedAffirmations)}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  marginBottom: 10,
                  color: "black",
                }}
              >
                Affirmations ({completedAffirmations.length}) {showCompletedAffirmations ? "▾" : "▸"}
              </Text>
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
                      backgroundColor: "#eef6ee",
                      padding: 14,
                      borderRadius: 10,
                      marginBottom: 10,
                      borderLeftWidth: 4,
                      borderLeftColor: "#6aa56a",
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
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
                        <Text
                          style={{
                            fontSize: 18,
                            marginRight: 8,
                            color: getEntryTypeStyles(p.type).badgeText,
                          }}
                        >
                          {getEntryTypeIcon(p.type)}
                        </Text>

                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, color: "black" }}>
                            {p.content}
                          </Text>

                          <Text style={{ fontSize: 11, color: "#6a6a6a", marginTop: 8 }}>
                            Archived {p.answered_at ? new Date(p.answered_at).toLocaleDateString() : ""}
                          </Text>

                          {p.answered_at && p.created_at && (() => {
                            const days = Math.ceil(
                              (new Date(p.answered_at).getTime() - new Date(p.created_at).getTime()) /
                                (1000 * 60 * 60 * 24)
                            );

                            return (
                              <Text style={{ fontSize: 11, color: "#6a6a6a" }}>
                                Affirmed for {days} {days === 1 ? "day" : "days"}
                              </Text>
                            );
                          })()}
                        </View>
                      </View>
                    </View>
                  </View>
                </Swipeable>
              ))}
          </View>
        )}

        {completedGoals.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Pressable onPress={() => setShowCompletedGoals(!showCompletedGoals)}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  marginBottom: 10,
                  color: "black",
                }}
              >
                Goals ({completedGoals.length}) {showCompletedGoals ? "▾" : "▸"}
              </Text>
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
                      backgroundColor: "#eef6ee",
                      padding: 14,
                      borderRadius: 10,
                      marginBottom: 10,
                      borderLeftWidth: 4,
                      borderLeftColor: "#6aa56a",
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
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
                        <Text
                          style={{
                            fontSize: 18,
                            marginRight: 8,
                            color: getEntryTypeStyles(p.type).badgeText,
                          }}
                        >
                          {getEntryTypeIcon(p.type)}
                        </Text>

                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, color: "black" }}>
                            {p.content}
                          </Text>

                          <Text style={{ fontSize: 11, color: "#6a6a6a", marginTop: 8 }}>
                            Completed {p.answered_at ? new Date(p.answered_at).toLocaleDateString() : ""}
                          </Text>

                          {p.answered_at && p.created_at && (() => {
                            const days = Math.ceil(
                              (new Date(p.answered_at).getTime() - new Date(p.created_at).getTime()) /
                                (1000 * 60 * 60 * 24)
                            );

                            return (
                              <Text style={{ fontSize: 11, color: "#6a6a6a" }}>
                                Worked on for {days} {days === 1 ? "day" : "days"}
                              </Text>
                            );
                          })()}
                        </View>
                      </View>
                    </View>
                  </View>
                </Swipeable>
              ))}
          </View>
        )}
      </>
    )}
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
        {verseRef} (NET)
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