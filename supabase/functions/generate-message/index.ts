// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import OpenAI from "https://deno.land/x/openai@v4.52.7/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

Deno.serve(async () => {

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You generate short encouraging morning messages rooted in biblical wisdom. 
Return JSON in this format:
{
 "message": "...",
 "verse_reference": "Book Chapter:Verse"
}`
      }
    ],
  })

  const text = completion.choices[0].message.content!

  const result = JSON.parse(text)

  await supabase.from("daily_messages").insert({
    message: result.message,
    verse_reference: result.verse_reference
  })

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  )
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-message' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
