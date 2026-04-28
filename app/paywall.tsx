import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getCurrentRevenueCatOffering,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
} from "../lib/subscriptions/revenueCat";
import { supabase } from "../lib/supabase";

function getPackageDisplayInfo(pkg: any) {
  const packageType = String(pkg?.packageType ?? "").toLowerCase();
  const packageId = String(pkg?.identifier ?? "").toLowerCase();
  const productId = String(pkg?.product?.identifier ?? "").toLowerCase();

  const combined = `${packageType} ${packageId} ${productId}`;

  const isYearly =
    combined.includes("annual") ||
    combined.includes("year") ||
    combined.includes("yearly");

  const isMonthly =
    combined.includes("monthly") ||
    combined.includes("month");

  if (isYearly) {
    return {
      title: "Yearly",
      subtitle: "14-day free trial, then $19.99/year",
    };
  }

  if (isMonthly) {
      return {
        title: "Monthly",
        subtitle: "14-day free trial, then $1.99/month",
      };
  }

  return {
    title: pkg?.product?.title,
    subtitle: "14-day free trial",
  };
}

const paywallBackground = require("../assets/images/morning-nature-10.jpg");

export default function PaywallScreen() {
  const params = useLocalSearchParams<{ source?: string }>();
  const canClosePaywall = params.source === "manual";

  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    loadOffering();
  }, []);
useEffect(() => {
  if (canClosePaywall) {
    return;
  }

  const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);

  return () => {
    subscription.remove();
  };
}, [canClosePaywall]);
  async function loadOffering() {
    try {
      setLoading(true);

      const offering = await getCurrentRevenueCatOffering();
      setPackages(offering?.availablePackages ?? []);
    } catch (error) {
      console.log("Paywall offering load error:", error);
      Alert.alert("Subscription unavailable", "Could not load subscription options.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchase(packageToPurchase: any) {
    try {
      setPurchasing(true);

      const isPremium = await purchaseRevenueCatPackage(packageToPurchase);

      if (isPremium) {
        router.replace("/(tabs)");
      } else {
Alert.alert(
  "Subscription needs review",
  "Your purchase completed, but Premium access was not activated. Please tap Restore Access or contact support."
);
      }
    } catch (error: any) {
      if (error?.userCancelled) {
        return;
      }

      console.log("RevenueCat purchase error:", error);
      Alert.alert("Purchase failed", "Something went wrong while starting the purchase.");
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    try {
      setPurchasing(true);

      const isPremium = await restoreRevenueCatPurchases();

      if (isPremium) {
        router.replace("/(tabs)");
      } else {
        Alert.alert("No subscription found", "No active subscription was found.");
      }
    } catch (error) {
      console.log("RevenueCat restore error:", error);
      Alert.alert("Restore failed", "Could not restore purchases.");
    } finally {
      setPurchasing(false);
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
  <ImageBackground source={paywallBackground} resizeMode="cover" style={styles.safeArea}>
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
        {canClosePaywall ? (
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        ) : (
          <View style={styles.gateSpacer} />
        )}
        

        <Text style={styles.title}>Morning Message</Text>

        <Text style={styles.priceLine}>
          Start with a 14-day free trial, then continue monthly or yearly.
        </Text>

        <Text style={styles.cancelText}>Cancel anytime</Text>

        <View style={styles.card}>
          <Text style={styles.bullet}>• Daily Inspirational Morning Messages w/ scripture</Text>
          <Text style={styles.bullet}>• Journal and set notifications for Prayers, goals, affirmations, and reminders</Text>
          <Text style={styles.bullet}>• AI writing help for journal entries</Text>
          <Text style={styles.bullet}>• Check off style 'To Do' list for staying organized</Text>
        </View>
        <Text style={styles.subtitle}>Choose your plan</Text>
        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : packages.length === 0 ? (
          <Text style={styles.emptyText}>No subscription options are available.</Text>
        ) : (
          packages.map((pkg) => {
            const displayInfo = getPackageDisplayInfo(pkg);

            return (
              <Pressable
                key={pkg.identifier}
                disabled={purchasing}
                onPress={() => handlePurchase(pkg)}
                style={({ pressed }) => [
                  styles.packageButton,
                  pressed && styles.packageButtonPressed,
                  purchasing && styles.disabledButton,
                ]}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <View style={styles.packageTitleRow}>
                    <Text style={styles.packageTitle}>{displayInfo.title}</Text>

                    {displayInfo.title === "Yearly" ? (
                      <View style={styles.bestValueBadge}>
                        <Text style={styles.bestValueText}>Best Value</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.packageSubtitle}>{displayInfo.subtitle}</Text>
                </View>

                <Text style={styles.packagePrice}>{pkg.product.priceString}</Text>
              </Pressable>
            );
          })
        )}

        <Pressable
          disabled={purchasing}
          onPress={handleRestore}
          style={({ pressed }) => [
            styles.restoreButton,
            pressed && styles.restoreButtonPressed,
            purchasing && styles.disabledButton,
          ]}
        >
        <Text style={styles.restoreText}>Already subscribed? Restore access</Text>
        </Pressable>

        {!canClosePaywall ? (
  <Pressable
    disabled={purchasing}
    onPress={handleSignOut}
    style={({ pressed }) => [
      styles.signOutButton,
      pressed && styles.restoreButtonPressed,
      purchasing && styles.disabledButton,
    ]}
  >
    <Text style={styles.signOutText}>Use a different account</Text>
  </Pressable>
) : null}

        <Text style={styles.footerText}>
          Trial and billing are managed through the app store subscription process.
        </Text>
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
  paddingHorizontal: 22,
  paddingTop: 8,
  paddingBottom: 36,
},
  closeButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  closeText: {
    color: "#f5efe4",
    fontSize: 16,
    fontWeight: "600",
  },
  gateSpacer: {
    height: 12,
    marginBottom: 6,
  },
  title: {
    color: "#f5efe4",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 10,
  },
  subtitle: {
    color: "#f5efe4",
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "800",
    marginBottom: 8,
  },
  priceLine: {
    color: "rgba(245,239,228,0.82)",
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 4,
  },
  cancelText: {
    color: "rgba(245,239,228,0.68)",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 22,
  },
  card: {
    backgroundColor: "rgba(245,239,228,0.08)",
    borderColor: "rgba(245,239,228,0.16)",
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 22,
  },
  cardTitle: {
    color: "#f5efe4",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  bullet: {
    color: "rgba(245,239,228,0.8)",
    fontSize: 15,
    lineHeight: 24,
  },
  loading: {
    marginVertical: 20,
  },
  emptyText: {
    color: "rgba(245,239,228,0.72)",
    fontSize: 15,
    marginBottom: 16,
  },
  packageButton: {
    backgroundColor: "#f5efe4",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packageButtonPressed: {
    opacity: 0.88,
  },
  disabledButton: {
    opacity: 0.6,
  },
  packageTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  packageTitle: {
    color: "#1f1710",
    fontSize: 17,
    fontWeight: "800",
  },
  bestValueBadge: {
    backgroundColor: "#1f1710",
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  bestValueText: {
    color: "#f5efe4",
    fontSize: 10,
    fontWeight: "900",
  },
  packageSubtitle: {
    color: "rgba(31,23,16,0.58)",
    fontSize: 12,
    marginTop: 4,
  },
  packagePrice: {
    color: "#1f1710",
    fontSize: 16,
    fontWeight: "800",
  },
  restoreButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(245,239,228,0.32)",
    paddingVertical: 15,
    marginTop: 6,
  },
  restoreButtonPressed: {
    backgroundColor: "rgba(245,239,228,0.08)",
  },
  restoreText: {
    color: "#f5efe4",
    fontSize: 15,
    fontWeight: "700",
  },
  signOutButton: {
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 13,
  marginTop: 4,
},
signOutText: {
  color: "rgba(245,239,228,0.72)",
  fontSize: 14,
  fontWeight: "700",
},
  footerText: {
    color: "rgba(245,239,228,0.5)",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
    textAlign: "center",
  },
});