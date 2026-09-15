// Public SDK key: safe in the app. Server secret keys must never be used here.
export const REVENUECAT_TEST_KEY = 'test_QKYTccFSvTndCakDDoyceNmngDl';
export const PRO_ENTITLEMENT = 'pulse_pro';

export function purchaseConfiguration(platform: string, development: boolean, env: {
  mode?: string; iosKey?: string; androidKey?: string;
}) {
  const testStore = env.mode === 'test' || (!env.mode && development);
  const apiKey = testStore ? REVENUECAT_TEST_KEY : platform === 'ios' ? env.iosKey : env.androidKey;
  const supported = platform === 'ios' || platform === 'android';
  const validKey = testStore || !!apiKey?.startsWith(platform === 'ios' ? 'appl_' : 'goog_');
  return { testStore, apiKey: supported && validKey ? apiKey : undefined };
}
