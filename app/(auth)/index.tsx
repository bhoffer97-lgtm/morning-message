import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AuthIndexScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingVertical: 32,
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 30,
            fontWeight: "700",
            color: "#111827",
            textAlign: "center",
            marginBottom: 14,
          }}
        >
          Morning Message
        </Text>

        <Text
          style={{
            fontSize: 16,
            lineHeight: 24,
            color: "#4b5563",
            textAlign: "center",
            marginBottom: 30,
          }}
        >
          Sign in to keep your reminders, entries, and daily messages attached to one account.
        </Text>

        <Pressable
          onPress={() => router.push("/(auth)/sign-in")}
          style={{
            backgroundColor: "#2563eb",
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              color: "white",
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            Sign In
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/(auth)/sign-up")}
          style={{
            backgroundColor: "#eff6ff",
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              color: "#1d4ed8",
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            Create Account
          </Text>
        </Pressable>

        <Text
          style={{
            fontSize: 13,
            lineHeight: 20,
            color: "#6b7280",
            textAlign: "center",
          }}
        >
          Google and Apple can come next after email/password is working cleanly.
        </Text>
      </View>
    </SafeAreaView>
  );
}