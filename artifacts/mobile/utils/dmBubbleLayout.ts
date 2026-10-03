/** Fit a bubble to its actual text/metadata instead of retaining a failed row's width. */
export function dmBubbleLayout(maxWidth: number, textWidth: number, metadataWidth: number, multiline: boolean) {
  const inline = !multiline && textWidth + 4 + metadataWidth <= maxWidth;
  return {
    inline,
    width: Math.min(maxWidth, Math.ceil(inline ? textWidth + 4 + metadataWidth : Math.max(textWidth, metadataWidth))),
  };
}
