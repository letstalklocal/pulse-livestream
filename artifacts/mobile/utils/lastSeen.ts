export function formatLastSeen(timestamp: number, now = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return "Last Seen just now";
  if (minutes < 60) return `Last Seen ${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last Seen ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last Seen ${days} ${days === 1 ? "day" : "days"} ago`;
  return `Last Seen ${new Date(timestamp).toLocaleDateString()}`;
}
