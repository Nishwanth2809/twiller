import { fail } from "./security.js";
export function encodeCursor(row, field = "timestamp") {
  return Buffer.from(JSON.stringify({ t: new Date(row[field]).toISOString(), id: String(row._id) })).toString("base64url");
}
export function decodeCursor(value) {
  try {
    if (typeof value !== "string" || value.length > 180 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    if (Object.keys(data).sort().join() !== "id,t" || !/^[a-f\d]{24}$/i.test(data.id) || typeof data.t !== "string" || new Date(data.t).toISOString() !== data.t) throw Error();
    return { t: new Date(data.t), id: data.id };
  } catch { fail(400, "INVALID_CURSOR", "Invalid continuation cursor"); }
}
export function cursorFilter(cursor, field, descending = true) {
  if (!cursor) return {};
  const { t, id } = decodeCursor(cursor); const op = descending ? "$lt" : "$gt";
  return { $or: [{ [field]: { [op]: t } }, { [field]: t, _id: { [op]: id } }] };
}
export function literalSearch(query) { return new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"); }
export function pageResult(rows, limit, field = "timestamp", ascendingOutput = false) {
  const hasMore = rows.length > limit; const items = rows.slice(0, limit);
  const nextCursor = hasMore && items.length ? encodeCursor(items.at(-1), field) : null;
  return { items: ascendingOutput ? items.reverse() : items, hasMore, nextCursor };
}
