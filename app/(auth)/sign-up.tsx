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

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  async function handleSignUp() {
    if (!email.trim() || !password || !confirmPassword) {
      Alert.alert("Missing info", "Fill out all fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Make sure both passwords match.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Password too short", "Use at least 6 characters.");
      return;
    }

    setIsWorking(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert("Sign up failed", error.message);
        return;
      }

      if (data.session) {
        router.replace("/(tabs)");
        return;
      }

      Alert.alert(
        "Check your email",
        "Your account was created. If email confirmation is enabled, verify your email and then sign in."
      );
      router.replace("/(auth)/sign-in");
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
            Create Account
          </Text>

          <Text
            style={{
              fontSize: 14,
              lineHeight: 22,
              color: "#6b7280",
              marginBottom: 24,
            }}
          >
            Create the account you want this app tied to long term.
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
              marginBottom: 12,
              backgroundColor: "white",
            }}
          />

          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Confirm password"
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
            onPress={handleSignUp}
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
              {isWorking ? "Creating Account..." : "Create Account"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}