let _isBroadcasting = false;

export function setIsBroadcasting(v: boolean) {
  _isBroadcasting = v;
}

export function isBroadcasting(): boolean {
  return _isBroadcasting;
}
