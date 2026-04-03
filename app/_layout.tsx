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

export const unstable_settings = {
  anchor: "(tabs)",
};

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
  const isFinalizingAuthRef = useRef(false);

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

      if ((user as any).is_anonymous) {
        console.log("Signing out anonymous session before auth flow:", user.id);
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
    if (isFinalizingAuthRef.current) return;

    let cancelled = false;

    async function routeAndFinalize() {
      isFinalizingAuthRef.current = true;

      try {
        const currentUser = session?.user ?? null;
        const inAuthGroup = segments[0] === "(auth)";

        if (!currentUser) {
          if (!inAuthGroup && !cancelled) {
            router.replace("/(auth)");
          }
          return;
        }

        const {
          data: { user: verifiedUser },
          error: verifiedUserError,
        } = await supabase.auth.getUser();

        if (verifiedUserError || !verifiedUser) {
          console.log("Verified user lookup failed, signing out:", verifiedUserError?.message);
          await supabase.auth.signOut();
          if (!cancelled) {
            router.replace("/(auth)");
          }
          return;
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({ id: verifiedUser.id }, { onConflict: "id" });

        if (profileError) {
          console.log("Ensure profile error:", profileError.message);
        }

        const { error: ensureSchedulesError } = await supabase.rpc(
          "ensure_default_reminder_schedules",
          {
            p_user_id: verifiedUser.id,
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

        if (inAuthGroup && !cancelled) {
          router.replace("/(tabs)");
        }
      } finally {
        isFinalizingAuthRef.current = false;
      }
    }

    routeAndFinalize();

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, session?.user?.id, segments, router]);

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