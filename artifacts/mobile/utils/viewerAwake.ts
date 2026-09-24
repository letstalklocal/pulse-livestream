/** Keep the viewer awake while this route still owns an admitted live session. */
export function shouldKeepViewerAwake({
  pathname, channelId, canEnterStream, playbackChannelId, requiresAdmission,
  playbackCanEnterStream, accessRestricted, streamEnded, playbackEnded,
}: {
  pathname: string;
  channelId: string;
  canEnterStream: boolean;
  playbackChannelId: string;
  requiresAdmission: boolean;
  playbackCanEnterStream: boolean;
  accessRestricted: boolean;
  streamEnded: boolean;
  playbackEnded: boolean;
}) {
  const routeActive = pathname === `/stream/${channelId}`;
  const ownsPlayback = playbackChannelId === channelId;
  const accessActive = canEnterStream || (ownsPlayback && (playbackCanEnterStream || !requiresAdmission));
  return routeActive && accessActive && !accessRestricted && !streamEnded && !playbackEnded;
}
