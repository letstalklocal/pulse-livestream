// Public SDK key: safe in the app. Server secret keys must never be used here.
export const REVENUECAT_TEST_KEY = 'test_QKYTccFSvTndCakDDoyceNmngDl';
// Public Apple SDK key bundled for Publish paths that omit EAS environment values.
export const REVENUECAT_IOS_KEY = "appl_KnVTELIQbHnPWUMdANcMDywzGxn";
export const PRO_ENTITLEMENT = 'pulse_pro';

export function purchaseConfiguration(platform: string, development: boolean, env: {
  mode?: string; iosMode?: string; androidMode?: string; iosKey?: string; androidKey?: string;
}) {
  // Per-platform modes take priority. A shared Apple store setting must not
  // disable Android development; explicitly set androidMode for Play testing.
  const mode = platform === 'ios' ? (env.iosMode ?? env.mode)
    : platform === 'android' ? (env.androidMode ?? (development ? 'test' : env.mode)) : env.mode;
  const testStore = mode === 'test' || (!mode && development);
  const apiKey = testStore ? REVENUECAT_TEST_KEY : platform === 'ios' ? (env.iosKey || REVENUECAT_IOS_KEY) : env.androidKey;
  const supported = platform === 'ios' || platform === 'android';
  const validKey = testStore || !!apiKey?.startsWith(platform === 'ios' ? 'appl_' : 'goog_');
  return { testStore, apiKey: supported && validKey ? apiKey : undefined };
}

// Store SDKs serve both Apple/Google sandbox and live transactions. The backend
// advertises readiness and validates the actual environment on every webhook.
export function coinStoreAvailable(catalog: { enabled: boolean; environment: string } | undefined, testStore: boolean): boolean {
  return catalog?.enabled === true && (catalog.environment === 'SANDBOX' || (!testStore && catalog.environment === 'PRODUCTION'));
}
