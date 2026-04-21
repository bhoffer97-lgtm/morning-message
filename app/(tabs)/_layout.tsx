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
      icon: "sun.max.fill" as const,
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
          gap: 12,
        }}
      >
<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(17,24,39,0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
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
                  minHeight: 46,
                  minWidth: 42,
                  paddingHorizontal: isFocused ? 14 : 10,
                  marginHorizontal: 2,
                  borderRadius: 999,
                  backgroundColor: isFocused ? "rgba(255,255,255,0.18)" : "transparent",
                }}
              >
                <IconSymbol
                  size={20}
                  name={config.icon}
                  color={isFocused ? "white" : "rgba(255,255,255,0.72)"}
                />

                {isFocused ? (
                  <Text
                    style={{
                      marginLeft: 8,
                      color: "white",
                      fontSize: 12,
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

        <Pressable
          onPress={() => navigation.navigate("/compose", { mode: "create" })}
          style={{
            width: 62,
            height: 62,
            borderRadius: 31,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(247,239,222,0.98)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.86)",
            shadowColor: "#000",
            shadowOpacity: 0.24,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 14,
          }}
        >
          <IconSymbol size={24} name="square.and.pencil" color="#8b6f47" />
        </Pressable>
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