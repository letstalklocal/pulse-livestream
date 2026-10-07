import type { GiftSnapshot } from "./giftCatalog";

// Web has no native broadcaster engine.
export async function playPublishedCatalogGiftSound(_engine: any, _snapshot: GiftSnapshot, _isCurrent: () => boolean): Promise<void> {}
export function stopPublishedCatalogGiftSounds(_engine: any): void {}
