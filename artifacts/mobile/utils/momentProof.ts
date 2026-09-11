export type MomentProof = {
  id: string;
  ownerUid: number;
  revision?: string;
  videoSize?: { width: number; height: number };
  placement?: {
    mode?: number;
    positionInPortraitMode?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };
    positionInLandscapeMode?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };
  };
  createdAt: string;
  status: "running" | "captured" | "failed";
  uri?: string;
  bytes?: number;
  durationMs?: number;
  error?: string;
  events: Array<{ ms: number; event: string; code?: number }>;
};
export async function latestMomentProof(
  _uid: number,
): Promise<MomentProof | null> {
  return null;
}
export function stopMomentProof(_engine: unknown, _reason?: string) {}
export async function startMomentProof(
  _engine: unknown,
  _channel: string,
  _uid: number,
  _isCurrent?: () => boolean,
  _getVideoSize?: () => { width: number; height: number } | null,
): Promise<MomentProof> {
  throw new Error("The live gift capture test requires Android.");
}
export async function exportMomentProof(_row: MomentProof) {
  throw new Error("Export requires Android.");
}
