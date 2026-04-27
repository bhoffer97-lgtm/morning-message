import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type StagingRow = {
  id: number;
  reference: string;
  verse_text: string;
  message_text: string;
  notes: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanString(item))
      .filter(Boolean)
      .slice(0, 5)
      .join(", ");
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join(", ");
  }

  return "";
}

function cleanBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return true;
}

function parseJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey || !openAiKey) {
      return new Response(
        JSON.stringify({ error: "Missing required environment variables." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit ?? 25), 100);
    const importAfterTagging = body?.import_after_tagging === true;

    const { data: rows, error: rowError } = await supabase
      .from("message_import_staging")
      .select("id, reference, verse_text, message_text, notes")
      .eq("tagging_status", "pending")
      .order("id", { ascending: true })
      .limit(limit);

    if (rowError) {
      return new Response(
        JSON.stringify({ error: rowError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const stagingRows = (rows ?? []) as StagingRow[];

 if (stagingRows.length === 0 && !importAfterTagging) {
  return new Response(
    JSON.stringify({ processed: 0, tagged: 0, failed: 0 }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

    const [{ data: topics }, { data: principles }, { data: tones }, { data: intensities }, { data: useCases }] =
      await Promise.all([
        supabase.from("verse_topics").select("key, label").order("key"),
        supabase.from("verse_principles").select("key, label").order("key"),
        supabase.from("verse_tones").select("key, label").order("key"),
        supabase.from("verse_intensities").select("key, label").order("key"),
        supabase.from("verse_use_cases").select("key, label").order("key"),
      ]);

    const allowedTopics = (topics ?? []).map((item: any) => item.key).filter(Boolean);
    const allowedPrinciples = (principles ?? []).map((item: any) => item.key).filter(Boolean);
    const allowedTones = (tones ?? []).map((item: any) => item.key).filter(Boolean);
    const allowedIntensities = (intensities ?? []).map((item: any) => item.key).filter(Boolean);
    const allowedUseCases = (useCases ?? []).map((item: any) => item.key).filter(Boolean);

    let tagged = 0;
    let failed = 0;

    for (const row of stagingRows) {
      try {
        const prompt = `
Tag this Morning Message row for selection logic.

Use only the allowed values when possible.

Allowed primary_topic / secondary_topics:
${allowedTopics.join(", ") || "guidance, trust, gratitude, peace, strength, hope, identity, forgiveness, purpose, family"}

Allowed principles:
${allowedPrinciples.join(", ") || "trust, gratitude, joy, guidance, peace, surrender, courage, hope, wisdom, faithfulness"}

Allowed tone:
${allowedTones.join(", ") || "calm, uplifting, reflective, steady, gentle"}

Allowed intensity:
${allowedIntensities.join(", ") || "gentle, medium, strong"}

Allowed use_cases:
${allowedUseCases.join(", ") || "morning, gratitude, trust, anxiety, direction, encouragement, perseverance"}

Reference:
${row.reference}

Verse:
${row.verse_text}

Morning Message:
${row.message_text}

Notes:
${row.notes ?? ""}

Rules:
- Do not rewrite the verse or message.
- Choose one primary_topic.
- Choose 2 to 4 secondary_topics.
- Choose 2 to 4 principles.
- Choose one tone.
- Choose one intensity.
- Choose 2 to 4 use_cases.
- is_general_daily should usually be true if the message is broadly useful for many users on an ordinary morning.
- Return only valid JSON.

Return this JSON shape:
{
  "primary_topic": "...",
  "secondary_topics": ["...", "..."],
  "principles": ["...", "..."],
  "tone": "...",
  "intensity": "...",
  "use_cases": ["...", "..."],
  "is_general_daily": true
}
`;

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
                  "You classify short faith-based Morning Message content using concise, consistent tags. Return only valid JSON.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature: 0.2,
            max_tokens: 220,
          }),
        });

        const aiData = await aiResponse.json();
        const rawContent = aiData?.choices?.[0]?.message?.content ?? "";
        const parsed = parseJsonObject(rawContent);

        const updatePayload = {
          primary_topic: cleanString(parsed.primary_topic),
          secondary_topics: cleanList(parsed.secondary_topics),
          principles: cleanList(parsed.principles),
          tone: cleanString(parsed.tone),
          intensity: cleanString(parsed.intensity),
          use_cases: cleanList(parsed.use_cases),
          is_general_daily: cleanBoolean(parsed.is_general_daily),
          tagging_status: "tagged",
          tagged_at: new Date().toISOString(),
          tagging_error: null,
        };

        const { error: updateError } = await supabase
          .from("message_import_staging")
          .update(updatePayload)
          .eq("id", row.id);

        if (updateError) throw updateError;

        tagged += 1;
      } catch (error) {
        failed += 1;

        await supabase
          .from("message_import_staging")
          .update({
            tagging_status: "failed",
            tagging_error: error instanceof Error ? error.message : String(error),
          })
          .eq("id", row.id);
      }
    }

 let importResult = null;
let importSkippedReason = null;

if (importAfterTagging) {
  const { count: pendingCount, error: pendingError } = await supabase
    .from("message_import_staging")
    .select("id", { count: "exact", head: true })
    .eq("tagging_status", "pending");

  const { count: failedCount, error: failedCountError } = await supabase
    .from("message_import_staging")
    .select("id", { count: "exact", head: true })
    .eq("tagging_status", "failed");

  if (pendingError || failedCountError) {
    importSkippedReason =
      pendingError?.message || failedCountError?.message || "Could not verify tagging status.";
  } else if ((pendingCount ?? 0) > 0) {
    importSkippedReason = `${pendingCount} staging row(s) still need tagging.`;
  } else if ((failedCount ?? 0) > 0 || failed > 0) {
    importSkippedReason = `${failedCount ?? failed} staging row(s) failed tagging.`;
  } else {
    const { data: importData, error: importError } = await supabase.rpc(
      "import_message_staging"
    );

    if (importError) {
      importSkippedReason = importError.message;
    } else {
      importResult = Array.isArray(importData) ? importData[0] : importData;
    }
  }
}

return new Response(
  JSON.stringify({
    processed: stagingRows.length,
    tagged,
    failed,
    import_after_tagging: importAfterTagging,
    import_result: importResult,
    import_skipped_reason: importSkippedReason,
  }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});