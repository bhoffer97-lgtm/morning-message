import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="sign-in"
        options={{
          title: "Sign In",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="sign-up"
        options={{
          title: "Create Account",
          headerBackTitle: "Back",
        }}
      />
    </Stack>
  );
}