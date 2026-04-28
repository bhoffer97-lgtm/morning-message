import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ImageBackground,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    getPremiumEntitlement,
    getRevenueCatCustomerInfo,
    getRevenueCatManagementURL,
    restoreRevenueCatPurchases,
} from "../lib/subscriptions/revenueCat";
import { supabase } from "../lib/supabase";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getPlanLabel(productIdentifier: string | null | undefined) {
  const productId = String(productIdentifier ?? "").toLowerCase();

  if (productId.includes("year") || productId.includes("annual")) {
    return "Yearly";
  }

  if (productId.includes("month")) {
    return "Monthly";
  }

  return "Premium";
}

const accountBackground = require("../assets/images/morning-nature-10.jpg");

export default function AccountScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [accountEmail, setAccountEmail] = useState("");

  const entitlement = getPremiumEntitlement(customerInfo);
  const managementURL = getRevenueCatManagementURL(customerInfo);

  const planLabel = getPlanLabel(entitlement?.productIdentifier);
  const isPremium = entitlement?.isActive === true;

  async function loadAccount() {
    try {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setAccountEmail(user?.email ?? "Not available");

      const info = await getRevenueCatCustomerInfo();
      setCustomerInfo(info);
    } catch (error) {
      console.log("Load account subscription error:", error);
      Alert.alert("Could not load account", "Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadAccount();
    }, [])
  );

  async function openStoreSubscriptionSettings() {
    if (!managementURL) {
      Alert.alert(
        "Manage account",
        "Subscription management is not available yet. Once real app-store products are connected, this will open your Apple or Google subscription settings."
      );
      return;
    }

    const canOpen = await Linking.canOpenURL(managementURL);

    if (!canOpen) {
      Alert.alert("Could not open subscription settings", "Please try from your app store account.");
      return;
    }

    await Linking.openURL(managementURL);
  }

  async function handleRestoreAccess() {
    try {
      setIsRestoring(true);

      const restoredPremium = await restoreRevenueCatPurchases();

      await loadAccount();

      if (restoredPremium) {
        Alert.alert("Access restored", "Your existing subscription is now active.");
      } else {
        Alert.alert("No active subscription found", "We could not find an active subscription.");
      }
    } catch (error) {
      console.log("Restore access error:", error);
      Alert.alert("Could not restore access", "Please try again.");
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert("Could not sign out", error.message);
      return;
    }

    router.replace("/(auth)");
  }

 return (
  <ImageBackground source={accountBackground} resizeMode="cover" style={styles.safeArea}>
    <LinearGradient
      pointerEvents="none"
      colors={[
        "rgba(18,15,11,0.72)",
        "rgba(18,15,11,0.82)",
        "rgba(18,15,11,0.94)",
      ]}
      style={StyleSheet.absoluteFillObject}
    />

    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeContent}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backButton}>
            <MaterialIcons name="arrow-back-ios-new" size={20} color="#f5efe4" />
          </Pressable>

          <Text style={styles.headerTitle}>Account</Text>

          <View style={styles.headerSpacer} />
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Account Details</Text>

              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Email</Text>
                <Text style={styles.statusValue}>{accountEmail}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Current Subscription</Text>

              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Status</Text>
                <Text style={styles.statusValue}>{isPremium ? "Active" : "Not Active"}</Text>
              </View>

              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Plan</Text>
                <Text style={styles.statusValue}>{isPremium ? planLabel : "None"}</Text>
              </View>

              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Started</Text>
                <Text style={styles.statusValue}>
                  {formatDate(entitlement?.originalPurchaseDate)}
                </Text>
              </View>

              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Paid through</Text>
                <Text style={styles.statusValue}>
                  {formatDate(entitlement?.expirationDate)}
                </Text>
              </View>
            </View>

            <View style={styles.card}>

<Pressable onPress={openStoreSubscriptionSettings} style={styles.actionRow}>
  <Text style={styles.actionText}>Manage subscription</Text>
  <MaterialIcons name="chevron-right" size={24} color="#f5efe4" />
</Pressable>

              <Pressable
                onPress={handleRestoreAccess}
                disabled={isRestoring}
                style={[styles.secondaryActionRow, isRestoring && styles.disabledRow]}
              >
                <Text style={styles.secondaryActionText}>
                  {isRestoring ? "Restoring access..." : "Already subscribed? Restore access"}
                </Text>
                <MaterialIcons name="restore" size={20} color="rgba(245,239,228,0.76)" />
              </Pressable>
            </View>

            <View style={styles.card}>
              <Pressable onPress={handleSignOut} style={styles.actionRow}>
                <Text style={styles.actionText}>Sign out</Text>
                <MaterialIcons name="logout" size={22} color="#f5efe4" />
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  </ImageBackground>
);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#120f0b",
  },
  safeContent: {
  flex: 1,
  backgroundColor: "transparent",
},
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 34,
  },
  headerRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  backButton: {
    width: 52,
    height: 52,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#f5efe4",
    fontSize: 22,
    fontWeight: "800",
  },
  headerSpacer: {
    width: 52,
  },
  loadingWrap: {
    paddingTop: 40,
  },
  card: {
    backgroundColor: "rgba(245,239,228,0.08)",
    borderColor: "rgba(245,239,228,0.16)",
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
  },
  cardTitle: {
    color: "#f5efe4",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 8,
  },
  statusLabel: {
    color: "rgba(245,239,228,0.62)",
    fontSize: 14,
    fontWeight: "600",
  },
  statusValue: {
    color: "#f5efe4",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
    flex: 1,
  },
  actionRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 8,
  },
  secondaryActionRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingTop: 4,
    paddingBottom: 2,
  },
  disabledRow: {
    opacity: 0.55,
  },
  actionText: {
    color: "#f5efe4",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  secondaryActionText: {
    color: "rgba(245,239,228,0.76)",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(245,239,228,0.12)",
    marginVertical: 2,
  },
});