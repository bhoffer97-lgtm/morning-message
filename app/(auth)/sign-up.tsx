import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
if (password.length < 8) {
  Alert.alert("Password too short", "Use at least 8 characters.");
  return;
}

if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
  Alert.alert(
    "Password needs more detail",
    "Use at least 8 characters with at least one letter and one number."
  );
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
  "Verify your email",
  "We sent a verification link to your email. After you verify it, return to Morning Message and sign in.",
  [
    {
      text: "Got it",
      onPress: () => router.replace("/(auth)/sign-in"),
    },
  ]
);
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
                  paddingTop: 56,
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

                  <View style={{ position: "relative", marginBottom: 14 }}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder="Password"
                    placeholderTextColor="#8b7a67"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(139,111,71,0.28)",
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingRight: 48,
                      paddingVertical: 13,
                      fontSize: 15,
                      color: "#2b2118",
                      backgroundColor: "rgba(255,255,255,0.9)",
                    }}
                  />

                  <Pressable
                    onPress={() => setShowPassword((current) => !current)}
                    hitSlop={8}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: 0,
                      bottom: 0,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <MaterialIcons
                      name={showPassword ? "visibility-off" : "visibility"}
                      size={22}
                      color="#8b7a67"
                    />
                  </Pressable>
                </View>

              <View style={{ position: "relative", marginBottom: 14 }}>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  placeholder="Confirm Password"
                  placeholderTextColor="#8b7a67"
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(139,111,71,0.28)",
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingRight: 48,
                    paddingVertical: 13,
                    fontSize: 15,
                    color: "#2b2118",
                    backgroundColor: "rgba(255,255,255,0.9)",
                  }}
                />

                <Pressable
                  onPress={() => setShowConfirmPassword((current) => !current)}
                  hitSlop={8}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 0,
                    bottom: 0,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <MaterialIcons
                    name={showConfirmPassword ? "visibility-off" : "visibility"}
                    size={22}
                    color="#8b7a67"
                  />
                </Pressable>
              </View>

                  <Pressable
                    onPress={handleSignUp}
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
                      {isWorking ? "Creating Account..." : "Create Account"}
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
                      Already have an account?
                    </Text>

                    <Pressable onPress={() => router.replace("/(auth)/sign-in")}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: "white",
                          textAlign: "center",
                        }}
                      >
                        Sign In
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