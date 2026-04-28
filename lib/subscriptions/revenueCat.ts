import Purchases, { CustomerInfo, LOG_LEVEL } from "react-native-purchases";

const REVENUECAT_API_KEY = "test_ayNWTLetwXcKnnwnILwbgRBNfZl";
const PREMIUM_ENTITLEMENT_ID = "Morning Message Premium";

let hasConfiguredRevenueCat = false;
let configuredUserId: string | null = null;

export function isPremiumCustomerInfo(customerInfo: CustomerInfo | null | undefined) {
  if (!customerInfo) return false;

  return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID]?.isActive === true;
}

export function getPremiumEntitlement(customerInfo: CustomerInfo | null | undefined) {
  if (!customerInfo) return null;

  return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] ?? null;
}

export function getRevenueCatManagementURL(customerInfo: CustomerInfo | null | undefined) {
  if (!customerInfo) return null;

  const managementURL = (customerInfo as any).managementURL;

  return typeof managementURL === "string" && managementURL.length > 0
    ? managementURL
    : null;
}

export async function configureRevenueCat(userId: string) {
  if (!userId) {
    return;
  }

  if (!hasConfiguredRevenueCat) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);

    Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId,
    });

    hasConfiguredRevenueCat = true;
    configuredUserId = userId;
    return;
  }

  if (configuredUserId !== userId) {
    await Purchases.logIn(userId);
    configuredUserId = userId;
  }
}

export async function getRevenueCatCustomerInfo() {
  if (!hasConfiguredRevenueCat) {
    return null;
  }

  return await Purchases.getCustomerInfo();
}

export async function getPremiumStatus() {
  const customerInfo = await getRevenueCatCustomerInfo();
  return isPremiumCustomerInfo(customerInfo);
}

export async function restoreRevenueCatPurchases() {
  const customerInfo = await Purchases.restorePurchases();
  return isPremiumCustomerInfo(customerInfo);
}

export async function logRevenueCatOfferings() {
  if (!hasConfiguredRevenueCat) {
    console.log("RevenueCat offerings check skipped: not configured");
    return;
  }

  const offerings = await Purchases.getOfferings();

  const currentOffering = offerings.current;

  console.log("RevenueCat current offering:", currentOffering?.identifier ?? "none");

  console.log(
    "RevenueCat available packages:",
    currentOffering?.availablePackages?.map((pkg) => ({
      identifier: pkg.identifier,
      packageType: pkg.packageType,
      productIdentifier: pkg.product.identifier,
      title: pkg.product.title,
      priceString: pkg.product.priceString,
    })) ?? []
  );
}

export async function getCurrentRevenueCatOffering() {
  if (!hasConfiguredRevenueCat) {
    console.log("RevenueCat offering check skipped: not configured");
    return null;
  }

  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export async function purchaseRevenueCatPackage(packageToPurchase: any) {
  const purchaseResult = await Purchases.purchasePackage(packageToPurchase);
  return isPremiumCustomerInfo(purchaseResult.customerInfo);
}