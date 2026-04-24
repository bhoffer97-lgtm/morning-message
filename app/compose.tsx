import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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
type TimePeriod = "AM" | "PM";

type ReminderScheduleRow = {
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  is_enabled: boolean;
  anchor_date: string;
  time_of_day: string;
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

function parseTimeForForm(time: string | null, fallback = "07:00") {
  const safeTime = time && time.includes(":") ? time : fallback;
  const [hours, minutes] = safeTime.split(":");
  const hourNum = Number(hours);
  const minuteNum = Number(minutes);

  const period: TimePeriod = hourNum >= 12 ? "PM" : "AM";
  const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;

  return {
    hour: String(hour12),
    minute: String(minuteNum).padStart(2, "0"),
    period,
  };
}

function build24HourTime(hour: string, minute: string, period: TimePeriod) {
  const cleanHour = Math.min(12, Math.max(1, Number(hour) || 12));
  const cleanMinute = Math.min(59, Math.max(0, Number(minute) || 0));

  let hour24 = cleanHour % 12;
  if (period === "PM") {
    hour24 += 12;
  }

  return `${String(hour24).padStart(2, "0")}:${String(cleanMinute).padStart(2, "0")}`;
}

function sanitizeCustomHourInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  const parsed = parseInt(digits, 10);
  if (Number.isNaN(parsed)) return "";
  return String(Math.min(12, Math.max(1, parsed)));
}

function sanitizeCustomMinuteInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 2);
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

function formatShortInputDate(dateString: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

function getCustomScheduleSummary(
  customScheduleMode: CustomScheduleMode,
  customScheduleTime: string,
  customDueDate: string,
  customIntervalValue: string,
  customIntervalUnit: EntryIntervalUnit
) {
  const timeText = formatDisplayTime(`${customScheduleTime}:00`);
  const dateText = formatShortInputDate(customDueDate);

  if (customScheduleMode === "fixed_date") {
    return `${dateText} at ${timeText}`;
  }

  const repeatValue = Math.max(1, parseInt(customIntervalValue, 10) || 1);
  const repeatUnit =
    repeatValue === 1 ? customIntervalUnit.replace(/s$/, "") : customIntervalUnit;

  return `Every ${repeatValue} ${repeatUnit} at ${timeText} starting ${dateText}`;
}

function getAIModeDisplayLabel(mode: AIWriteMode) {
  if (mode === "prayer") return "Prayer";
  if (mode === "affirmation") return "Affirmation";
  if (mode === "goal") return "Goal";
  return "Reminder";
}

const composeBackground = require("../assets/images/morning-nature-1.jpg");

export default function ComposeScreen() {
  const params = useLocalSearchParams<{
    mode?: string;
    entryId?: string;
    returnTo?: string;
    reminderEntryId?: string;
  }>();

const inputRef = useRef<TextInput | null>(null);
const { height: screenHeight } = useWindowDimensions();
const composeScrollRef = useRef<ScrollView | null>(null);
const journalCardYRef = useRef(0);

  const composeMode = params.mode === "edit" ? "edit" : "create";
  const editingEntryId = typeof params.entryId === "string" ? params.entryId : null;
  const shouldReturnToReminderDetail =
    composeMode === "edit" &&
    params.returnTo === "reminders" &&
    typeof params.reminderEntryId === "string";
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [selectedAIMode, setSelectedAIMode] = useState<AIWriteMode>("reminder");
  const [showAITypeModal, setShowAITypeModal] = useState(composeMode === "create");
  const [hasSelectedEntryType, setHasSelectedEntryType] = useState(composeMode === "edit");
  const [showTitleSaveModal, setShowTitleSaveModal] = useState(false);
  const [showCustomSetupModal, setShowCustomSetupModal] = useState(false);
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
  const [showCadencePicker, setShowCadencePicker] = useState(false);
  const [reminderSchedules, setReminderSchedules] = useState<ReminderScheduleRow[]>([]);
   const [customScheduleMode, setCustomScheduleMode] =
    useState<CustomScheduleMode>("interval");
  const [customScheduleTime, setCustomScheduleTime] = useState("07:00");
  const [customTimeHour, setCustomTimeHour] = useState("7");
  const [customTimeMinute, setCustomTimeMinute] = useState("00");
  const [customTimePeriod, setCustomTimePeriod] = useState<TimePeriod>("AM");
  const [showCustomTimeModal, setShowCustomTimeModal] = useState(false);
  const [draftCustomTimeHour, setDraftCustomTimeHour] = useState("7");
  const [draftCustomTimeMinute, setDraftCustomTimeMinute] = useState("00");
  const [customIntervalValue, setCustomIntervalValue] = useState("1");
  const [customIntervalUnit, setCustomIntervalUnit] = useState<EntryIntervalUnit>("days");
  const [customDueDate, setCustomDueDate] = useState(getLocalDateString());
  const [customAnnualMonth, setCustomAnnualMonth] = useState("1");
  const [customAnnualDay, setCustomAnnualDay] = useState("1");

  const textFadeAnim = useRef(new Animated.Value(1)).current;
  const textScaleAnim = useRef(new Animated.Value(1)).current;
  const dotAnim1 = useRef(new Animated.Value(0.35)).current;
  const dotAnim2 = useRef(new Animated.Value(0.35)).current;
  const dotAnim3 = useRef(new Animated.Value(0.35)).current;

useEffect(() => {
  if (composeMode === "create") {
    return;
  }

  const timer = setTimeout(() => {
    inputRef.current?.focus();
  }, 120);

  return () => clearTimeout(timer);
}, [composeMode]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

  const showSub = Keyboard.addListener(showEvent, () => {
  setIsKeyboardVisible(true);

  setTimeout(() => {
    if (inputRef.current?.isFocused()) {
      liftJournalCard();
    }
  }, 120);
});

const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

   useEffect(() => {
    async function initialize() {
      await loadProfileDigestSettings();

      if (composeMode === "edit" && editingEntryId) {
        setHasSelectedEntryType(true);
        setShowAITypeModal(false);
        await loadEntryForEdit(editingEntryId);
        return;
      }

      setIsLoadingEntry(false);
      setText("");
      setTitle("");
      setSelectedAIMode("reminder");
      setHasSelectedEntryType(false);
      setShowAITypeModal(true);
      setShowRevertAI(false);
      setPreAIText(null);
      setPreAITitle(null);
      setSaveScheduleSource("none");
      setSelectedSaveCadence("daily");
      setShowCadencePicker(false);
      setCustomScheduleMode("interval");
      setCustomScheduleTime("07:00");
      setCustomTimeHour("7");
      setCustomTimeMinute("00");
      setCustomTimePeriod("AM");
      setCustomIntervalValue("1");
      setCustomIntervalUnit("days");
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
        : "reminder"
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
      setShowCadencePicker(false);
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
      const form = parseTimeForForm(baseTime);

      setCustomScheduleTime(baseTime);
      setCustomTimeHour(form.hour);
      setCustomTimeMinute(form.minute);
      setCustomTimePeriod(form.period);

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

    function openCustomTimeEditor() {
    const form = parseTimeForForm(customScheduleTime);
    setCustomTimeHour(form.hour);
    setCustomTimeMinute(form.minute);
    setCustomTimePeriod(form.period);
    setDraftCustomTimeHour(form.hour);
    setDraftCustomTimeMinute(form.minute);
    setShowCustomTimeModal(true);
  }

    async function loadProfileDigestSettings() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("Load reminder schedules in compose user error:", userError?.message);
      return;
    }

    const { error: ensureError } = await supabase.rpc(
      "ensure_default_reminder_schedules",
      {
        p_user_id: user.id,
      }
    );

    if (ensureError) {
      console.log("Ensure default reminder schedules in compose error:", ensureError.message);
      return;
    }

    const { data, error } = await supabase
      .from("reminder_schedules")
      .select("cadence, is_enabled, anchor_date, time_of_day")
      .eq("user_id", user.id);

    if (error) {
      console.log("Load reminder schedules in compose error:", error.message);
      return;
    }

    setReminderSchedules((data as ReminderScheduleRow[]) ?? []);
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

function chooseEntryType(aiType: AIWriteMode) {
  setSelectedAIMode(aiType);
  setHasSelectedEntryType(true);
  setShowAITypeModal(false);

  setTimeout(() => {
    inputRef.current?.focus();
    liftJournalCard();
  }, Platform.OS === "ios" ? 180 : 220);
}

function closeEntryTypePicker() {
  if (!hasSelectedEntryType && composeMode === "create" && !text.trim()) {
    closeCompose();
    return;
  }

  setShowAITypeModal(false);
}

function handleAIHelp() {
  if (!text.trim() || isAIWorking) return;
  runAIHelpForType(selectedAIMode);
}
function liftJournalCard() {
  requestAnimationFrame(() => {
    composeScrollRef.current?.scrollTo({
      y: Math.max(0, journalCardYRef.current - 10),
      animated: true,
    });
  });
}

function handleEntryTextChange(value: string) {
  const wasEmpty = text.trim().length === 0;
  setText(value);

  if (wasEmpty && value.trim().length > 0) {
    setTimeout(liftJournalCard, 40);
  }
}
   function closeCompose() {
    Keyboard.dismiss();

    if (shouldReturnToReminderDetail && params.reminderEntryId) {
      router.replace({
        pathname: "/reminders",
        params: {
          returnTo: "reminders",
          reminderEntryId: params.reminderEntryId,
          editReturnAt: String(Date.now()),
        },
      });
      return;
    }

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

    const suggestedTitle = title.trim() || getSuggestedTitle(text);
    if (!title.trim()) {
      setTitle(suggestedTitle);
    }

    await loadProfileDigestSettings();
    Keyboard.dismiss();
    setShowTitleSaveModal(true);
  }

   function openCustomSetup() {
    const form = parseTimeForForm(customScheduleTime);

    setSaveScheduleSource("custom");
    setCustomTimeHour(form.hour);
    setCustomTimeMinute(form.minute);
    setCustomTimePeriod(form.period);

    if (customScheduleMode !== "fixed_date" && customScheduleMode !== "interval") {
      setCustomScheduleMode("fixed_date");
    }

    setShowCustomSetupModal(true);
    Keyboard.dismiss();
  }
   function resetSaveEntryState() {
    setShowTitleSaveModal(false);
    setShowCustomSetupModal(false);
    setShowCustomTimeModal(false);

    if (composeMode === "edit") {
      return;
    }

    setSaveScheduleSource("none");
    setSelectedSaveCadence("daily");
    setCustomScheduleMode("interval");
    setCustomScheduleTime("07:00");
    setCustomTimeHour("7");
    setCustomTimeMinute("00");
    setCustomTimePeriod("AM");
    setCustomIntervalValue("1");
    setCustomIntervalUnit("days");
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

      setShowTitleSaveModal(false);
      setShowCustomSetupModal(false);
      setShowCustomTimeModal(false);
      setShowRevertAI(false);
      setPreAIText(null);
      setPreAITitle(null);
      setSaveScheduleSource("none");
      setSelectedSaveCadence("daily");
      setCustomScheduleMode("interval");
      setCustomScheduleTime("07:00");
      setCustomTimeHour("7");
      setCustomTimeMinute("00");
      setCustomTimePeriod("AM");
      setCustomIntervalValue("1");
      setCustomIntervalUnit("days");
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
    const selectedSchedule =
      reminderSchedules.find((item) => item.cadence === selectedSaveCadence) ?? null;

    if (!selectedSchedule) {
      if (selectedSaveCadence === "daily") return "Daily Reminder";
      if (selectedSaveCadence === "weekly") return "Weekly Reminder";
      if (selectedSaveCadence === "monthly") return "Monthly Reminder";
      if (selectedSaveCadence === "quarterly") return "Quarterly Reminder";
      return "Yearly Reminder";
    }

    const timeLabel = formatDisplayTime(selectedSchedule.time_of_day);

    if (selectedSaveCadence === "daily") {
      return `Daily Reminder occurs at ${timeLabel}`;
    }

    if (selectedSaveCadence === "weekly") {
      const weeklyAnchorDay = selectedSchedule.anchor_date
        ? new Date(`${selectedSchedule.anchor_date}T00:00:00`).toLocaleDateString([], {
            weekday: "long",
          })
        : "Sunday";

      return `Weekly Reminder occurs on ${weeklyAnchorDay} at ${timeLabel}`;
    }

    if (selectedSaveCadence === "monthly") {
      const monthlyDay = selectedSchedule.anchor_date
        ? new Date(`${selectedSchedule.anchor_date}T00:00:00`).getDate()
        : 1;

      const mod10 = monthlyDay % 10;
      const mod100 = monthlyDay % 100;
      const ordinal =
        mod10 === 1 && mod100 !== 11
          ? `${monthlyDay}st`
          : mod10 === 2 && mod100 !== 12
          ? `${monthlyDay}nd`
          : mod10 === 3 && mod100 !== 13
          ? `${monthlyDay}rd`
          : `${monthlyDay}th`;

      return `Monthly Reminder occurs on the ${ordinal} at ${timeLabel}`;
    }

    const recurringDate = selectedSchedule.anchor_date
      ? new Date(`${selectedSchedule.anchor_date}T00:00:00`)
      : new Date("2026-01-01T00:00:00");

    const monthDay = recurringDate.toLocaleDateString([], {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    });

    if (selectedSaveCadence === "quarterly") {
      return `Quarterly Reminder occurs on ${monthDay} at ${timeLabel}`;
    }

    return `Yearly Reminder occurs on ${monthDay} at ${timeLabel}`;
  }, [selectedSaveCadence, reminderSchedules]);

const journalInputMinHeight = isKeyboardVisible
  ? 360
  : Math.max(460, screenHeight - 330);

    return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <ImageBackground source={composeBackground} resizeMode="cover" style={{ flex: 1 }}>
        <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1 }}>
          <LinearGradient
            pointerEvents="none"
            colors={[
              "rgba(255,255,255,0.10)",
              "rgba(255,255,255,0.24)",
              "rgba(255,255,255,0.54)",
            ]}
            style={StyleSheet.absoluteFillObject}
          />

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 44,
              paddingBottom: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Pressable
                onPress={closeCompose}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                style={{
                  width: 92,
                  minHeight: 52,
                  justifyContent: "center",
                  alignItems: "flex-start",
                }}
              >
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "700",
                    color: "white",
                    textShadowColor: "rgba(0,0,0,0.38)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 5,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setShowAITypeModal(true)}
                hitSlop={10}
                style={{
                  minHeight: 38,
                  borderRadius: 19,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(250,246,236,0.92)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.62)",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "800",
                    color: "#8b6f47",
                  }}
                >
                  {getAIModeDisplayLabel(selectedAIMode)} ▼
                </Text>
              </Pressable>

              <Pressable
                onPress={openSaveEntryModal}
                disabled={!text.trim() || isSaving || isLoadingEntry}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                style={{
                  width: 92,
                  minHeight: 52,
                  justifyContent: "center",
                  alignItems: "flex-end",
                  opacity: !text.trim() || isSaving || isLoadingEntry ? 0.42 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "800",
                    color: "white",
                    textShadowColor: "rgba(0,0,0,0.38)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 5,
                  }}
                >
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
              <ScrollView
              ref={composeScrollRef}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: 12,
                paddingTop: 0,
                paddingBottom: isKeyboardVisible ? 220 : 24,
              }}
            >
              <View style={{ height: 4 }} />

              <View
                onLayout={(event) => {
                  journalCardYRef.current = event.nativeEvent.layout.y;
                }}
                style={{
                  backgroundColor: "rgba(250,246,236,0.95)",
                  borderRadius: 28,
                  paddingHorizontal: 18,
                  paddingTop: 18,
                  paddingBottom: 18,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.72)",
                  shadowColor: "#000",
                  shadowOpacity: 0.12,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 6,
                }}
              >
              <View
              style={{
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  letterSpacing: 0.5,
                  color: "#8b6f47",
                  marginBottom: 10,
                }}
              >
                Write what's on your mind...
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
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
                      minHeight: 42,
                      borderRadius: 21,
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
                        fontWeight: "800",
                      }}
                    >
                      ↺ Revert
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={handleAIHelp}
                  disabled={!text.trim() || isAIWorking}
                  hitSlop={8}
                  style={{
                    minHeight: 46,
                    borderRadius: 23,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: text.trim()
                      ? "#8b6f47"
                      : "rgba(139,111,71,0.22)",
                    borderWidth: 1,
                    borderColor: text.trim()
                      ? "rgba(78,59,39,0.35)"
                      : "rgba(139,111,71,0.22)",
                    paddingHorizontal: 18,
                    shadowColor: "#000",
                    shadowOpacity: text.trim() ? 0.12 : 0,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: text.trim() ? 3 : 0,
                    opacity: !text.trim() ? 0.75 : 1,
                  }}
                >
                  {isAIWorking ? (
                    <View style={{ flexDirection: "row", gap: 3 }}>
                      <Animated.View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#fffaf2",
                          opacity: dotAnim1,
                        }}
                      />
                      <Animated.View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#fffaf2",
                          opacity: dotAnim2,
                        }}
                      />
                      <Animated.View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#fffaf2",
                          opacity: dotAnim3,
                        }}
                      />
                    </View>
                  ) : (
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: text.trim() ? "#fffaf2" : "#8b6f47",
                      }}
                    >
                      ✨ AI Help Write
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>

                <Animated.View
                  style={{
                    minHeight: journalInputMinHeight,
                    opacity: textFadeAnim,
                    transform: [{ scale: textScaleAnim }],
                  }}
                >
                  <View style={{ position: "relative", flex: 1 }}>
                    <TextInput
                      ref={inputRef}
                      value={text}
                      onChangeText={handleEntryTextChange}
                      onFocus={() => {
                        setTimeout(liftJournalCard, 80);
                      }}
                      placeholder="Begin typing…"
                      placeholderTextColor="#9ca3af"
                      multiline
                      scrollEnabled
                      style={{
                        minHeight: journalInputMinHeight,
                        borderWidth: 0,
                        backgroundColor: "transparent",
                        paddingTop: 10,
                        paddingBottom: 14,
                        paddingLeft: 2,
                        paddingRight: text.trim() ? 38 : 2,
                        fontSize: 18,
                        lineHeight: 30,
                        color: "#1f2937",
                        textAlignVertical: "top",
                      }}
                    />

                    {!!text.trim() && (
                      <Pressable
                        onPress={() => {
                          setText("");
                          inputRef.current?.focus();
                        }}
                        hitSlop={10}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 0,
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "rgba(0,0,0,0.06)",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: "700",
                            color: "#9ca3af",
                          }}
                        >
                          ×
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </Animated.View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ImageBackground>

        <Modal visible={showAITypeModal} transparent animationType="fade">
          <Pressable
            onPress={closeEntryTypePicker}
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
                backgroundColor: "rgba(31,41,55,0.94)",
                borderRadius: 24,
                padding: 20,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: "white",
                  marginBottom: 18,
                  textAlign: "center",
                }}
              >
                What are you writing?
              </Text>

              {(
                [
                  { key: "reminder", label: "Reminder" },
                  { key: "goal", label: "Goal" },
                  { key: "prayer", label: "Prayer" },
                  { key: "affirmation", label: "Affirmation" },
                ] as const
              ).map((option) => {
                const selected = selectedAIMode === option.key;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => chooseEntryType(option.key)}
                    style={{
                      backgroundColor: selected
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.07)",
                      borderRadius: 16,
                      paddingVertical: 15,
                      paddingHorizontal: 14,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: selected
                        ? "rgba(255,255,255,0.28)"
                        : "rgba(255,255,255,0.08)",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: "white",
                        textAlign: "center",
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={closeEntryTypePicker}
                style={{
                  paddingVertical: 10,
                  marginTop: 2,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: "rgba(255,255,255,0.72)",
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {hasSelectedEntryType ? "Cancel" : "Go Back"}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

         <Modal visible={showCadencePicker} transparent animationType="fade">
          <Pressable
            onPress={() => setShowCadencePicker(false)}
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
                backgroundColor: "rgba(31,41,55,0.92)",
                borderRadius: 24,
                padding: 20,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: "white",
                  marginBottom: 8,
                }}
              >
                Choose Reminder Cadence
              </Text>

              {(
                [
                  { key: "daily", label: "Daily" },
                  { key: "weekly", label: "Weekly" },
                  { key: "monthly", label: "Monthly" },
                  { key: "quarterly", label: "Quarterly" },
                  { key: "yearly", label: "Yearly" },
                ] as const
              ).map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    setSaveScheduleSource("digest");
                    setSelectedSaveCadence(option.key);
                    setShowCadencePicker(false);
                  }}
                  style={{
                    backgroundColor:
                      selectedSaveCadence === option.key
                        ? "rgba(255,255,255,0.16)"
                        : "rgba(255,255,255,0.06)",
                    borderRadius: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor:
                      selectedSaveCadence === option.key
                        ? "rgba(255,255,255,0.24)"
                        : "rgba(255,255,255,0.08)",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: "white",
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                onPress={() => setShowCadencePicker(false)}
                style={{
                  paddingVertical: 10,
                  marginTop: 2,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: "rgba(255,255,255,0.72)",
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

         <Modal visible={showTitleSaveModal} transparent animationType="fade">
          <Pressable
            onPress={() => setShowTitleSaveModal(false)}
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.35)",
              justifyContent: "flex-start",
              paddingHorizontal: 24,
              paddingTop: isKeyboardVisible ? 150 : 230,
            }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: "rgba(31,41,55,0.92)",
                borderRadius: 24,
                padding: 20,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: "white",
                  marginBottom: 8,
                }}
              >
                Save Entry
              </Text>

            <Text
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.72)",
                marginBottom: 12,
                lineHeight: 20,
              }}
            >
              Review the title and reminder settings.
            </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: "rgba(255,255,255,0.82)",
                  marginBottom: 6,
                }}
              >
                Title
              </Text>

                <View
                  style={{
                    position: "relative",
                    marginBottom: 16,
                  }}
                >
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Entry title"
                    placeholderTextColor="rgba(255,255,255,0.40)"
                    autoFocus
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      paddingLeft: 12,
                      paddingRight: title.trim() ? 40 : 12,
                      paddingVertical: 12,
                      fontSize: 15,
                      color: "white",
                      backgroundColor: "rgba(255,255,255,0.06)",
                    }}
                  />

                  {!!title.trim() && (
                    <Pressable
                      onPress={() => setTitle("")}
                      hitSlop={10}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: 0,
                        bottom: 0,
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: "rgba(255,255,255,0.40)",
                        }}
                      >
                        ×
                      </Text>
                    </Pressable>
                  )}
                </View>

                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: "rgba(255,255,255,0.82)",
                    marginBottom: 8,
                  }}
                >
                  Reminder
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Pressable
                    onPress={() => {
                      setSaveScheduleSource("none");
                      setSelectedSaveCadence("daily");
                      setShowCadencePicker(false);
                    }}
                    style={{
                      flex: 1,
                      minHeight: 42,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor:
                        saveScheduleSource === "none"
                          ? "rgba(255,255,255,0.26)"
                          : "rgba(255,255,255,0.10)",
                      backgroundColor:
                        saveScheduleSource === "none"
                          ? "rgba(255,255,255,0.16)"
                          : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: "white",
                        textAlign: "center",
                      }}
                    >
                      None
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (saveScheduleSource === "digest") {
                        setShowCadencePicker(true);
                        return;
                      }

                      setSaveScheduleSource("digest");
                      setSelectedSaveCadence("daily");
                      setShowCadencePicker(false);
                    }}
                    style={{
                      flex: 1,
                      minHeight: 42,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor:
                        saveScheduleSource === "digest"
                          ? "rgba(255,255,255,0.26)"
                          : "rgba(255,255,255,0.10)",
                      backgroundColor:
                        saveScheduleSource === "digest"
                          ? "rgba(255,255,255,0.16)"
                          : "rgba(255,255,255,0.06)",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: "white",
                        textTransform: "capitalize",
                      }}
                      numberOfLines={1}
                    >
                      {selectedSaveCadence}
                    </Text>

                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "800",
                        color: "rgba(255,255,255,0.70)",
                        marginLeft: 6,
                      }}
                    >
                      ▼
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setShowCadencePicker(false);
                      openCustomSetup();
                    }}
                    style={{
                      flex: 1,
                      minHeight: 42,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor:
                        saveScheduleSource === "custom"
                          ? "rgba(255,255,255,0.26)"
                          : "rgba(255,255,255,0.10)",
                      backgroundColor:
                        saveScheduleSource === "custom"
                          ? "rgba(255,255,255,0.16)"
                          : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: "white",
                        textAlign: "center",
                      }}
                    >
                      Custom
                    </Text>
                  </Pressable>
                </View>

                {saveScheduleSource === "digest" ? (
                  <View
                    style={{
                      backgroundColor: "rgba(255,255,255,0.08)",
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      marginBottom: 16,
                    }}
                  >
                    <Text
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      style={{
                        fontSize: 12,
                        lineHeight: 17,
                        color: "rgba(255,255,255,0.76)",
                      }}
                    >
                      {selectedDigestDescription}
                    </Text>
                  </View>
                ) : null}

                {saveScheduleSource === "custom" ? (
                  <Pressable
                    onPress={openCustomSetup}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.08)",
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      marginBottom: 16,
                    }}
                  >
                    <Text
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      style={{
                        fontSize: 12,
                        lineHeight: 17,
                        color: "rgba(255,255,255,0.76)",
                      }}
                    >
                      {getCustomScheduleSummary(
                        customScheduleMode,
                        customScheduleTime,
                        customDueDate,
                        customIntervalValue,
                        customIntervalUnit
                      )}
                    </Text>
                  </Pressable>
                ) : null}

              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                }}
              >
                <Pressable
                  onPress={() => setShowTitleSaveModal(false)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.10)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "white",
                    }}
                  >
                    Return
                  </Text>
                </Pressable>

                <Pressable
                  onPress={saveEntry}
                  disabled={isSaving || !text.trim()}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.16)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    opacity: isSaving || !text.trim() ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "white",
                    }}
                  >
                    Save
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

         <Modal visible={showCustomSetupModal} animationType="slide" presentationStyle="fullScreen">
          <SafeAreaView style={{ flex: 1, backgroundColor: "#111827" }}>
            <View
              style={{
                paddingHorizontal: 18,
                paddingTop: 8,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.10)",
                backgroundColor: "#111827",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Pressable
                onPress={() => {
                  setShowCustomSetupModal(false);
                  Keyboard.dismiss();
                }}
                style={{
                  minHeight: 40,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 12,
                  backgroundColor: "rgba(255,255,255,0.10)",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "white",
                  }}
                >
                  Return
                </Text>
              </Pressable>

              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: "white",
                }}
              >
                Custom Reminder
              </Text>

              <Pressable
                onPress={() => {
                  const parsedHour = Math.min(12, Math.max(1, Number(customTimeHour || "12")));
                  const normalizedHour = String(parsedHour);

                  const parsedMinute = Math.min(
                    59,
                    Math.max(0, Number(customTimeMinute || "0"))
                  );
                  const normalizedMinute = String(parsedMinute).padStart(2, "0");

                  setCustomTimeHour(normalizedHour);
                  setCustomTimeMinute(normalizedMinute);
                  setCustomScheduleTime(
                    build24HourTime(normalizedHour, normalizedMinute, customTimePeriod)
                  );
                  setSaveScheduleSource("custom");
                  setShowCustomSetupModal(false);
                  Keyboard.dismiss();
                }}
                style={{
                  minHeight: 40,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  backgroundColor: "rgba(255,255,255,0.16)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: "white",
                  }}
                >
                  Set
                </Text>
              </Pressable>
            </View>

            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: isKeyboardVisible ? 180 : 24,
                }}
              >
                <View
                  style={{
                    backgroundColor: "#f8fafc",
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() => setCustomScheduleMode("fixed_date")}
                      style={{
                        flex: 1,
                        minHeight: 40,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor:
                          customScheduleMode === "fixed_date" ? "#2563eb" : "#d1d5db",
                        backgroundColor:
                          customScheduleMode === "fixed_date" ? "#eff6ff" : "white",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color:
                            customScheduleMode === "fixed_date" ? "#1d4ed8" : "#374151",
                        }}
                      >
                        One-time
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setCustomScheduleMode("interval")}
                      style={{
                        flex: 1,
                        minHeight: 40,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor:
                          customScheduleMode === "interval" ? "#2563eb" : "#d1d5db",
                        backgroundColor:
                          customScheduleMode === "interval" ? "#eff6ff" : "white",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color:
                            customScheduleMode === "interval" ? "#1d4ed8" : "#374151",
                        }}
                      >
                        Repeating
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View
                  style={{
                    backgroundColor: "#f8fafc",
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <View style={{ marginBottom: 10 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: "#334155",
                        marginBottom: 6,
                      }}
                    >
                      Date
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
                        paddingVertical: 10,
                        backgroundColor: "white",
                        color: "black",
                        fontSize: 14,
                      }}
                    />
                  </View>

                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#111827",
                      marginBottom: 8,
                    }}
                  >
                    Selected: {customTimeHour || "12"}:
                    {(customTimeMinute || "00").padStart(2, "0")} {customTimePeriod}
                  </Text>

                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                    <TextInput
                      value={customTimeHour}
                      onChangeText={(value) => setCustomTimeHour(sanitizeCustomHourInput(value))}
                      keyboardType="number-pad"
                      placeholder="12"
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
                        fontSize: 15,
                        textAlign: "center",
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
                        fontSize: 15,
                        textAlign: "center",
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      backgroundColor: "#e5e7eb",
                      borderRadius: 12,
                      padding: 4,
                    }}
                  >
                    <Pressable
                      onPress={() => setCustomTimePeriod("AM")}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 9,
                        alignItems: "center",
                        backgroundColor: customTimePeriod === "AM" ? "white" : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: customTimePeriod === "AM" ? "#111827" : "#6b7280",
                        }}
                      >
                        AM
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setCustomTimePeriod("PM")}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 9,
                        alignItems: "center",
                        backgroundColor: customTimePeriod === "PM" ? "white" : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: customTimePeriod === "PM" ? "#111827" : "#6b7280",
                        }}
                      >
                        PM
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {customScheduleMode === "interval" ? (
                  <View
                    style={{
                      backgroundColor: "#f8fafc",
                      borderRadius: 14,
                      padding: 12,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: "#e5e7eb",
                    }}
                  >
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                      <View style={{ width: 92 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: "#475569",
                            marginBottom: 6,
                          }}
                        >
                          Every
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
                            textAlign: "center",
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

                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          {(["days", "weeks", "months", "years"] as const).map((unit) => {
                            const selected = customIntervalUnit === unit;

                            return (
                              <Pressable
                                key={unit}
                                onPress={() => setCustomIntervalUnit(unit)}
                                style={{
                                  width: "48%",
                                  borderWidth: 1,
                                  borderColor: selected ? "#2563eb" : "#d1d5db",
                                  borderRadius: 12,
                                  paddingVertical: 9,
                                  paddingHorizontal: 8,
                                  backgroundColor: selected ? "#eff6ff" : "white",
                                  alignItems: "center",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 13,
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

                <View
                  style={{
                    backgroundColor: "#f8fafc",
                    borderRadius: 14,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#334155",
                      marginBottom: 4,
                    }}
                  >
                    Summary
                  </Text>

                  <Text
                    style={{
                      fontSize: 12,
                      lineHeight: 18,
                      color: "#475569",
                    }}
                  >
                    {getCustomScheduleSummary(
                      customScheduleMode,
                      customScheduleTime,
                      customDueDate,
                      customIntervalValue,
                      customIntervalUnit
                    )}
                  </Text>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
    </>
  );
}