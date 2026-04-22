import { Tabs } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";

type TabBarProps = {
  state: any;
  descriptors: any;
  navigation: any;
};

function getTabConfig(routeName: string) {
 if (routeName === "index") {
  return {
    label: "Home",
    icon: "house.fill" as const,
  };
}

  if (routeName === "reminders") {
    return {
      label: "Entries",
      icon: "list.bullet.rectangle.fill" as const,
    };
  }

  if (routeName === "explore") {
    return {
      label: "Reminders",
      icon: "bell.fill" as const,
    };
  }

  return {
    label: "Archive",
    icon: "archivebox.fill" as const,
  };
}

function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 28,
        alignItems: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
        }}
      >
<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 26,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(8,12,20,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  }}
>
          {state.routes.map((route: any, index: number) => {
            const isFocused = state.index === index;
            const { options } = descriptors[route.key];
            const config = getTabConfig(route.name);

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 52,
                  minWidth: 48,
                  paddingHorizontal: isFocused ? 16 : 12,
                  marginHorizontal: 3,
                  borderRadius: 999,
                  backgroundColor: isFocused ? "rgba(255,255,255,0.24)" : "transparent",
                }}
              >
                <IconSymbol
                  size={22}
                  name={config.icon}
                  color={isFocused ? "white" : "rgba(255,255,255,0.80)"}
                />

                {isFocused ? (
                  <Text
                    style={{
                      marginLeft: 8,
                      color: "white",
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {config.label}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        sceneStyle: {
          backgroundColor: "transparent",
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
        }}
      />

      <Tabs.Screen
        name="reminders"
        options={{
          title: "Entries",
        }}
      />

      <Tabs.Screen
        name="completed"
        options={{
          title: "Archive",
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: "Reminders",
        }}
      />
    </Tabs>
  );
}