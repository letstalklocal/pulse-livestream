/** Normalize historic default invitation titles without changing saved custom titles. */
export function formatPrivateLiveTitle(title: string, translate: (text: string, values?: { v0: string }) => string): string {
  if (/^(Private live|Live private)$/i.test(title.trim())) return translate("1:1 Private");
  const legacy = /^Private live with (.+)$/i.exec(title);
  return legacy ? translate("1:1 Private with {v0}", { v0: legacy[1] }) : title;
}
