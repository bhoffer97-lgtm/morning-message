import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, ImageBackground, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const authBackground = require("../../../assets/images/morning-nature-10.jpg");

export default function AuthCallbackScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace({
        pathname: "/(auth)/sign-in",
        params: {
          verified: "1",
        },
      });
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ImageBackground source={authBackground} resizeMode="cover" style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.34)" }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 24,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 320,
                backgroundColor: "rgba(255,255,255,0.9)",
                borderRadius: 24,
                padding: 24,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(139,111,71,0.22)",
              }}
            >
              <ActivityIndicator />

              <Text
                style={{
                  marginTop: 16,
                  fontSize: 16,
                  fontWeight: "700",
                  color: "#4e3b27",
                  textAlign: "center",
                }}
              >
                Opening Morning Message...
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}