import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AIWriteMode = "prayer" | "affirmation" | "goal" | "reminder";

type EntryInput = {
  content: string;
};

type VerseMessageRow = {
  id: string;
  verse_id: string | null;
  message_text: string | null;
};

type VerseRow = {
  id: string;
  reference: string | null;
  primary_topic: string | null;
  secondary_topics: string[] | null;
  principles: string[] | null;
  is_general_daily: boolean | null;
};

type SelectedMorningMessage = {
  verseMessageId: string;
  verseId: string;
  messageText: string;
  verseReference: string;
};

function countIntendedSentences(text: string) {
  const trimmed = text.trim();

  if (!trimmed) return 1;

  const matches = trimmed.match(/[^.!?]+[.!?]+/g);
  if (matches && matches.length > 0) {
    return Math.max(1, matches.length);
  }

  return 1;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const protectedPrayerOpenings = [
  "Dear Father in Heaven",
  "Dear Heavenly Father",
  "Dear Holy Spirit",
  "Through Jesus Christ our Lord",
  "Heavenly Father",
  "Father God",
  "Abba Father",
  "Lord Jesus",
  "Dear Father",
  "Dear Daddy",
  "Dear Jesus",
  "Dear Lord",
  "Dear God",
  "Papa God",
  "Almighty God",
  "Gracious God",
  "Merciful Father",
  "Loving Father",
  "Creator God",
  "Good Father",
  "King Jesus",
  "My Savior",
  "Our Father",
  "My Father",
  "Holy Spirit",
  "Father",
  "Daddy",
  "Jesus",
  "Savior",
  "Abba",
  "Lord",
  "God",
];

const protectedPrayerClosingPatterns = [
  /in\s+the\s+name\s+of\s+the\s+father,\s*son,\s*and\s+holy\s+spirit\s*,?\s*amen[.!?]*$/i,
  /through\s+jesus\s+christ\s+our\s+lord\s*,?\s*amen[.!?]*$/i,
  /through\s+christ\s+our\s+lord\s*,?\s*amen[.!?]*$/i,
  /in\s+the\s+mighty\s+name\s+of\s+jesus\s*,?\s*amen[.!?]*$/i,
  /in\s+the\s+name\s+of\s+jesus\s*,?\s*amen[.!?]*$/i,
  /in\s+christ\s+jesus['’]?\s+name\s*,?\s*amen[.!?]*$/i,
  /in\s+christ['’]?\s+name\s*,?\s*amen[.!?]*$/i,
  /i\s+pray\s+this\s+in\s+jesus['’]?\s+name\s*,?\s*amen[.!?]*$/i,
  /i\s+ask\s+this\s+in\s+jesus['’]?\s+name\s*,?\s*amen[.!?]*$/i,
  /we\s+pray\s+in\s+jesus['’]?\s+name\s*,?\s*amen[.!?]*$/i,
  /in\s+jesus['’]?\s+name\s*,?\s*amen[.!?]*$/i,
  /in\s+your\s+heavenly\s+name\s+i\s+pray\s*,?\s*amen[.!?]*$/i,
  /in\s+your\s+heavenly\s+name\s*,?\s*amen[.!?]*$/i,
  /in\s+your\s+precious\s+name\s*,?\s*amen[.!?]*$/i,
  /in\s+your\s+holy\s+name\s*,?\s*amen[.!?]*$/i,
  /in\s+your\s+name\s*,?\s*amen[.!?]*$/i,
  /thank\s+you,\s*lord\s*,?\s*amen[.!?]*$/i,
  /thank\s+you,\s*father\s*,?\s*amen[.!?]*$/i,
  /thank\s+you,\s*jesus\s*,?\s*amen[.!?]*$/i,
  /in\s+jesus['’]?\s+name[.!?]*$/i,
  /in\s+christ['’]?\s+name[.!?]*$/i,
  /in\s+your\s+(?:holy|heavenly|precious)\s+name[.!?]*$/i,
  /amen[.!?]*$/i,
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getProtectedPrayerOpening(originalText: string) {
  const trimmed = originalText.trim();

  for (const opening of protectedPrayerOpenings) {
    const pattern = new RegExp(`^${escapeRegExp(opening).replace(/\\ /g, "\\s+")}\\s*,?`, "i");
    const match = trimmed.match(pattern);

    if (match?.[0]) {
      return match[0].trimEnd();
    }
  }

  return "";
}

function removeKnownPrayerOpening(text: string) {
  let result = text.trim();

  for (const opening of protectedPrayerOpenings) {
    const pattern = new RegExp(`^${escapeRegExp(opening).replace(/\\ /g, "\\s+")}\\s*,?\\s*`, "i");
    result = result.replace(pattern, "").trim();
  }

  return result;
}

function getProtectedPrayerClosing(originalText: string) {
  const trimmed = originalText.trim();

  for (const pattern of protectedPrayerClosingPatterns) {
    const match = trimmed.match(pattern);

    if (match?.[0]) {
      return match[0].trim();
    }
  }

  return "";
}

function removeKnownPrayerClosing(text: string) {
  let result = text.trim();

  for (const pattern of protectedPrayerClosingPatterns) {
    result = result.replace(pattern, "").trim();
  }

  return result;
}

function protectPrayerBoundaries(originalText: string, polishedText: string, aiMode: AIWriteMode) {
  if (aiMode !== "prayer") {
    return polishedText;
  }

  const protectedOpening = getProtectedPrayerOpening(originalText);
  const protectedClosing = getProtectedPrayerClosing(originalText);

  let result = polishedText.trim();

  if (protectedOpening && !result.toLowerCase().startsWith(protectedOpening.toLowerCase())) {
    result = removeKnownPrayerOpening(result);
    result = `${protectedOpening} ${result}`.trim();
  }

  if (protectedClosing && !result.toLowerCase().endsWith(protectedClosing.toLowerCase())) {
    result = removeKnownPrayerClosing(result);
    result = `${result} ${protectedClosing}`.trim();
  }

  return result;
}

function buildWritePrompt(aiMode: AIWriteMode, text: string, sentenceLimit: number) {
  const prayerOpeners = ["Lord,", "Dear God,", "Father,"];
  const selectedPrayerOpening =
  prayerOpeners[Math.floor(Math.random() * prayerOpeners.length)];
  const typeGuidance =
    aiMode === "prayer"
      ? `
For prayers:
- Always return the result as a direct prayer addressed to God.
- If the user's prayer already begins by addressing God, Jesus, the Father, the Holy Spirit, or another personal name for God, preserve that opening exactly as written.
- Examples of prayer openings to preserve include: "Lord,", "Dear Lord,", "Dear God,", "God,", "Father,", "Dear Father,", "Heavenly Father,", "Dear Heavenly Father,", "Father God,", "Abba Father,", "Abba,", "Jesus,", "Dear Jesus,", "Lord Jesus,", "Holy Spirit,", "Dear Holy Spirit,", "Dear Father in Heaven,", "Our Father,", "My Father,", "Daddy,", "Dear Daddy,", "Papa God,", "Almighty God,", "Gracious God,", "Merciful Father,", "Loving Father,", "Creator God,", "Savior,", "My Savior,", "King Jesus,", and "Good Father,"
- If the user's input does not already include a clear prayer opening, begin the prayer exactly with "${selectedPrayerOpening}"
- If the user's prayer includes a closing, preserve that closing exactly as written.
- Examples of prayer closings to preserve include: "Amen", "In Jesus' name, Amen", "In Jesus name, Amen", "In Jesus' name", "In Jesus name", "In Your name, Amen", "In Your holy name, Amen", "In Your heavenly name, Amen", "In Your heavenly name I pray, Amen", "In Your precious name, Amen", "In Christ's name, Amen", "In Christ Jesus' name, Amen", "In the name of Jesus, Amen", "In the mighty name of Jesus, Amen", "I pray this in Jesus' name, Amen", "I ask this in Jesus' name, Amen", "We pray in Jesus' name, Amen", "Through Christ our Lord, Amen", "Through Jesus Christ our Lord, Amen", "In the name of the Father, Son, and Holy Spirit, Amen", "Thank You, Lord, Amen", "Thank You, Father, Amen", and "Thank You, Jesus, Amen"
- Treat the user's prayer opening and closing as sacred personal language. Do not rewrite, replace, delete, modernize, or simplify them.
- Polish the middle of the prayer only.
- If the user's input is not already written as a prayer, gently turn it into one.
- Use first-person prayer language such as "help me," "guide me," "give me," "teach me," "lead me," or "remind me" when it fits.
- Point the user gently toward God.
- Keep it personal, simple, and sincere.
- Do not sound formal, dramatic, preachy, or overly religious.
- Preserve the user's original meaning, but shape it into prayer language.
- When possible, phrase the prayer around the strength, virtue, or grace the user needs rather than repeating the negative state.
- Output only the prayer text.
`
      : aiMode === "affirmation"
      ? `
For affirmations:
- Keep the tone encouraging and grounded.
- It is okay to reflect confidence, peace, courage, identity, or steadiness.
- Do not make it sound self-worshipping, self-glorifying, or disconnected from humility.
- Prefer grounded, plain language over generic self-help language.
- When the user expresses a negative feeling or struggle, gently redirect the wording toward the positive virtue, grace, or spiritual direction they are seeking.
- Prefer courage over "not fear," peace over "not anxiety," trust over "not worry," hope over "not discouragement," and patience over "not anger."
- Do not dwell on the negative framing if a stronger positive spiritual framing is possible.
- When natural, it is good for the tone to reflect trust, peace, purpose, or God's care, but do not force explicit faith language into every affirmation.
- Do not address God directly unless the user clearly wrote it that way.
`
      : aiMode === "goal"
      ? `
For goals:
- Make it clear, steady, and practical.
- Keep it encouraging, but not overly intense.
- Focus on action, discipline, consistency, or follow-through.
- Keep it sounding like a personal goal, not a prayer.
- Do not address God directly unless the user clearly wrote it that way.
- Do not start with Lord, God, Dear God, or similar prayer language unless the user's original text clearly did that.
`
      : `
For reminders:
- Write it like a clear personal reminder the user would want to revisit later.
- Keep it practical, concise, and natural.
- Preserve the user's meaning and tone.
- Do not force it into a prayer, affirmation, or goal format.
- It should read like something worth remembering or acting on.
- Keep it warm and polished without sounding dramatic.
- Do not address God directly unless the user clearly wrote it that way.
`;

  return `
You are helping a user polish a short piece of writing for a private app called Morning Message.

Your role:
- improve clarity
- improve warmth
- improve flow
- preserve the user's voice
- keep the meaning anchored to what the user already expressed

Very important rules:
- Do not introduce brand new ideas, stories, goals, emotions, or details the user did not indicate.
- Do not become dramatic, preachy, overly poetic, or overly therapeutic.
- Do not take over the message.
- Keep the response subtle, natural, encouraging, and human.
- Prefer grounded, plain language over generic self-help language.
- Preserve the user's original words whenever possible.
- Do not remove key user-written words, names, codes, shorthand, or specific phrases unless you are only correcting a tiny obvious typo.
- Prefer adding a little clarity around the user's original wording over replacing it with new wording.
- If the text is ambiguous, fragmentary, code-like, highly personal shorthand, or not clearly understandable, return it unchanged.
- Never replace the user's text with a generic explanation, placeholder, or apology.
- When the user expresses a negative feeling or struggle, gently redirect the wording toward the positive virtue, grace, or spiritual direction they are seeking.
- Prefer courage over "not fear," peace over "not anxiety," trust over "not worry," hope over "not discouragement," and patience over "not anger."
- Do not dwell on the negative framing if a stronger positive spiritual framing is possible.
- Especially in prayers, ask for what is needed in a positive direction rather than only asking to remove what is hard.
- Avoid phrases about "the strength within myself," "my own power," or other purely self-powered language unless the user clearly asked for that tone.
- Keep approximately the same scope and intensity as the user's original thought.
- If the user wrote only a word, phrase, or fragment, preserve it and only expand it if the meaning is clearly understood.
- If the user wrote 1 sentence, return no more than 1 sentence.
- If the user wrote 2 sentences, return no more than 2 sentences.
- In all cases, do not return more than ${sentenceLimit} sentence${sentenceLimit === 1 ? "" : "s"}.
- Output only the polished text, with no intro, no explanation, and no quotation marks.

${typeGuidance}

User input:
${text || ""}
`;
}

function finalizeAITitle(originalText: string, aiTitle: string) {
  const original = (originalText || "").trim();
  const suggested = (aiTitle || "").trim();

  if (!original && suggested) return suggested;
  if (!original) return "New Entry";

  const cleaned = suggested
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.!?;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "New Entry";
  }

  const lowerTitle = cleaned.toLowerCase();

  const weakTitles = new Set([
    "new entry",
    "prayer",
    "affirmation",
    "goal",
    "reminder",
    "help me",
    "help us",
    "guide me",
    "lord please",
    "dear lord",
    "dear god",
  ]);

  if (weakTitles.has(lowerTitle)) {
    return "New Entry";
  }

  const words = cleaned
    .replace(/[^\w\s'-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  const title = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .trim();

  return title || "New Entry";
}

function getThemeSignals(recentEntries: EntryInput[]) {
  const recentText = recentEntries
    .map((entry) => `${entry.content}`.toLowerCase())
    .join(" ");

  const themeSignals = [
    {
      theme: "anxiety",
      keywords: ["anxious", "anxiety", "worried", "worry", "fear", "afraid", "stress", "overwhelmed"],
      principles: ["peace", "trust", "God's presence"],
    },
    {
      theme: "guidance",
      keywords: ["decision", "direction", "wisdom", "guidance", "unclear", "confused", "discernment"],
      principles: ["wisdom", "trust", "surrender"],
    },
    {
      theme: "strength",
      keywords: ["tired", "weary", "weak", "strength", "exhausted", "burned out", "hard"],
      principles: ["endurance", "dependence on God", "hope"],
    },
    {
      theme: "identity",
      keywords: ["worth", "identity", "shame", "insecure", "enough", "rejected", "accepted"],
      principles: ["belovedness", "grace", "security in God"],
    },
    {
      theme: "forgiveness",
      keywords: ["forgive", "forgiveness", "resentment", "bitter", "bitterness", "anger"],
      principles: ["mercy", "grace", "release"],
    },
    {
      theme: "purpose",
      keywords: ["purpose", "calling", "meaning", "work", "focus", "discipline"],
      principles: ["faithfulness", "obedience", "steadiness"],
    },
    {
      theme: "gratitude",
      keywords: ["thankful", "gratitude", "grateful", "blessing", "blessed"],
      principles: ["thankfulness", "joy", "contentment"],
    },
    {
      theme: "family",
      keywords: ["wife", "husband", "son", "daughter", "child", "children", "family", "marriage", "parent"],
      principles: ["love", "patience", "service"],
    },
  ];

  const matchedSignals = themeSignals.filter((signal) =>
    signal.keywords.some((keyword) => recentText.includes(keyword))
  );

  return {
    matchedThemes: matchedSignals.map((signal) => signal.theme),
    matchedPrinciples: [...new Set(matchedSignals.flatMap((signal) => signal.principles))],
  };
}

async function getUsedVerseMessageIds(adminSupabase: any, userId: string) {
  const { data, error } = await adminSupabase
    .from("daily_messages")
    .select("verse_message_id")
    .eq("user_id", userId)
    .not("verse_message_id", "is", null);

  if (error) {
    console.log("Used verse message lookup error:", error.message);
    return new Set<string>();
  }

  return new Set(
    (data ?? [])
      .map((item: { verse_message_id: string | null }) => item.verse_message_id)
      .filter(Boolean)
  );
}

async function chooseUnseenVerseMessage(params: {
  adminSupabase: any;
  userId: string;
  recentEntries: EntryInput[];
  extraUsedIds?: string[];
}): Promise<SelectedMorningMessage | null> {
  const { adminSupabase, userId, recentEntries, extraUsedIds = [] } = params;

  const usedIds = await getUsedVerseMessageIds(adminSupabase, userId);
  extraUsedIds.forEach((id) => usedIds.add(id));

  const { data: messageRows, error: messageError } = await adminSupabase
    .from("verse_messages")
    .select("id, verse_id, message_text")
    .eq("active", true)
    .limit(2000);

  if (messageError) {
    console.log("Verse message pool lookup error:", messageError.message);
    return null;
  }

  const unseenMessages = ((messageRows ?? []) as VerseMessageRow[]).filter(
    (message) =>
      message.id &&
      message.verse_id &&
      message.message_text &&
      !usedIds.has(message.id)
  );

  if (unseenMessages.length === 0) {
    console.log("No unseen verse messages available for user:", userId);
    return null;
  }

  const verseIds = [
    ...new Set(
      unseenMessages
        .map((message) => message.verse_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const { data: verseRows, error: verseError } = await adminSupabase
    .from("bible_verses")
    .select("id, reference, primary_topic, secondary_topics, principles, is_general_daily")
    .eq("active", true)
    .in("id", verseIds);

  if (verseError) {
    console.log("Verse lookup for unseen messages error:", verseError.message);
    return null;
  }

  const verseMap = new Map<string, VerseRow>(
    ((verseRows ?? []) as VerseRow[]).map((verse) => [verse.id, verse])
  );

  const { matchedThemes, matchedPrinciples } = getThemeSignals(recentEntries);

  const scoredCandidates = unseenMessages
    .map((message) => {
      const verse = message.verse_id ? verseMap.get(message.verse_id) : null;

      if (!verse?.reference || !message.message_text || !message.verse_id) {
        return null;
      }

      const secondaryTopics = Array.isArray(verse.secondary_topics)
        ? verse.secondary_topics
        : [];
      const versePrinciples = Array.isArray(verse.principles)
        ? verse.principles
        : [];

      let score = 0;

      if (matchedThemes.includes(verse.primary_topic ?? "")) score += 4;

      score += secondaryTopics.filter((topic) => matchedThemes.includes(topic)).length * 2;

      score += versePrinciples.filter((principle) =>
        matchedPrinciples.includes(principle)
      ).length;

      if (matchedThemes.length === 0 && verse.is_general_daily) score += 3;

      score += Math.random();

      return {
        message,
        verse,
        score,
      };
    })
    .filter(Boolean) as Array<{
      message: VerseMessageRow;
      verse: VerseRow;
      score: number;
    }>;

  if (scoredCandidates.length === 0) {
    console.log("No scored unseen verse messages available for user:", userId);
    return null;
  }

  scoredCandidates.sort((a, b) => b.score - a.score);

  const topCandidates = scoredCandidates.slice(0, Math.min(8, scoredCandidates.length));
  const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  return {
    verseMessageId: selected.message.id,
    verseId: selected.message.verse_id as string,
    messageText: selected.message.message_text as string,
    verseReference: selected.verse.reference as string,
  };
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";

    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const token = authHeader.replace("Bearer ", "").trim();

    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    const body = await req.json();
    const mode = body?.mode ?? "write";
    const aiMode = (body?.aiMode ?? "prayer") as AIWriteMode;
    const text = body?.text ?? "";
    const forceRegenerate = body?.forceRegenerate === true;
    const activeEntries = Array.isArray(body?.activeEntries) ? body.activeEntries : [];

    if (mode === "write") {
      if (!openAiKey) {
        return new Response(
          JSON.stringify({
            error: "OpenAI key is missing",
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          }
        );
      }

      const sentenceLimit = countIntendedSentences(text);
      const prompt = buildWritePrompt(aiMode, text, sentenceLimit);

      const polishResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You help users gently polish prayers, gratitude reflections, affirmations, goals, and personal writing while preserving their original intent and approximate length.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.6,
          max_tokens: 120,
        }),
      });

      const polishData = await polishResponse.json();
      const rawTextOutput = polishData?.choices?.[0]?.message?.content?.trim() ?? "";

      const originalText = (text || "").trim();
      const lowerRawOutput = rawTextOutput.toLowerCase();

      const looksLikeBadFallback =
        !rawTextOutput ||
        lowerRawOutput.includes("there appears to be a mix up with your entry") ||
        lowerRawOutput.includes("there appears to be a mix-up with your entry") ||
        lowerRawOutput.includes("it seems like there might have been a mix up with your input") ||
        lowerRawOutput.includes("it seems like there might have been a mix-up with your input") ||
        lowerRawOutput.includes("please clarify") ||
        lowerRawOutput.includes("i need more context") ||
        lowerRawOutput.includes("i'm not sure what you mean") ||
        lowerRawOutput.includes("unclear") ||
        lowerRawOutput.includes("cannot determine");

      const textOutput = looksLikeBadFallback
        ? originalText
        : protectPrayerBoundaries(originalText, rawTextOutput, aiMode);

      const titlePrompt = `
You are helping generate a short, meaningful title for a private app entry.

Entry type:
${aiMode}

Original user text:
${text || ""}

Polished entry text:
${textOutput || ""}

Rules for the title:
- Return only the title text.
- Return 2 to 4 words.
- Never return more than 4 words.
- Do not write a sentence.
- Do not use quotation marks.
- Do not use markdown.
- Do not use a colon, dash, subtitle, or tagline.
- The title must name the concrete subject when one exists.
- If the entry is about learning an instrument, skill, vehicle, job, relationship, health issue, or decision, include that thing directly.
- Avoid generic titles like "New Entry", "Prayer", "Help Me", "My Goal", "Guide Me", or "Lord Please".
- Avoid titles that mainly repeat the opening phrase.
- Avoid vague titles focused only on emotion when the entry clearly names a subject.
- Keep it natural, clear, and human.
`;

      const titleResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You create short, meaningful titles for private journal entries.",
            },
            {
              role: "user",
              content: titlePrompt,
            },
          ],
          temperature: 0.4,
          max_tokens: 20,
        }),
      });

      const titleData = await titleResponse.json();
      const rawTitle = titleData?.choices?.[0]?.message?.content?.trim() ?? "";
      const titleOutput = finalizeAITitle(text, rawTitle);

      return new Response(JSON.stringify({ text: textOutput, title: titleOutput }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (mode === "daily") {
      const today = formatLocalDate(new Date());

      const { data: existingMessages, error: existingError } = await userSupabase
        .from("daily_messages")
        .select(
          "id, message_index, message_text, verse_reference, verse_query, verse_message_id, is_primary"
        )
        .eq("user_id", user.id)
        .eq("message_date", today)
        .order("message_index", { ascending: true });

      if (existingError) {
        console.log("Existing daily messages lookup error:", existingError.message);
      }

      if (!forceRegenerate && existingMessages && existingMessages.length > 0) {
        const primaryMessage =
          existingMessages.find((item) => item.is_primary) ?? existingMessages[0];

        return new Response(
          JSON.stringify({
            message: primaryMessage.message_text,
            verse_reference: primaryMessage.verse_reference,
            verse_query: primaryMessage.verse_query,
            message_index: primaryMessage.message_index ?? 0,
            is_primary: primaryMessage.is_primary ?? true,
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      const existingTodayVerseMessageIds = (existingMessages ?? [])
        .map((item) => item.verse_message_id)
        .filter(Boolean);

      const { data: profileRow, error: profileError } = await userSupabase
        .from("profiles")
        .select("curated_day_index, last_home_message_date")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.log("Profile lookup error:", profileError.message);
      }

      const currentCuratedDayIndex = Number(profileRow?.curated_day_index ?? 0);
      const lastHomeMessageDate = profileRow?.last_home_message_date ?? null;

      const isNewHomeMessageDay = today !== lastHomeMessageDate;

      const targetCuratedDayIndex = isNewHomeMessageDay
        ? Math.min(currentCuratedDayIndex + 1, 31)
        : currentCuratedDayIndex;

      const shouldUpdateProfileProgress = isNewHomeMessageDay;

      let selectedMessage: SelectedMorningMessage | null = null;

      const usedIds = await getUsedVerseMessageIds(adminSupabase, user.id);
      existingTodayVerseMessageIds.forEach((id) => usedIds.add(id));

      if (targetCuratedDayIndex > 0 && targetCuratedDayIndex <= 30) {
        const { data: curatedRow, error: curatedError } = await adminSupabase
          .from("curated_daily_schedule")
          .select("verse_message_id")
          .eq("day_number", targetCuratedDayIndex)
          .eq("active", true)
          .maybeSingle();

        if (curatedError) {
          console.log("Curated schedule lookup error:", curatedError.message);
        }

        if (curatedRow?.verse_message_id && !usedIds.has(curatedRow.verse_message_id)) {
          const { data: verseMessageRow, error: verseMessageError } = await adminSupabase
            .from("verse_messages")
            .select("id, verse_id, message_text")
            .eq("id", curatedRow.verse_message_id)
            .eq("active", true)
            .maybeSingle();

          if (verseMessageError) {
            console.log("Curated verse message lookup error:", verseMessageError.message);
          }

          if (verseMessageRow?.verse_id && verseMessageRow?.message_text) {
            const { data: verseRow, error: verseError } = await adminSupabase
              .from("bible_verses")
              .select("id, reference")
              .eq("id", verseMessageRow.verse_id)
              .eq("active", true)
              .maybeSingle();

            if (verseError) {
              console.log("Curated verse lookup error:", verseError.message);
            }

            if (verseRow?.id && verseRow?.reference) {
              selectedMessage = {
                verseMessageId: verseMessageRow.id,
                verseId: verseRow.id,
                messageText: verseMessageRow.message_text,
                verseReference: verseRow.reference,
              };
            }
          }
        }
      }

      if (!selectedMessage) {
        const recentEntries = activeEntries
          .filter(
            (entry) =>
              entry &&
              typeof entry.content === "string" &&
              entry.content.trim().length > 0
          )
          .slice(0, 8);

        selectedMessage = await chooseUnseenVerseMessage({
          adminSupabase,
          userId: user.id,
          recentEntries,
          extraUsedIds: existingTodayVerseMessageIds,
        });
      }

      if (!selectedMessage) {
        return new Response(
          JSON.stringify({
            error:
              "No unused Morning Message is available. Add more active verse_messages before generating another message.",
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 409,
          }
        );
      }

      const messageToSave = {
        user_id: user.id,
        message_date: today,
        message_text: selectedMessage.messageText,
        verse_reference: selectedMessage.verseReference,
        verse_query: selectedMessage.verseReference,
        verse_id: selectedMessage.verseId,
        verse_message_id: selectedMessage.verseMessageId,
        message_index: 0,
        is_primary: true,
      };

      if (forceRegenerate && existingMessages && existingMessages.length > 0) {
        const { error: replaceError } = await adminSupabase
          .from("daily_messages")
          .delete()
          .eq("user_id", user.id)
          .eq("message_date", today);

        if (replaceError) {
          console.log("Daily message replace delete error:", replaceError.message);
        }
      }

      const { error: insertError } = await adminSupabase
        .from("daily_messages")
        .insert(messageToSave);

      if (insertError) {
        console.log("Daily message insert error:", insertError.message);

        return new Response(
          JSON.stringify({
            error: "Could not save Morning Message",
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          }
        );
      }

      if (shouldUpdateProfileProgress) {
        const { error: profileUpdateError } = await adminSupabase
          .from("profiles")
          .update({
            curated_day_index: targetCuratedDayIndex,
            last_home_message_date: today,
          })
          .eq("id", user.id);

        if (profileUpdateError) {
          console.log("Profile daily progress update error:", profileUpdateError.message);
        }
      }

      return new Response(
        JSON.stringify({
          message: messageToSave.message_text,
          verse_reference: messageToSave.verse_reference,
          verse_query: messageToSave.verse_query,
          message_index: messageToSave.message_index,
          is_primary: messageToSave.is_primary,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Invalid mode",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      }
    );
  } catch (error) {
    console.log("generate-entry error:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to generate entry",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});