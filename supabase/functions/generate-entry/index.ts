import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type EntryType = "prayer" | "gratitude" | "affirmation" | "goal";


function countIntendedSentences(text: string) {
  const trimmed = text.trim();

  if (!trimmed) return 1;

  const matches = trimmed.match(/[^.!?]+[.!?]+/g);
  if (matches && matches.length > 0) {
    return Math.max(1, matches.length);
  }

  return 1;
}

function buildWritePrompt(type: string, text: string, sentenceLimit: number) {
  const typeGuidance =
    type === "prayer"
      ? `
For prayers:
- Point the user gently toward God.
- It is good to use language like Lord, God, peace, trust, guidance, help, strength, comfort, presence, courage, wisdom, or hope when it fits naturally.
- Keep it personal, simple, and sincere.
- Do not sound formal or preachy.
- When possible, phrase the prayer around the strength, virtue, or grace the user needs rather than repeating the negative state.
`
      : type === "affirmation"
      ? `
For affirmations:
- Keep the tone encouraging and grounded.
- It is okay to reflect confidence, peace, courage, identity, or steadiness.
- Do not make it sound self-worshipping, self-glorifying, or disconnected from humility.
- Prefer grounded, plain language over generic self-help language.
- When the user expresses a negative feeling or struggle, gently redirect the wording toward the positive virtue, grace, or spiritual direction they are seeking.
- Prefer courage over "not fear," peace over "not anxiety," trust over "not worry," hope over "not discouragement," and patience over "not anger."
- Do not dwell on the negative framing if a stronger positive spiritual framing is possible.
- Especially in prayers, ask for what is needed in a positive direction rather than only asking to remove what is hard.
- When natural, it is good for the tone to reflect trust, peace, purpose, or God's care, but do not force explicit faith language into every affirmation.
`
      : type === "gratitude"
      ? `
For gratitude:
- Make it warm, thankful, and sincere.
- When natural, it is good to reflect thankfulness to God, but do not force it if the user's words do not suggest it.
- Keep it specific and genuine.
`
      : `
For goals:
- Make it clear, steady, and practical.
- Keep it encouraging, but not overly intense.
- When natural, a humble tone that reflects wisdom, discipline, trust, or purpose is good.
`;

  return `
You are helping a user polish a short ${type} for a private app called Morning Message.

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
- When the user expresses a negative feeling or struggle, gently redirect the wording toward the positive virtue, grace, or spiritual direction they are seeking.
- Prefer courage over "not fear," peace over "not anxiety," trust over "not worry," hope over "not discouragement," and patience over "not anger."
- Do not dwell on the negative framing if a stronger positive spiritual framing is possible.
- Especially in prayers, ask for what is needed in a positive direction rather than only asking to remove what is hard.
- Avoid phrases about "the strength within myself," "my own power," or other purely self-powered language unless the user clearly asked for that tone.
- Keep approximately the same scope and intensity as the user's original thought.
- If the user wrote only a word, phrase, or fragment, turn it into exactly 1 sentence.
- If the user wrote 1 sentence, return no more than 1 sentence.
- If the user wrote 2 sentences, return no more than 2 sentences.
- In all cases, do not return more than ${sentenceLimit} sentence${sentenceLimit === 1 ? "" : "s"}.
- Output only the polished text, with no intro, no explanation, and no quotation marks.

${typeGuidance}

User input:
${text || ""}
`;
}

function buildDailyPrompt(params: {
  verseReference: string;
  verseText: string;
  mode: "general" | "matched";
  themes: string[];
  principles: string[];
  count?: number;
}) {
  const { verseReference, verseText, mode, themes, principles } = params;

  const themeText = themes.length ? themes.join(", ") : "none";
  const principleText = principles.length ? principles.join(", ") : "none";

  return `
You are writing 1 short morning message for a Christian app.

Your tone:
- warm
- grounded
- hopeful
- emotionally honest
- spiritually mature
- like a wise pastor-friend

You are explicitly Christian and may naturally reference Jesus, God, God's love, compassion, forgiveness through Jesus, grace, prayer, truth, hope, surrender, and eternal perspective.

Rules:
- The message must clearly connect to the provided Scripture.
- Do not sound preachy, cheesy, shallow, manipulative, or judgmental.
- Do not sound like you are analyzing the user's private journal.
- If pain is present, be honest and real, not full of platitudes.
- Not every message needs a call to action; reflection is often enough.
- Keep the message to 1-2 sentences.
- Return strict JSON only.
- Do not include markdown.
- Do not include commentary before or after the JSON.
- Do not include verse_reference, verse_query, themes, principles, or explanations.
- Use exactly this shape:
{
  "message": "..."
}

Scripture for today:
${verseReference}
${verseText}

Selection mode:
${mode}

Recent themes:
${themeText}

Helpful principles:
${principleText}

Write 1 distinct message built around this exact verse.
`;
}

async function chooseDailyVerse(
  supabase: any,
  recentEntries: Array<{ type: string; content: string }>,
  recentlyUsedVerses: string[]
) {
  const recentText = recentEntries
    .map((entry) => `${entry.type}: ${entry.content}`.toLowerCase())
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
  ];

 const matchedSignals = themeSignals.filter((signal) =>
  signal.keywords.some((keyword) => recentText.includes(keyword))
);

const matchedThemes = matchedSignals.map((signal) => signal.theme);
const matchedPrinciples = [...new Set(matchedSignals.flatMap((signal) => signal.principles))];

let candidateVerses: any[] | null = null;
let error: any = null;

if (matchedThemes.length > 0) {
  const primaryMatch = await supabase
    .from("bible_verses")
    .select("*")
    .eq("active", true)
    .in("primary_topic", matchedThemes)
    .limit(40);

  const secondaryMatch = await supabase
    .from("bible_verses")
    .select("*")
    .eq("active", true)
    .overlaps("secondary_topics", matchedThemes)
    .limit(40);

  error = primaryMatch.error ?? secondaryMatch.error;

  const merged = [...(primaryMatch.data ?? []), ...(secondaryMatch.data ?? [])];
  candidateVerses = Array.from(
    new Map(merged.map((verse: any) => [verse.reference, verse])).values()
  );
} else {
  const generalMatch = await supabase
    .from("bible_verses")
    .select("*")
    .eq("active", true)
    .eq("is_general_daily", true)
    .limit(40);

  candidateVerses = generalMatch.data ?? [];
  error = generalMatch.error;
}

if (error) {
  console.log("chooseDailyVerse lookup error:", error.message);
} else {
  console.log(
    "chooseDailyVerse sample columns:",
    candidateVerses && candidateVerses.length > 0 ? Object.keys(candidateVerses[0]) : []
  );
}

    const filteredCandidates = (candidateVerses ?? []).filter(
    (verse: any) => !recentlyUsedVerses.includes(verse.reference)
  );

  const usableCandidates =
    filteredCandidates.length > 0 ? filteredCandidates : candidateVerses ?? [];

  const scoredCandidates = usableCandidates
    .map((verse: any) => {
      const secondaryTopics = Array.isArray(verse.secondary_topics)
        ? verse.secondary_topics
        : [];
      const versePrinciples = Array.isArray(verse.principles)
        ? verse.principles
        : [];

      let score = 0;

      if (matchedThemes.includes(verse.primary_topic)) score += 3;

      score += secondaryTopics.filter((topic: string) =>
        matchedThemes.includes(topic)
      ).length;

      score += versePrinciples.filter((principle: string) =>
        matchedPrinciples.includes(principle)
      ).length;

      if (matchedThemes.length === 0 && verse.is_general_daily) score += 2;

      return { verse, score };
    })
    .sort((a, b) => b.score - a.score);

  const topCandidates = scoredCandidates.slice(0, 5).map((item) => item.verse);

  let selected =
    topCandidates[Math.floor(Math.random() * topCandidates.length)] ??
    usableCandidates[0];

   if (!selected) {
    const { data: fallbackVerse } = await supabase
      .from("bible_verses")
      .select("*")
      .eq("active", true)
      .eq("reference", "Lamentations 3:22-23")
      .maybeSingle();

    selected = fallbackVerse ?? {
      reference: "Lamentations 3:22-23",
      verse_text: "Because of the Lord’s faithful love we do not perish, for his mercies never end. They are fresh every morning; your faithfulness is abundant!",
      primary_topic: "hope",
      secondary_topics: ["hope", "mercy", "steadiness"],
      principles: ["grace", "hope", "God's faithfulness"],
    };
  }

  return {
    verseReference: selected.reference,
    verseText: selected.verse_text,
    mode: matchedThemes.length > 0 ? "matched" as const : "general" as const,
    themes: matchedThemes,
    principles: Array.isArray(selected.principles) && selected.principles.length > 0
      ? selected.principles
      : matchedPrinciples,
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
    const type = (body?.type ?? "prayer") as EntryType;
    const text = body?.text ?? "";
    const forceRegenerate = body?.forceRegenerate === true;
    const activeEntries = Array.isArray(body?.activeEntries) ? body.activeEntries : [];
    console.log("MM_REGENERATE_CHECK_V1", {
  mode,
  forceRegenerate,
  hasActiveEntries: Array.isArray(activeEntries),
  activeEntriesCount: activeEntries.length,
});

    if (mode === "write") {
      const sentenceLimit = countIntendedSentences(text);
      const prompt = buildWritePrompt(type, text, sentenceLimit);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
                "You help users gently polish prayers, gratitude reflections, affirmations, and goals while preserving their original intent and approximate length.",
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

      const data = await response.json();
      const textOutput = data?.choices?.[0]?.message?.content?.trim() ?? "";

      return new Response(JSON.stringify({ text: textOutput }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

        if (mode === "daily") {
      const today = new Date().toISOString().split("T")[0];

const { data: existingMessages, error: existingError } = await userSupabase
  .from("daily_messages")
  .select("id, message_index, message_text, verse_reference, verse_query, is_primary")
  .eq("user_id", user.id)
  .eq("message_date", today)
  .order("message_index", { ascending: true });

      if (existingError) {
        console.log("Existing daily messages lookup error:", existingError.message);
      }

            console.log("daily existingMessages check:", {
        forceRegenerate,
        existingCount: existingMessages?.length ?? 0,
      });

 const recentEntries = activeEntries
  .filter(
    (entry) =>
      entry &&
      typeof entry.type === "string" &&
      typeof entry.content === "string" &&
      entry.content.trim().length > 0
  )
  .slice(0, 8);

const { data: recentMessages, error: recentMessagesError } = await userSupabase
  .from("daily_messages")
  .select("verse_reference")
  .eq("user_id", user.id)
  .not("verse_reference", "is", null)
  .order("message_date", { ascending: false })
  .limit(60);

if (recentMessagesError) {
  console.log("Recent daily messages lookup error:", recentMessagesError.message);
}

const recentlyUsedVerses = (recentMessages ?? [])
  .map((item) => item.verse_reference)
  .filter(Boolean);

const selectedVerse = await chooseDailyVerse(
  userSupabase,
  recentEntries,
  recentlyUsedVerses
);

const prompt = buildDailyPrompt({
  verseReference: selectedVerse.verseReference,
  verseText: selectedVerse.verseText,
  mode: selectedVerse.mode,
  themes: selectedVerse.themes,
  principles: selectedVerse.principles,
  count: 1,
});

const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
          "You write short, grounded, emotionally honest Christian morning encouragement.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.8,
    max_tokens: 160,
  }),
});

const aiData = await aiResponse.json();
const rawOutput = aiData?.choices?.[0]?.message?.content?.trim() ?? "";

let parsed: any = null;

try {
  parsed = JSON.parse(rawOutput);
} catch {
  parsed = null;
}

const normalizedMessage =
  parsed &&
  typeof parsed.message === "string" &&
  parsed.message.trim().length > 0
    ? parsed.message.trim()
    : "God’s mercy is new this morning. Receive His grace, trust His presence, and take the next step in peace.";

const messageToSave = {
  user_id: user.id,
  message_date: today,
  message_text: normalizedMessage,
  verse_reference: selectedVerse.verseReference,
  verse_query: selectedVerse.verseReference,
};
const { error: upsertError } = await adminSupabase
  .from("daily_messages")
  .upsert(messageToSave, {
    onConflict: "user_id,message_date",
  });

if (upsertError) {
  console.log("Daily message upsert error:", upsertError.message);
}

return new Response(
  JSON.stringify({
    message: messageToSave.message_text,
    verse_reference: messageToSave.verse_reference,
    verse_query: messageToSave.verse_query,
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