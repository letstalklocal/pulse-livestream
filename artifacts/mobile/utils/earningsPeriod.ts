export type EarningsPeriod = "day" | "week" | "month" | "year";

export function earningsRange(
  period: EarningsPeriod,
  offset: number,
  now = new Date(),
) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "day") start.setDate(start.getDate() + offset);
  if (period === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  if (period === "month") {
    start.setDate(1);
    start.setMonth(start.getMonth() + offset);
  }
  if (period === "year") {
    start.setMonth(0, 1);
    start.setFullYear(start.getFullYear() + offset);
  }
  const end = new Date(start);
  if (period === "day") end.setDate(end.getDate() + 1);
  if (period === "week") end.setDate(end.getDate() + 7);
  if (period === "month") end.setMonth(end.getMonth() + 1);
  if (period === "year") end.setFullYear(end.getFullYear() + 1);
  return { start, end };
}
