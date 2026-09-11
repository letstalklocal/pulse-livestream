export const PROOF_LENGTH_MS = 7000;
export const PROOF_REVISION = "live-crown-hd-v1";
export function proofStage(elapsedMs: number): string {
  if (elapsedMs < 1000) return "camera baseline";
  if (elapsedMs < 3000) return "stationary crown";
  if (elapsedMs < 5200) return "animated crown";
  return "camera after crown";
}
export function proofFrameIndex(elapsedMs: number): number | null {
  if (elapsedMs < 1000 || elapsedMs >= 5200) return null;
  if (elapsedMs < 3000) return 20;
  return Math.min(43, Math.floor((elapsedMs - 3000) / 50));
}
export {
  momentGiftWatermarkOptions as momentProofWatermarkOptions,
  type MomentVideoSize as ProofVideoSize,
} from "./momentGiftConfig";
