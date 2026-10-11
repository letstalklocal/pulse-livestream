export type GiftDeliveryFeed = { id: string; channelName: string; publisherUid: number };
export type ServerGiftDelivery = { sessionId: string; channelId: string; recipientUid: number; durationMs: number };
export function deliveryFeed(value: unknown): GiftDeliveryFeed | null {
  const feed = value as GiftDeliveryFeed | null;
  return feed && typeof feed.id === "string" && typeof feed.channelName === "string" && Number.isSafeInteger(feed.publisherUid) ? feed : null;
}
export function giftIsInServerFeed(delivery: ServerGiftDelivery | undefined, feeds: Array<GiftDeliveryFeed | null | undefined>) {
  return !!delivery && feeds.some(feed => feed?.id === delivery.sessionId && feed.publisherUid === delivery.recipientUid);
}
