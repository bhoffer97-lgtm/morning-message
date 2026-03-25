import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
  screenOptions={{
  tabBarActiveTintColor: "#2e6cff",
  tabBarInactiveTintColor: "#666",
  headerShown: false,
  tabBarButton: HapticTab,
  tabBarLabelStyle: {
  fontSize: 11,
  fontWeight: "600",
  marginTop: -25,
},
tabBarStyle: {
  backgroundColor: "white",
  borderTopWidth: 0,
  elevation: 0,
  shadowOpacity: 0,
  height: 58,
  paddingBottom: 6,
},
  tabBarItemStyle: {
  marginHorizontal: 6,
  borderRadius: 10,
  paddingVertical: 6,
  justifyContent: "center",
},
}}
>
      <Tabs.Screen
        name="index"
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (navigation.isFocused()) {
              e.preventDefault();
              navigation.navigate("index", {
                resetHomeAt: Date.now(),
              });
            }
          },
        })}
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="sun.max.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Reminders",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="completed"
        options={{
          title: "Archived",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.circle.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}