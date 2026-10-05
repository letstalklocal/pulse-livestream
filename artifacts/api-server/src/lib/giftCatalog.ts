export const PREMIUM_GIFT_CATALOG = {
  rose: { id: "rose", name: "Rose", emoji: "🌹", coinCost: 1 },
  heart: { id: "heart", name: "Heart", emoji: "❤️", coinCost: 5 },
  party: { id: "party", name: "Party", emoji: "🎉", coinCost: 10 },
  strawberry: { id: "strawberry", name: "Strawberry", emoji: "🍓", coinCost: 49 },
  diamond: { id: "diamond", name: "Diamond", emoji: "💎", coinCost: 50 },
  lips: { id: "lips", name: "Lips", emoji: "💋", coinCost: 99 },
  rocket: { id: "rocket", name: "Rocket", emoji: "🚀", coinCost: 100 },
  crown: { id: "crown", name: "Crown", emoji: "👑", coinCost: 500 },
} as const;

// Luxury gifts are ordinary gifts only. Keep them out of Premium/admission,
// private-invitation and sticker configuration selectors.
export const GIFT_CATALOG = {
  ...PREMIUM_GIFT_CATALOG,
  kisses: { id: "kisses", name: "Kisses", emoji: "💋", coinCost: 1_999 },
  luxury_rocket: { id: "luxury_rocket", name: "Rocket", emoji: "🚀", coinCost: 4_999 },
  dragon: { id: "dragon", name: "Dragon", emoji: "🐉", coinCost: 9_999 },
} as const;
