import { router } from "expo-router";
import { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }

    setIsWorking(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert("Sign in failed", error.message);
        return;
      }

      router.replace("/(tabs)");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 24,
          }}
        >
          <Text
            style={{
              fontSize: 24,
              fontWeight: "700",
              color: "#111827",
              marginBottom: 10,
            }}
          >
            Sign In
          </Text>

          <Text
            style={{
              fontSize: 14,
              lineHeight: 22,
              color: "#6b7280",
              marginBottom: 24,
            }}
          >
            Use the account you want your reminders, entries, and daily messages tied to.
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="#9ca3af"
            style={{
              borderWidth: 1,
              borderColor: "#d1d5db",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 15,
              color: "black",
              marginBottom: 12,
              backgroundColor: "white",
            }}
          />

          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            style={{
              borderWidth: 1,
              borderColor: "#d1d5db",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 15,
              color: "black",
              marginBottom: 18,
              backgroundColor: "white",
            }}
          />

          <Pressable
            onPress={handleSignIn}
            disabled={isWorking}
            style={{
              backgroundColor: isWorking ? "#93c5fd" : "#2563eb",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "white",
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              {isWorking ? "Signing In..." : "Sign In"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}