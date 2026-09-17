/** One emoji sequence, including modifiers, ZWJ families, flags and keycaps.
 * Kept equivalent on client/server; the shared regression corpus checks both.
 */
const EMOJI = /^(?:[\u{1F1E6}-\u{1F1FF}]{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*)$/u;
export function isReactionEmoji(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && EMOJI.exec(value)?.[0] === value;
}
