/** Optional custom WAV data per gift name. Leave unset to use the default chime.
 * Set e.g. Rose: roseSoundBase64 after importing a custom asset's base64 data.
 * Keys match the existing gift names; gift prices/IDs stay in their own catalog.
 */
export const customGiftSounds: Partial<Record<string, string>> = {};
