/** Convert the iOS crop viewport (points) to an exact 9:16 source-pixel crop. */
export function backgroundCropRect(
  source: { width: number; height: number },
  viewportWidth: number,
  offset: { x: number; y: number; zoomScale: number },
) {
  if (![source.width, source.height, viewportWidth, offset.zoomScale].every(n => Number.isFinite(n) && n > 0)
    || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
    throw new Error("Invalid crop dimensions");
  }
  const viewportHeight = viewportWidth * 16 / 9;
  const scale = Math.max(viewportWidth / source.width, viewportHeight / source.height) * Math.max(1, offset.zoomScale);
  // Whole multiples keep the encoded image exactly 9:16, including odd-sized photos.
  const unit = Math.floor(Math.min(viewportWidth / scale / 9, source.width / 9, source.height / 16) + 1e-8);
  if (unit < 1) throw new Error("Image is too small to crop");
  const width = unit * 9;
  const height = unit * 16;
  return {
    originX: Math.max(0, Math.min(source.width - width, Math.round(offset.x / scale))),
    originY: Math.max(0, Math.min(source.height - height, Math.round(offset.y / scale))),
    width,
    height,
  };
}
