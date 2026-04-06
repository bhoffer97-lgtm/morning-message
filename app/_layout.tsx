import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { LogBox, View } from "react-native";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { syncLocalNotifications } from "../lib/notifications/syncNotifications";
import { supabase } from "../lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();

  const [isAuthReady, setIsAuthReady] = useState(false);
  const [session, setSession] = useState<any>(null);
  const hasRunPostAuthSetupForUserRef = useRef<string | null>(null);

  useEffect(() => {
    LogBox.ignoreLogs([
      "expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53. Use a development build instead of Expo Go.",
      "expo-notifications: Android Push notifications",
    ]);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function resolveValidSession(candidateSession: any) {
      if (!candidateSession?.access_token) {
        return null;
      }

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(candidateSession.access_token);

      if (error || !user) {
        console.log("Invalid stored session, signing out:", error?.message);
        await supabase.auth.signOut();
        return null;
      }

      return candidateSession;
    }

    async function bootstrapSession() {
      const {
        data: { session: storedSession },
      } = await supabase.auth.getSession();

      const validSession = await resolveValidSession(storedSession);

      if (!isMounted) return;

      setSession(validSession);
      setIsAuthReady(true);
    }

    bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const validSession = await resolveValidSession(nextSession);

      if (!isMounted) return;

      setSession(validSession);
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const currentUser = session?.user ?? null;
    const inAuthGroup = segments[0] === "(auth)";

    if (!currentUser) {
      hasRunPostAuthSetupForUserRef.current = null;

      syncLocalNotifications().catch((error) => {
        console.log("No-session notification sync error:", error);
      });

      if (!inAuthGroup) {
        router.replace("/(auth)");
      }
      return;
    }

    if (inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isAuthReady, session?.user?.id, segments]);

  useEffect(() => {
    if (!isAuthReady) return;

    const currentUserId = session?.user?.id ?? null;

    if (!currentUserId) {
      return;
    }

    if (hasRunPostAuthSetupForUserRef.current === currentUserId) {
      return;
    }

    hasRunPostAuthSetupForUserRef.current = currentUserId;

    async function runPostAuthSetup() {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: currentUserId }, { onConflict: "id" });

      if (profileError) {
        console.log("Ensure profile error:", profileError.message);
      }

      const { error: ensureSchedulesError } = await supabase.rpc(
        "ensure_default_reminder_schedules",
        {
          p_user_id: currentUserId,
        }
      );

      if (ensureSchedulesError) {
        console.log(
          "Ensure default reminder schedules after auth error:",
          ensureSchedulesError.message
        );
      }

      try {
        await syncLocalNotifications();
      } catch (syncError) {
        console.log("Post-auth notification sync error:", syncError);
      }
    }

    runPostAuthSetup();
  }, [isAuthReady, session?.user?.id]);

  if (!isAuthReady) {
    return <View style={{ flex: 1, backgroundColor: "white" }} />;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="compose"
          options={{
            headerShown: true,
            title: "Morning Message",
            headerBackTitle: "Back",
          }}
        />
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}