export function formatLastSeen(timestamp: number, now = Date.now(), locale?: string, translate?: (source: string, values: Record<string, string>) => string): string {
  if (locale && !/^en(?:-|$)/i.test(locale) && translate) {
    const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
    if (minutes < 1) return translate("Last Seen just now", {});
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const value = minutes < 60 ? relative.format(-minutes, "minute")
      : hours < 24 ? relative.format(-hours, "hour")
      : days < 7 ? relative.format(-days, "day") : new Date(timestamp).toLocaleDateString(locale);
    return translate("Last Seen {v0}", { v0: value });
  }
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return "Last Seen just now";
  if (minutes < 60) return `Last Seen ${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last Seen ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last Seen ${days} ${days === 1 ? "day" : "days"} ago`;
  return `Last Seen ${new Date(timestamp).toLocaleDateString()}`;
}
