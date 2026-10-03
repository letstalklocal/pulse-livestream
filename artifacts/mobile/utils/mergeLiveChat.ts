export function mergeLiveChat<T extends { id: string }>(previous: T[], incoming: T[], deletedIds: string[] = []): T[] {
  const deleted = new Set(deletedIds);
  const rows = new Map(previous.filter(row => !deleted.has(row.id)).map(row => [row.id, row]));
  let changed = rows.size !== previous.length;
  for (const row of incoming) {
    if (deleted.has(row.id)) continue;
    const old = rows.get(row.id);
    if (old && (Object.keys(row) as (keyof T)[]).every(key => old[key] === row[key])) continue;
    rows.delete(row.id);
    rows.set(row.id, row);
    changed = true;
  }
  return changed ? [...rows.values()].slice(-100) : previous;
}
