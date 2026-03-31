import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { syncLocalNotifications } from "../lib/notifications/syncNotifications";
import { supabase } from "../lib/supabase";

type AIWriteMode = "prayer" | "affirmation" | "goal" | "reminder";
type SaveScheduleSource = "none" | "digest" | "custom";
type CustomScheduleMode = "daily_time" | "fixed_date" | "interval" | "annual_date";
type EntryIntervalUnit = "days" | "weeks" | "months" | "years";
type DigestAssignment = "none" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
type WeekdayValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type ProfileDigestSettings = {
  daily_digest_time: string | null;
  weekly_digest_day_of_week: WeekdayValue | null;
  weekly_digest_time: string | null;
};

type EntryRecord = {
  id: string;
  title: string | null;
  content: string;
  type: string | null;
  digest_assignment: DigestAssignment;
  schedule_mode: string;
  due_date: string | null;
  due_time: string | null;
  interval_value: number | null;
  interval_unit: string | null;
  annual_month: number | null;
  annual_day: number | null;
  anchor_date: string | null;
};

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayTime(time: string | null) {
  if (!time) return "Not set";

  const [hours, minutes] = time.split(":");
  const hourNum = Number(hours);
  const minuteNum = Number(minutes);

  const suffix = hourNum >= 12 ? "PM" : "AM";
  const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;

  return `${displayHour}:${String(minuteNum).padStart(2, "0")} ${suffix}`;
}

function weekdayLabel(day: WeekdayValue) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
}

function sanitizeCustomHourInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  const parsed = parseInt(digits, 10);
  if (Number.isNaN(parsed)) return "";
  return String(Math.min(12, Math.max(1, parsed)));
}

function sanitizeCustomMinuteInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  const parsed = parseInt(digits, 10);
  if (Number.isNaN(parsed)) return "";
  return String(Math.min(59, Math.max(0, parsed))).padStart(2, "0");
}

function getSuggestedTitle(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "New Entry";
  }

  const normalized = cleaned
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");

  const leadingPatterns = [
    /^lord[, ]+/i,
    /^dear lord[, ]+/i,
    /^dear god[, ]+/i,
    /^god[, ]+/i,
    /^jesus[, ]+/i,
    /^please[, ]+/i,
    /^i pray for\s+/i,
    /^prayer for\s+/i,
    /^help me\s+/i,
    /^help us\s+/i,
    /^give me\s+/i,
    /^give us\s+/i,
    /^please help me\s+/i,
    /^please help us\s+/i,
    /^i want to\s+/i,
    /^i need to\s+/i,
    /^i need\s+/i,
    /^i am praying for\s+/i,
    /^i'm praying for\s+/i,
    /^thank you for\s+/i,
    /^thank you\s+/i,
  ];

  let working = normalized;

  for (const pattern of leadingPatterns) {
    working = working.replace(pattern, "");
  }

  working = working
    .replace(/[.!?]+$/g, "")
    .replace(/^(the|a|an)\s+/i, "")
    .trim();

  if (!working) {
    working = normalized.replace(/[.!?]+$/g, "").trim();
  }

  const words = working
    .replace(/[^\w\s'-]/g, "")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) {
    return "New Entry";
  }

  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "for",
    "to",
    "of",
    "in",
    "on",
    "at",
    "with",
    "my",
    "our",
    "your",
    "his",
    "her",
    "their",
  ]);

  let selected = words.slice(0, 6);

  if (selected.length > 3) {
    while (
      selected.length > 0 &&
      stopWords.has(selected[selected.length - 1].toLowerCase())
    ) {
      selected = selected.slice(0, -1);
    }
  }

  const title = selected
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .trim();

  return title || "New Entry";
}

export default function ComposeScreen() {
   const params = useLocalSearchParams<{
    mode?: string;
    entryId?: string;
  }>();

  const inputRef = useRef<TextInput | null>(null);

  const composeMode = params.mode === "edit" ? "edit" : "create";
  const editingEntryId = typeof params.entryId === "string" ? params.entryId : null;

  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [selectedAIMode, setSelectedAIMode] = useState<AIWriteMode>("prayer");
  const [showAITypeModal, setShowAITypeModal] = useState(false);
  const [showSaveEntryModal, setShowSaveEntryModal] = useState(false);
  const [showRevertAI, setShowRevertAI] = useState(false);
  const [preAIText, setPreAIText] = useState<string | null>(null);
  const [preAITitle, setPreAITitle] = useState<string | null>(null);
  const [isAIWorking, setIsAIWorking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState(composeMode === "edit");

  const [saveScheduleSource, setSaveScheduleSource] = useState<SaveScheduleSource>("none");
  const [selectedSaveCadence, setSelectedSaveCadence] = useState<
    "daily" | "weekly" | "monthly" | "quarterly" | "yearly"
  >("daily");
  const [profileDigestSettings, setProfileDigestSettings] = useState<ProfileDigestSettings>({
    daily_digest_time: null,
    weekly_digest_day_of_week: null,
    weekly_digest_time: null,
  });
  const [customScheduleMode, setCustomScheduleMode] = useState<CustomScheduleMode>("daily_time");
  const [customScheduleTime, setCustomScheduleTime] = useState("07:00");
  const [customTimeHour, setCustomTimeHour] = useState("7");
  const [customTimeMinute, setCustomTimeMinute] = useState("00");
  const [customTimePeriod, setCustomTimePeriod] = useState<"AM" | "PM">("AM");
  const [customIntervalValue, setCustomIntervalValue] = useState("1");
  const [customIntervalUnit, setCustomIntervalUnit] = useState<EntryIntervalUnit>("weeks");
  const [customDueDate, setCustomDueDate] = useState(getLocalDateString());
  const [customAnnualMonth, setCustomAnnualMonth] = useState("1");
  const [customAnnualDay, setCustomAnnualDay] = useState("1");

  const textFadeAnim = useRef(new Animated.Value(1)).current;
  const textScaleAnim = useRef(new Animated.Value(1)).current;
  const dotAnim1 = useRef(new Animated.Value(0.35)).current;
  const dotAnim2 = useRef(new Animated.Value(0.35)).current;
  const dotAnim3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const hourNumber = parseInt(customTimeHour || "7", 10);
    const minuteValue = (customTimeMinute || "00").padStart(2, "0");
    const safeHour = Number.isFinite(hourNumber) ? hourNumber : 7;

    let hour24 = safeHour % 12;
    if (customTimePeriod === "PM") {
      hour24 += 12;
    }

    setCustomScheduleTime(`${String(hour24).padStart(2, "0")}:${minuteValue}`);
  }, [customTimeHour, customTimeMinute, customTimePeriod]);

    useEffect(() => {
     async function initialize() {
      if (composeMode === "edit" && editingEntryId) {
        await loadEntryForEdit(editingEntryId);
        return;
      }

      setIsLoadingEntry(false);
      setText("");
      setTitle("");
      setSelectedAIMode("prayer");
      setShowRevertAI(false);
      setPreAIText(null);
      setPreAITitle(null);
      setSaveScheduleSource("none");
      setSelectedSaveCadence("daily");
      setCustomScheduleMode("daily_time");
      setCustomScheduleTime("07:00");
      setCustomTimeHour("7");
      setCustomTimeMinute("00");
      setCustomTimePeriod("AM");
      setCustomIntervalValue("1");
      setCustomIntervalUnit("weeks");
      setCustomDueDate(getLocalDateString());
      setCustomAnnualMonth("1");
      setCustomAnnualDay("1");
    }

    initialize();
  }, [composeMode, editingEntryId]);

  async function loadEntryForEdit(entryId: string) {
    setIsLoadingEntry(true);

    const { data, error } = await supabase
      .from("entries")
       .select(
        "id, title, content, type, digest_assignment, schedule_mode, due_date, due_time, interval_value, interval_unit, annual_month, annual_day, anchor_date"
      )
      .eq("id", entryId)
      .single();

    setIsLoadingEntry(false);

    if (error || !data) {
      Alert.alert("Unable to load entry", error?.message ?? "Entry not found.");
      router.back();
      return;
    }

    const entry = data as EntryRecord;

    setText(entry.content ?? "");
    setTitle(entry.title?.trim() || "");
    setSelectedAIMode(
      entry.type === "affirmation" ||
        entry.type === "goal" ||
        entry.type === "reminder"
        ? entry.type
        : "prayer"
    );

     if (
      entry.digest_assignment === "daily" ||
      entry.digest_assignment === "weekly" ||
      entry.digest_assignment === "monthly" ||
      entry.digest_assignment === "quarterly" ||
      entry.digest_assignment === "yearly"
    ) {
      setSaveScheduleSource("digest");
      setSelectedSaveCadence(entry.digest_assignment);
      return;
    }

    if (
      entry.schedule_mode === "daily_time" ||
      entry.schedule_mode === "fixed_date" ||
      entry.schedule_mode === "interval" ||
      entry.schedule_mode === "annual_date"
    ) {
      setSaveScheduleSource("custom");
      setCustomScheduleMode(entry.schedule_mode);

      const baseTime = entry.due_time ? entry.due_time.slice(0, 5) : "07:00";
      const [hourRaw = "07", minuteRaw = "00"] = baseTime.split(":");
      const hour24 = parseInt(hourRaw, 10);
      const hour12 = hour24 % 12 || 12;

      setCustomScheduleTime(baseTime);
      setCustomTimeHour(String(hour12));
      setCustomTimeMinute(minuteRaw);
      setCustomTimePeriod(hour24 >= 12 ? "PM" : "AM");

      const baseDate = entry.due_date || entry.anchor_date || getLocalDateString();
      setCustomDueDate(baseDate);
      setCustomIntervalValue(entry.interval_value ? String(entry.interval_value) : "1");
      setCustomIntervalUnit(
        entry.interval_unit === "days" ||
          entry.interval_unit === "weeks" ||
          entry.interval_unit === "months" ||
          entry.interval_unit === "years"
          ? entry.interval_unit
          : "weeks"
      );
      setCustomAnnualMonth(
        entry.annual_month ? String(entry.annual_month) : baseDate.split("-")[1] || "1"
      );
      setCustomAnnualDay(
        entry.annual_day ? String(entry.annual_day) : baseDate.split("-")[2] || "1"
      );
      return;
    }

    setSaveScheduleSource("none");
  }

    function startAIDotsAnimation() {
    dotAnim1.stopAnimation();
    dotAnim2.stopAnimation();
    dotAnim3.stopAnimation();

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

  async function loadProfileDigestSettings() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load profile digest settings user error:", userError?.message);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("daily_digest_time, weekly_digest_day_of_week, weekly_digest_time")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.log("Load profile digest settings error:", error.message);
      return;
    }

    console.log("PROFILE_DIGEST_SETTINGS_LOAD", {
      userId: user.id,
      data,
    });

    setProfileDigestSettings({
      daily_digest_time: data?.daily_digest_time ?? null,
      weekly_digest_day_of_week:
        typeof data?.weekly_digest_day_of_week === "number"
          ? (data.weekly_digest_day_of_week as WeekdayValue)
          : null,
      weekly_digest_time: data?.weekly_digest_time ?? null,
    });
  }

  async function runAIHelpForType(aiType: AIWriteMode) {
    if (!text.trim() || isAIWorking) return;

    const originalTextSnapshot = text;
    const originalTitleSnapshot = title;

    setSelectedAIMode(aiType);
    setShowAITypeModal(false);
    setIsAIWorking(true);
    startAIDotsAnimation();

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke("generate-entry", {
        body: {
          mode: "write",
          aiMode: aiType,
          text,
        },
        headers: session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : {},
      });

      if (error) {
        console.log("AI help error:", error);
        Alert.alert("Could not polish entry", "Please try again.");
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
          const nextText = data.text.trim();
          const nextTitle =
            typeof data?.title === "string" && data.title.trim().length > 0
              ? data.title.trim()
              : getSuggestedTitle(nextText);

          setPreAIText(originalTextSnapshot);
          setPreAITitle(originalTitleSnapshot);
          setShowRevertAI(true);
          setText(nextText);
          setTitle(nextTitle);

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
      Alert.alert("Could not polish entry", "Please try again.");
    } finally {
      setIsAIWorking(false);
    }
  }

  function handleAIHelp() {
    if (!text.trim() || isAIWorking) return;
    setShowAITypeModal(true);
  }

   function closeCompose() {
    Keyboard.dismiss();

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace({
      pathname: "/",
      params: {
        resetHomeAt: String(Date.now()),
      },
    });
  }

    async function openSaveEntryModal() {
    if (!text.trim() || isSaving || isLoadingEntry) return;

    if (!title.trim()) {
      setTitle(getSuggestedTitle(text));
    }

    await loadProfileDigestSettings();
    setShowSaveEntryModal(true);
    Keyboard.dismiss();
  }

  function resetSaveEntryState() {
    setShowSaveEntryModal(false);

    if (composeMode === "edit") {
      return;
    }

    setSaveScheduleSource("none");
    setSelectedSaveCadence("daily");
    setCustomScheduleMode("daily_time");
    setCustomScheduleTime("07:00");
    setCustomTimeHour("7");
    setCustomTimeMinute("00");
    setCustomTimePeriod("AM");
    setCustomIntervalValue("1");
    setCustomIntervalUnit("weeks");
    setCustomDueDate(getLocalDateString());
    setCustomAnnualMonth("1");
    setCustomAnnualDay("1");
  }

  async function saveEntry() {
    if (!text.trim() || isSaving) return;

    setIsSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Not signed in", "Please sign in again.");
        return;
      }

      const titleToSave = title.trim() || getSuggestedTitle(text);

      const normalizedTime =
        customScheduleTime && /^\d{2}:\d{2}$/.test(customScheduleTime.trim())
          ? `${customScheduleTime.trim()}:00`
          : null;

      const parsedIntervalValue = parseInt(customIntervalValue, 10);
      const parsedAnnualMonth = parseInt(customAnnualMonth, 10);
      const parsedAnnualDay = parseInt(customAnnualDay, 10);
      const anchorDate = customDueDate.trim() || getLocalDateString();

       const payload: any = {
        title: titleToSave,
        content: text.trim(),
        type: selectedAIMode,
        digest_assignment: saveScheduleSource === "digest" ? selectedSaveCadence : "none",
        schedule_mode: "none",
        due_time: null,
        due_date: null,
        interval_value: null,
        interval_unit: null,
        annual_month: null,
        annual_day: null,
        anchor_date: null,
      };

      if (saveScheduleSource === "custom") {
        payload.digest_assignment = "none";
        payload.schedule_mode = customScheduleMode;

        if (customScheduleMode === "daily_time") {
          payload.due_time = normalizedTime;
        }

        if (customScheduleMode === "fixed_date") {
          if (!customDueDate.trim()) {
            Alert.alert("Choose a date", "Select a date before saving.");
            return;
          }
          payload.due_date = customDueDate.trim();
          payload.due_time = normalizedTime;
        }

        if (customScheduleMode === "interval") {
          if (!Number.isFinite(parsedIntervalValue) || parsedIntervalValue <= 0) {
            Alert.alert("Invalid interval", "Enter a valid repeat interval before saving.");
            return;
          }
          payload.interval_value = parsedIntervalValue;
          payload.interval_unit = customIntervalUnit;
          payload.anchor_date = anchorDate;
          payload.due_time = normalizedTime;
        }

        if (customScheduleMode === "annual_date") {
          if (
            !Number.isFinite(parsedAnnualMonth) ||
            parsedAnnualMonth < 1 ||
            parsedAnnualMonth > 12 ||
            !Number.isFinite(parsedAnnualDay) ||
            parsedAnnualDay < 1 ||
            parsedAnnualDay > 31
          ) {
            Alert.alert("Invalid yearly date", "Enter a valid month and day before saving.");
            return;
          }
          payload.annual_month = parsedAnnualMonth;
          payload.annual_day = parsedAnnualDay;
          payload.due_time = normalizedTime;
        }
      }

      if (composeMode === "edit" && editingEntryId) {
        const { error } = await supabase.from("entries").update(payload).eq("id", editingEntryId);

        if (error) {
          Alert.alert("Unable to save", error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("entries").insert({
          user_id: user.id,
          status: "active",
          ...payload,
        });
   
        if (error) {
          Alert.alert("Could not save entry", error.message);
          return;
        }
      }

       try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Compose notification sync error:", syncError);
      }

      setShowSaveEntryModal(false);
      setShowRevertAI(false);
      setPreAIText(null);
      setPreAITitle(null);
      setSaveScheduleSource("none");
      setSelectedSaveCadence("daily");
      setCustomScheduleMode("daily_time");
      setCustomScheduleTime("07:00");
      setCustomTimeHour("7");
      setCustomTimeMinute("00");
      setCustomTimePeriod("AM");
      setCustomIntervalValue("1");
      setCustomIntervalUnit("weeks");
      setCustomDueDate(getLocalDateString());
      setCustomAnnualMonth("1");
      setCustomAnnualDay("1");
      Keyboard.dismiss();
      closeCompose();
    } finally {
      setIsSaving(false);
    }
  }

const selectedDigestDescription = useMemo(() => {
    if (selectedSaveCadence === "daily") {
      return `Appears in the Daily Reminder at ${formatDisplayTime(
        profileDigestSettings.daily_digest_time ?? "07:00:00"
      )}`;
    }

    if (selectedSaveCadence === "weekly") {
      return `Appears in the Weekly Reminder on ${weekdayLabel(
        profileDigestSettings.weekly_digest_day_of_week ?? 0
      )} at ${formatDisplayTime(profileDigestSettings.weekly_digest_time ?? "08:00:00")}`;
    }

    if (selectedSaveCadence === "monthly") {
      return "Will appear in the Monthly Reminder when monthly reminder support is added.";
    }

    return "Will appear in the Yearly Reminder when yearly reminder support is added.";
  }, [selectedSaveCadence, profileDigestSettings]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "white" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
  <View
  style={{
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "white",
  }}
>
  <View style={{ width: 56 }} />

  <Text
    style={{
      fontSize: 20,
      fontWeight: "700",
      color: "black",
    }}
  >
    {composeMode === "edit" ? "Edit Entry" : "Journal Entry"}
  </Text>

  <Pressable
    onPress={openSaveEntryModal}
    disabled={!text.trim() || isSaving || isLoadingEntry}
    style={{
      minHeight: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: !text.trim() || isSaving || isLoadingEntry ? "#c7d2fe" : "#2e6cff",
      paddingHorizontal: 14,
    }}
  >
    <Text
      style={{
        color: "white",
        fontSize: 13,
        fontWeight: "700",
      }}
    >
      Save
    </Text>
  </Pressable>
</View>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 10,
            backgroundColor: "white",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Pressable
              onPress={handleAIHelp}
              style={{
                minHeight: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.95)",
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.08)",
                paddingHorizontal: 12,
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
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  ✨ AI help write
                </Text>
              )}
            </Pressable>

            {showRevertAI && preAIText !== null && (
              <Pressable
                onPress={() => {
                  setText(preAIText);
                  setTitle(preAITitle ?? "");
                  setShowRevertAI(false);
                  setPreAIText(null);
                  setPreAITitle(null);
                  inputRef.current?.focus();
                }}
                style={{
                  minHeight: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(245,158,11,0.14)",
                  borderWidth: 1,
                  borderColor: "rgba(245,158,11,0.25)",
                  paddingHorizontal: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: "#b45309",
                    fontWeight: "700",
                  }}
                >
                  ↺ Revert
                </Text>
              </Pressable>
            )}

            {!!text.trim() && (
              <Pressable
                onPress={() => {
                  setText("");
                  inputRef.current?.focus();
                }}
                style={{
                  minHeight: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(0,0,0,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.06)",
                  paddingHorizontal: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: "#6b7280",
                    fontWeight: "600",
                  }}
                >
                  × Clear
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 16 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor="#9ca3af"
            style={{
              borderWidth: 1,
              borderColor: "#d1d5db",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 15,
              color: "black",
              marginBottom: 12,
              backgroundColor: "white",
            }}
          />

          <Animated.View
            style={{
              flex: 1,
              opacity: textFadeAnim,
              transform: [{ scale: textScaleAnim }],
            }}
          >
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder="Write what’s on your mind… we’ll turn it into a prayer, goal, affirmation or just a reminder."
              placeholderTextColor="#9ca3af"
              multiline
              scrollEnabled
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "#d1d5db",
                borderRadius: 16,
                backgroundColor: "#fafafa",
                padding: 14,
                fontSize: 15,
                lineHeight: 22,
                color: "black",
                textAlignVertical: "top",
              }}
            />
          </Animated.View>
        </View>

        <Modal visible={showAITypeModal} transparent animationType="fade">
          <Pressable
            onPress={() => setShowAITypeModal(false)}
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.35)",
              justifyContent: "center",
              paddingHorizontal: 24,
            }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: "white",
                borderRadius: 20,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: "black",
                  marginBottom: 8,
                }}
              >
                Choose the kind of entry you want help crafting
              </Text>

              {(
                [
                  { key: "prayer", label: "Prayer" },
                  { key: "goal", label: "Goal" },
                  { key: "affirmation", label: "Affirmation" },
                  { key: "reminder", label: "Reminder" },
                ] as const
              ).map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => runAIHelpForType(option.key)}
                  style={{
                    backgroundColor: "#f8fafc",
                    borderRadius: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: "#111827",
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                onPress={() => setShowAITypeModal(false)}
                style={{
                  paddingVertical: 10,
                  marginTop: 2,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: "#6b7280",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={showSaveEntryModal} transparent animationType="slide">
          <Pressable
            onPress={resetSaveEntryState}
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
                paddingTop: 20,
                paddingHorizontal: 20,
                paddingBottom: 16,
                maxHeight: "88%",
              }}
            >
              <KeyboardAvoidingView
                style={{ flexShrink: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingBottom: isKeyboardVisible ? 140 : 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "700",
                      color: "black",
                      marginBottom: 18,
                    }}
                  >
                    Save Entry
                  </Text>

                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: "#374151",
                      marginBottom: 6,
                    }}
                  >
                    Title
                  </Text>

                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Entry title"
                    placeholderTextColor="#9ca3af"
                    style={{
                      borderWidth: 1,
                      borderColor: "#d1d5db",
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      fontSize: 15,
                      color: "black",
                      marginBottom: 18,
                      backgroundColor: "white",
                    }}
                  />

                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: "#374151",
                      marginBottom: 8,
                    }}
                  >
                    Entry Type
                  </Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 8 }}
                    style={{ marginBottom: 18 }}
                  >
                    {(
                      [
                        { key: "prayer", label: "Prayer" },
                        { key: "goal", label: "Goal" },
                        { key: "affirmation", label: "Affirmation" },
                        { key: "reminder", label: "Reminder" },
                      ] as const
                    ).map((option) => (
                      <Pressable
                        key={option.key}
                        onPress={() => setSelectedAIMode(option.key)}
                        style={{
                          marginRight: 8,
                          paddingVertical: 9,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          backgroundColor:
                            selectedAIMode === option.key ? "#2563eb" : "#eef2ff",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: selectedAIMode === option.key ? "white" : "#1e3a8a",
                          }}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: "#374151",
                      marginBottom: 8,
                    }}
                  >
                    Reminder
                  </Text>

                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                    {(
                       [
                        { key: "none", label: "None" },
                        { key: "digest", label: "Assign to Reminder" },
                        { key: "custom", label: "Custom" },
                      ] as const
                    ).map((option) => (
                      <Pressable
                        key={option.key}
                        onPress={() => {
                          setSaveScheduleSource(option.key);

                          if (option.key === "none") {
                            setSelectedSaveCadence("daily");
                          }

                          if (option.key === "digest") {
                            setSelectedSaveCadence("daily");
                          }
                        }}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          backgroundColor:
                            saveScheduleSource === option.key ? "#2563eb" : "#eef2ff",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: saveScheduleSource === option.key ? "white" : "#1e3a8a",
                          }}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                   {saveScheduleSource === "digest" ? (
                    <View
                      style={{
                        backgroundColor: "#f8fafc",
                        borderRadius: 14,
                        padding: 14,
                        marginBottom: 20,
                        borderWidth: 1,
                        borderColor: "#e5e7eb",
                        gap: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: "#334155",
                        }}
                      >
                        Reminder Assignment
                      </Text>

                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: "#475569",
                          marginBottom: 4,
                        }}
                      >
                        Choose which reminder this item belongs to by default
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          lineHeight: 20,
                          color: "#475569",
                          marginBottom: 8,
                        }}
                      >
                        {selectedDigestDescription}
                      </Text>
                      <View style={{ gap: 8 }}>
                        {(["daily", "weekly", "monthly", "quarterly", "yearly"] as const).map((cadence) => {
                          const selected = selectedSaveCadence === cadence;

                          return (
                            <Pressable
                              key={cadence}
                              onPress={() => setSelectedSaveCadence(cadence)}
                              style={{
                                borderWidth: 1,
                                borderColor: selected ? "#2563eb" : "#d1d5db",
                                borderRadius: 12,
                                paddingHorizontal: 12,
                                paddingVertical: 12,
                                backgroundColor: selected ? "#eff6ff" : "white",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight: "600",
                                  color: selected ? "#1d4ed8" : "#111827",
                                  textTransform: "capitalize",
                                }}
                              >
                                {cadence}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {saveScheduleSource === "custom" ? (
                    <View
                      style={{
                        backgroundColor: "#f8fafc",
                        borderRadius: 14,
                        padding: 14,
                        marginBottom: 20,
                        borderWidth: 1,
                        borderColor: "#e5e7eb",
                        gap: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: "#334155",
                        }}
                      >
                        Custom Reminder
                      </Text>

                      <View style={{ gap: 8 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: "#475569",
                          }}
                        >
                          Start date
                        </Text>

                        <TextInput
                          value={customDueDate}
                          onChangeText={setCustomDueDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#9ca3af"
                          style={{
                            borderWidth: 1,
                            borderColor: "#d1d5db",
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            backgroundColor: "white",
                            color: "black",
                            fontSize: 14,
                          }}
                        />
                      </View>

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
                            value={customTimeHour}
                            onChangeText={(value) => setCustomTimeHour(sanitizeCustomHourInput(value))}
                            keyboardType="number-pad"
                            placeholder="7"
                            placeholderTextColor="#9ca3af"
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
                            value={customTimeMinute}
                            onChangeText={(value) =>
                              setCustomTimeMinute(sanitizeCustomMinuteInput(value))
                            }
                            keyboardType="number-pad"
                            placeholder="00"
                            placeholderTextColor="#9ca3af"
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
                              setCustomTimePeriod((current) => (current === "AM" ? "PM" : "AM"))
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
                              {customTimePeriod}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: "#475569",
                          marginBottom: 4,
                        }}
                      >
                        Repeat
                      </Text>

                      <View style={{ gap: 8 }}>
                        {(
                          [
                            { key: "fixed_date", label: "Does not repeat" },
                            { key: "daily_time", label: "Every day" },
                            { key: "annual_date", label: "Every year" },
                            { key: "interval", label: "Custom interval" },
                          ] as const
                        ).map((option) => {
                          const selected = customScheduleMode === option.key;

                          return (
                            <Pressable
                              key={option.key}
                              onPress={() => setCustomScheduleMode(option.key)}
                              style={{
                                borderWidth: 1,
                                borderColor: selected ? "#2563eb" : "#d1d5db",
                                borderRadius: 12,
                                paddingHorizontal: 12,
                                paddingVertical: 12,
                                backgroundColor: selected ? "#eff6ff" : "white",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight: "600",
                                  color: selected ? "#1d4ed8" : "#111827",
                                }}
                              >
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {customScheduleMode === "interval" ? (
                        <View style={{ gap: 10 }}>
                          <View style={{ flexDirection: "row", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "600",
                                  color: "#475569",
                                  marginBottom: 6,
                                }}
                              >
                                Repeats every
                              </Text>
                              <TextInput
                                value={customIntervalValue}
                                onChangeText={setCustomIntervalValue}
                                keyboardType="number-pad"
                                placeholder="1"
                                placeholderTextColor="#9ca3af"
                                style={{
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
                                Unit
                              </Text>
                              <View style={{ gap: 8 }}>
                                {(["days", "weeks", "months", "years"] as const).map((unit) => {
                                  const selected = customIntervalUnit === unit;

                                  return (
                                    <Pressable
                                      key={unit}
                                      onPress={() => setCustomIntervalUnit(unit)}
                                      style={{
                                        borderWidth: 1,
                                        borderColor: selected ? "#2563eb" : "#d1d5db",
                                        borderRadius: 12,
                                        paddingHorizontal: 12,
                                        paddingVertical: 12,
                                        backgroundColor: selected ? "#eff6ff" : "white",
                                      }}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 14,
                                          fontWeight: "600",
                                          color: selected ? "#1d4ed8" : "#111827",
                                          textTransform: "capitalize",
                                        }}
                                      >
                                        {unit}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          </View>
                        </View>
                      ) : null}

                      {customScheduleMode === "annual_date" ? (
                        <View style={{ gap: 10 }}>
                          <View style={{ flexDirection: "row", gap: 10 }}>
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
                              <TextInput
                                value={customAnnualMonth}
                                onChangeText={setCustomAnnualMonth}
                                keyboardType="number-pad"
                                placeholder="1"
                                placeholderTextColor="#9ca3af"
                                style={{
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
                              <TextInput
                                value={customAnnualDay}
                                onChangeText={setCustomAnnualDay}
                                keyboardType="number-pad"
                                placeholder="1"
                                placeholderTextColor="#9ca3af"
                                style={{
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
                            </View>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  <View
                    style={{
                      flexDirection: "row",
                      gap: 10,
                      marginTop: 8,
                      paddingTop: 12,
                      paddingBottom: isKeyboardVisible ? 10 : 0,
                      backgroundColor: "white",
                    }}
                  >
                    <Pressable
                      onPress={resetSaveEntryState}
                      style={{
                        flex: 1,
                        paddingVertical: 13,
                        borderRadius: 12,
                        backgroundColor: "#f3f4f6",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: "#374151",
                        }}
                      >
                        Cancel
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={saveEntry}
                      disabled={isSaving}
                      style={{
                        flex: 1,
                        paddingVertical: 13,
                        borderRadius: 12,
                        backgroundColor: isSaving ? "#93c5fd" : "#2563eb",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: "white",
                        }}
                      >
                        {isSaving ? "Saving..." : composeMode === "edit" ? "Save Changes" : "Save"}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}