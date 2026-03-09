import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://eyjocmgkqhsjwizsjutg.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5am9jbWdrcWhzandpenNqdXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDk1MTQsImV4cCI6MjA4ODMyNTUxNH0.g8hCnDaz_K89j8641gvwrGxHiZ0wGFFaFA7505K_XtI";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function createEntry(type: "prayer" | "affirmation", content: string) {
  const { data: userData } = await supabase.auth.getUser();

  const user = userData?.user;

  if (!user) {
    throw new Error("User not logged in");
  }

  const { data, error } = await supabase
    .from("entries")
    .insert({
      user_id: user.id,
      type: type,
      content: content,
    })
    .select();

  if (error) {
    console.error("Error creating entry:", error);
    throw error;
  }

  return data;
}