import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const SHARE_BACKGROUNDS_BUCKET = "share-backgrounds";

type TextColor = "dark" | "light";

type VerseMessageRow = {
  id: string;
  message_text: string;
  verse_id: string | null;
  created_at?: string | null;
};

type BibleVerseRow = {
  id: string;
  reference: string | null;
  verse_text: string | null;
};

type BackgroundAssignmentRow = {
  verse_message_id: string;
  kind: "photo" | "art";
  storage_path: string;
  label: string | null;
  sort_order: number | null;
  active: boolean | null;
};

type PreviewItem = {
  id: string;
  verseMessageId: string;
  kind: "photo" | "art";
  storagePath: string;
  label: string;
  messageText: string;
  verseReference: string;
  verseText: string;
};

function getPublicUrl(path: string) {
  const { data } = supabase.storage
    .from(SHARE_BACKGROUNDS_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

function colorValue(color: TextColor) {
  return color === "light" ? "rgba(255,255,255,0.96)" : "rgba(46,38,30,0.88)";
}

function shadowValue(color: TextColor) {
  return color === "light" ? "rgba(0,0,0,0.48)" : "rgba(255,255,255,0.24)";
}

export default function ShareBackgroundPreviewScreen() {
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [messageColor, setMessageColor] = useState<TextColor>("light");
  const [verseColor, setVerseColor] = useState<TextColor>("light");
  const [isLoading, setIsLoading] = useState(true);

  const currentItem = previewItems[currentIndex];

  const imageUrl = useMemo(() => {
    if (!currentItem) return null;
    return getPublicUrl(currentItem.storagePath);
  }, [currentItem]);

  useEffect(() => {
    let isMounted = true;

    async function loadPreviewItems() {
      setIsLoading(true);

      const { data: verseMessages, error: verseMessagesError } = await supabase
        .from("verse_messages")
        .select("id, message_text, verse_id, created_at")
        .order("created_at", { ascending: true });

      if (verseMessagesError) {
        console.error("Error loading verse messages", verseMessagesError);
        if (isMounted) {
          setPreviewItems([]);
          setIsLoading(false);
        }
        return;
      }

      const typedVerseMessages = (verseMessages ?? []) as VerseMessageRow[];

      const verseMessageIds = typedVerseMessages.map((row) => row.id);
      const verseIds = typedVerseMessages
        .map((row) => row.verse_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      const { data: assignments, error: assignmentsError } = await supabase
        .from("message_share_backgrounds")
        .select("verse_message_id, kind, storage_path, label, sort_order, active")
        .in("verse_message_id", verseMessageIds)
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (assignmentsError) {
        console.error("Error loading assignments", assignmentsError);
        if (isMounted) {
          setPreviewItems([]);
          setIsLoading(false);
        }
        return;
      }

      let bibleVerses: BibleVerseRow[] = [];

      if (verseIds.length > 0) {
        const { data: bibleVerseRows, error: bibleVersesError } = await supabase
          .from("bible_verses")
          .select("id, reference, verse_text")
          .in("id", verseIds);

        if (bibleVersesError) {
          console.error("Error loading bible verses", bibleVersesError);
        } else {
          bibleVerses = (bibleVerseRows ?? []) as BibleVerseRow[];
        }
      }

      const assignmentMap = new Map<string, BackgroundAssignmentRow[]>();
      ((assignments ?? []) as BackgroundAssignmentRow[]).forEach((row) => {
        const existing = assignmentMap.get(row.verse_message_id) ?? [];
        existing.push(row);
        assignmentMap.set(row.verse_message_id, existing);
      });

      const bibleVerseMap = new Map<string, BibleVerseRow>();
      bibleVerses.forEach((row) => {
        bibleVerseMap.set(row.id, row);
      });

      const builtPreviewItems: PreviewItem[] = [];

      typedVerseMessages.forEach((messageRow) => {
        const backgroundRows = assignmentMap.get(messageRow.id) ?? [];
        const bibleVerse = messageRow.verse_id
          ? bibleVerseMap.get(messageRow.verse_id)
          : undefined;

        const photoRow = backgroundRows.find((row) => row.kind === "photo");
        const artRow = backgroundRows.find((row) => row.kind === "art");

        if (photoRow) {
          builtPreviewItems.push({
            id: `${messageRow.id}-photo`,
            verseMessageId: messageRow.id,
            kind: "photo",
            storagePath: photoRow.storage_path,
            label: photoRow.label ?? "Photo",
            messageText: messageRow.message_text ?? "",
            verseReference: bibleVerse?.reference ?? "",
            verseText: bibleVerse?.verse_text ?? "",
          });
        }

        if (artRow) {
          builtPreviewItems.push({
            id: `${messageRow.id}-art`,
            verseMessageId: messageRow.id,
            kind: "art",
            storagePath: artRow.storage_path,
            label: artRow.label ?? "Art",
            messageText: messageRow.message_text ?? "",
            verseReference: bibleVerse?.reference ?? "",
            verseText: bibleVerse?.verse_text ?? "",
          });
        }
      });

      if (isMounted) {
        setPreviewItems(builtPreviewItems);
        setCurrentIndex(0);
        setIsLoading(false);
      }
    }

    loadPreviewItems();

    return () => {
      isMounted = false;
    };
  }, []);

  function goPrevious() {
    if (!previewItems.length) return;

    setCurrentIndex((current) =>
      current === 0 ? previewItems.length - 1 : current - 1
    );
  }

  function goNext() {
    if (!previewItems.length) return;

    setCurrentIndex((current) =>
      current === previewItems.length - 1 ? 0 : current + 1
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0d12" }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: "white", fontSize: 16, fontWeight: "800" }}>
            Back
          </Text>
        </Pressable>

        <Text style={{ color: "white", fontSize: 15, fontWeight: "900" }}>
          Preview Share Backgrounds
        </Text>

        <Text
          style={{
            color: "rgba(255,255,255,0.62)",
            fontSize: 13,
            fontWeight: "800",
          }}
        >
          {previewItems.length ? `${currentIndex + 1}/${previewItems.length}` : ""}
        </Text>
      </View>

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 18,
        }}
      >
        {isLoading ? (
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color="white" />
            <Text
              style={{
                marginTop: 12,
                color: "rgba(255,255,255,0.74)",
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              Loading preview cards...
            </Text>
          </View>
        ) : !currentItem || !imageUrl ? (
          <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
            No preview items found
          </Text>
        ) : (
          <>
            <View
              style={{
                width: 300,
                minHeight: 470,
                borderRadius: 28,
                overflow: "hidden",
                backgroundColor: "#d8c3a5",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.28)",
              }}
            >
              <ImageBackground
                key={currentItem.id}
                source={{ uri: imageUrl }}
                resizeMode="cover"
                style={StyleSheet.absoluteFillObject}
              >
                <LinearGradient
                  colors={[
                    "rgba(245,229,196,0.42)",
                    "rgba(180,150,118,0.22)",
                    "rgba(32,44,56,0.56)",
                  ]}
                  style={StyleSheet.absoluteFillObject}
                />
              </ImageBackground>

              <View
                style={{
                  flex: 1,
                  paddingHorizontal: 14,
                  paddingTop: 12,
                  paddingBottom: 16,
                }}
              >
                <Text
                  style={{
                    color:
                      verseColor === "light"
                        ? "rgba(255,255,255,0.78)"
                        : "rgba(46,38,30,0.68)",
                    fontSize: 10,
                    fontWeight: "700",
                    letterSpacing: 6.5,
                    textAlign: "center",
                    textTransform: "uppercase",
                    marginBottom: 24,
                    textShadowColor: shadowValue(verseColor),
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  }}
                >
                  Morning Message
                </Text>

                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    paddingHorizontal: 10,
                    paddingTop: 8,
                    paddingBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      color: colorValue(messageColor),
                      fontSize: 31,
                      lineHeight: 40,
                      fontWeight: "850",
                      textAlign: "center",
                      textShadowColor: shadowValue(messageColor),
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}
                  >
                    {currentItem.messageText}
                  </Text>
                </View>

                <View
                  style={{
                    marginTop: 8,
                    width: "100%",
                    backgroundColor:
                      verseColor === "dark"
                        ? "rgba(255,247,232,0.48)"
                        : "rgba(17,24,39,0.34)",
                    borderRadius: 20,
                    paddingVertical: 15,
                    paddingHorizontal: 18,
                    borderWidth: 1,
                    borderColor:
                      verseColor === "dark"
                        ? "rgba(46,38,30,0.14)"
                        : "rgba(255,255,255,0.13)",
                  }}
                >
                  <Text
                    style={{
                      color: colorValue(verseColor),
                      fontSize: 14,
                      fontWeight: "900",
                      textAlign: "center",
                      letterSpacing: 0.45,
                      marginBottom: 10,
                      textShadowColor: shadowValue(verseColor),
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}
                  >
                    {currentItem.verseReference}
                  </Text>

                  <Text
                    style={{
                      color: colorValue(verseColor),
                      fontSize: 14,
                      lineHeight: 21,
                      fontWeight: "600",
                      textAlign: "center",
                      marginBottom: 8,
                      textShadowColor: shadowValue(verseColor),
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}
                  >
                    {currentItem.verseText}
                  </Text>

                  <Text
                    style={{
                      color:
                        verseColor === "light"
                          ? "rgba(255,255,255,0.52)"
                          : "rgba(46,38,30,0.52)",
                      fontSize: 7.5,
                      lineHeight: 10,
                      textAlign: "center",
                    }}
                  >
                    NET Bible® copyright ©1996–2019 Biblical Studies Press.
                  </Text>
                </View>
              </View>
            </View>

            <Text
              style={{
                marginTop: 10,
                color: "rgba(255,255,255,0.84)",
                fontSize: 13,
                fontWeight: "800",
              }}
            >
              {currentItem.kind === "photo" ? "Photo" : "Art"} • {currentItem.label}
            </Text>

            <Text
              style={{
                marginTop: 4,
                color: "rgba(255,255,255,0.58)",
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {currentItem.storagePath}
            </Text>

            <View
              style={{
                width: "100%",
                marginTop: 18,
                flexDirection: "row",
                gap: 10,
              }}
            >
              <Pressable
                onPress={goPrevious}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 16,
                  backgroundColor: "rgba(255,255,255,0.12)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "white", fontSize: 15, fontWeight: "900" }}>
                  Previous
                </Text>
              </Pressable>

              <Pressable
                onPress={goNext}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 16,
                  backgroundColor: "#fff7e8",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#111827", fontSize: 15, fontWeight: "900" }}>
                  Next
                </Text>
              </Pressable>
            </View>

            <View
              style={{
                width: "100%",
                marginTop: 12,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setMessageColor("dark")}
                  style={{
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      messageColor === "dark"
                        ? "#fff7e8"
                        : "rgba(255,255,255,0.12)",
                  }}
                >
                  <Text
                    style={{
                      color: messageColor === "dark" ? "#111827" : "white",
                      fontWeight: "900",
                    }}
                  >
                    Message Dark
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setMessageColor("light")}
                  style={{
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      messageColor === "light"
                        ? "#fff7e8"
                        : "rgba(255,255,255,0.12)",
                  }}
                >
                  <Text
                    style={{
                      color: messageColor === "light" ? "#111827" : "white",
                      fontWeight: "900",
                    }}
                  >
                    Message White
                  </Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setVerseColor("dark")}
                  style={{
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      verseColor === "dark"
                        ? "#fff7e8"
                        : "rgba(255,255,255,0.12)",
                  }}
                >
                  <Text
                    style={{
                      color: verseColor === "dark" ? "#111827" : "white",
                      fontWeight: "900",
                    }}
                  >
                    Verse Dark
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setVerseColor("light")}
                  style={{
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      verseColor === "light"
                        ? "#fff7e8"
                        : "rgba(255,255,255,0.12)",
                  }}
                >
                  <Text
                    style={{
                      color: verseColor === "light" ? "#111827" : "white",
                      fontWeight: "900",
                    }}
                  >
                    Verse White
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}