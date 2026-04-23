import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const authBackground = require("../../assets/images/morning-nature-10.jpg");

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
    <ImageBackground source={authBackground} resizeMode="cover" style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.34)" }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: 24,
                paddingTop: 30,
                paddingBottom: 32,
              }}
            >
              <Text
                style={{
                  fontSize: 36,
                  fontWeight: "700",
                  color: "#4e3b27",
                  textAlign: "center",
                  marginTop: 56,
                  marginBottom: 0,
                  textShadowColor: "rgba(255,255,255,0.18)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 3,
                }}
              >
                Morning Message
              </Text>

              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  paddingTop: 70,
                  width: "100%",
                  alignItems: "center",
                }}
              >
                <View style={{ width: 320 }}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor="#8b7a67"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(139,111,71,0.28)",
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 13,
                      fontSize: 15,
                      color: "#2b2118",
                      marginBottom: 12,
                      backgroundColor: "rgba(255,255,255,0.9)",
                    }}
                  />

                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="Password"
                    placeholderTextColor="#8b7a67"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(139,111,71,0.28)",
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 13,
                      fontSize: 15,
                      color: "#2b2118",
                      marginBottom: 14,
                      backgroundColor: "rgba(255,255,255,0.9)",
                    }}
                  />

                  <Pressable
                    onPress={handleSignIn}
                    disabled={isWorking}
                    style={{
                      width: 320,
                      backgroundColor: isWorking ? "#b59a75" : "#8b6f47",
                      borderRadius: 14,
                      paddingVertical: 15,
                      alignItems: "center",
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.55)",
                    }}
                  >
                    <Text
                      style={{
                        color: "#fffaf2",
                        fontSize: 15,
                        fontWeight: "700",
                      }}
                    >
                      {isWorking ? "Signing In..." : "Sign In"}
                    </Text>
                  </Pressable>

                  <View
                    style={{
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: "white",
                        textAlign: "center",
                        marginBottom: 4,
                      }}
                    >
                      Don't have an account?
                    </Text>

                    <Pressable onPress={() => router.replace("/(auth)/sign-up")}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: "white",
                          textAlign: "center",
                        }}
                      >
                        Create Account
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}