import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const curatedVerses = [
  "Psalm 23:1",
  "Psalm 23:4",
  "Psalm 27:1",
  "Psalm 34:8",
  "Psalm 37:4",
  "Psalm 46:1",
  "Psalm 46:10",
  "Psalm 55:22",
  "Psalm 62:5-6",
  "Psalm 91:1-2",
  "Psalm 119:105",

  "Proverbs 3:5-6",
  "Proverbs 16:3",

  "Isaiah 26:3",
  "Isaiah 40:29",
  "Isaiah 40:31",
  "Isaiah 41:10",
  "Isaiah 43:2",

  "Jeremiah 29:11",
  "Lamentations 3:22-23",

  "Matthew 5:16",
  "Matthew 6:33",
  "Matthew 11:28",
  "Matthew 19:26",

  "Luke 1:37",

  "John 8:12",
  "John 10:10",
  "John 14:27",
  "John 15:5",

  "Romans 8:28",
  "Romans 12:12",
  "Romans 15:13",

  "2 Corinthians 5:7",
  "2 Corinthians 12:9",

  "Galatians 6:9",

  "Ephesians 2:10",
  "Ephesians 3:20",

  "Philippians 1:6",
  "Philippians 4:6-7",
  "Philippians 4:13",

  "Colossians 3:23",

  "1 Thessalonians 5:16-18",

  "2 Timothy 1:7",

  "Hebrews 11:1",
  "Hebrews 12:1-2",
  "Hebrews 13:8",

  "James 1:5",
  "James 1:17",

  "1 Peter 5:7",

  "1 John 4:18"
];

type EntryType = "prayer" | "gratitude" | "affirmation" | "goal";
type MessageStyle = "verse" | "inspirational" | "both";

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

function buildDailyPrompt(
  messageStyle: MessageStyle,
  recentEntries: Array<{ type: string; content: string }>
) {
  const subtleContext =
    recentEntries.length > 0
      ? recentEntries
          .map((entry, index) => `${index + 1}. (${entry.type}) ${entry.content}`)
          .join("\n")
      : "No recent entries provided.";

  const styleInstruction =
    messageStyle === "verse"
      ? `
Choose ONE verse from the curated list below.

Do not invent a verse.
Do not choose a verse outside this list.

Curated verse options:
${curatedVerses.join(", ")}

After choosing the verse, write 1–2 short sentences that naturally reflect the meaning of that verse.

The reflection should sound like a thoughtful, encouraging explanation of the verse for today.

Avoid vague motivational language.
Use clear, natural English.

Return:
- the reflection message
- the verse_reference
- the verse_query

The message should feel hopeful, grounded, and Christian.
`
      : messageStyle === "inspirational"
      ? `
Create one short daily encouragement with no Bible verse and no explicit Christian wording.
Return:
- a motivational, encouraging message of 1-2 short sentences
- verse_reference as null
- verse_query as null

The message should feel hopeful, calm, uplifting, and broadly inspirational.
`
      : `
Create one short daily encouragement that blends inspirational tone with gentle Christian grounding.
Most days this may include a Bible verse reference, but keep it subtle and warm rather than preachy.
Return:
- a motivational, encouraging message of 1-2 short sentences
- a Bible verse reference when it fits naturally, otherwise null
- a short verse query matching the reference when a verse is included, otherwise null
`;

  return `
You are creating a daily morning message for a private app called Morning Message.

The app tone should be:
- motivational
- inspirational
- encouraging
- calm
- hopeful
- polished
- subtle
- concise
- natural

The message should feel like a brief daily nudge, not a paragraph.
Keep it compact enough to fit comfortably on a mobile home screen card.

Use plain, natural English.
Do not use awkward, poetic, overly dramatic, or unusual phrasing.
Avoid metaphors unless they are extremely simple and common.
Do not personify abstract ideas like uncertainty, fear, peace, hope, or doubt.
Write like a wise, grounded encourager speaking in a normal human voice.

Do not:
- directly mention or quote the user's private entries
- sound overly personalized or invasive
- sound preachy
- sound cheesy
- make big assumptions about the user's life
- use heavy religious language unless the style calls for it

Use the user's recent entries only as subtle background influence for tone and themes.
Do not reuse their exact wording.
Do not mention specific details from the entries.

${styleInstruction}

Recent entries for subtle inspiration:
${subtleContext}

Return valid JSON only in this exact shape:
{
  "message": "string",
  "verse_reference": "string or null",
  "verse_query": "string or null"
}
`;
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const token = authHeader.replace("Bearer ", "").trim();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

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

      const { data: existingMessage, error: existingError } = await supabase
        .from("daily_messages")
        .select("message_text, verse_reference, verse_query")
        .eq("user_id", user.id)
        .eq("message_date", today)
        .maybeSingle();

      if (existingError) {
        console.log("Existing daily message lookup error:", existingError.message);
      }

      if (existingMessage) {
        return new Response(
          JSON.stringify({
            message: existingMessage.message_text,
            verse_reference: existingMessage.verse_reference,
            verse_query: existingMessage.verse_query,
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      let messageStyle: MessageStyle = "both";

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("message_style")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileError && profileData?.message_style) {
        messageStyle = profileData.message_style as MessageStyle;
      }

      const { data: recentEntries, error: entriesError } = await supabase
        .from("entries")
        .select("type, content")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(8);

      if (entriesError) {
        console.log("Recent entries lookup error:", entriesError.message);
      }

      const prompt = buildDailyPrompt(messageStyle, recentEntries ?? []);

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
                "You create brief, polished daily encouragement messages for a private journaling app. When asked, you return strict JSON only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.8,
          max_tokens: 220,
          response_format: {
            type: "json_object",
          },
        }),
      });

      const openAiData = await response.json();
      const rawContent = openAiData?.choices?.[0]?.message?.content ?? "{}";

      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        parsed = {
          message:
            "Take a steady breath and begin again with quiet confidence. Even small steps matter when they are taken with purpose and hope.",
          verse_reference: "Joshua 1:9",
          verse_query: "Joshua 1:9",
        };
      }

      const message = parsed?.message?.trim() ?? "";
      const verseReference = parsed?.verse_reference ?? null;
      const verseQuery = parsed?.verse_query ?? null;

      const { error: insertError } = await supabase.from("daily_messages").insert({
        user_id: user.id,
        message_date: today,
        message_text: message,
        verse_reference: verseReference,
        verse_query: verseQuery,
      });

      if (insertError) {
        console.log("Daily message insert error:", insertError.message);
      }

      return new Response(
        JSON.stringify({
          message,
          verse_reference: verseReference,
          verse_query: verseQuery,
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