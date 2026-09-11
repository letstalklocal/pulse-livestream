// Keep both presentations available; the party bar is the current product choice.
export type BattlePresentation = "party-bar" | "side-by-side";
export const BATTLE_PRESENTATION: BattlePresentation = "party-bar";
export function battleUsesSplitLayout(active: boolean, presentation: BattlePresentation = BATTLE_PRESENTATION) {
  return active && presentation === "side-by-side";
}

export function partyLayout(width: number, height: number, topInset: number, bottomInset: number) {
  const top = topInset + 92;
  const panelHeight = Math.min(width * 0.82, Math.max(120, height - top - bottomInset - 270));
  return { top, panelHeight, chatHeight: Math.max(48, height - bottomInset - 110 - top - panelHeight - 60) };
}
