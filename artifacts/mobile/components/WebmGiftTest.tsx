// Web and other non-native clients never load the test player or video asset.
export function WebmGiftTest(_props: { onDone: () => void }) { return null; }
export async function preloadWebmGiftTest(): Promise<void> {}
