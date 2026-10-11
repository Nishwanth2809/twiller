import { fail } from "./security.js";
export const RESERVED = new Set(["api","status","user","users","home","explore","search","bookmarks","messages","notifications","profile","settings","subscription","subscriptions","privacy","terms","cookies","login","signup","register","admin","media","_next"]);
export function normalizeHandle(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_]{3,50}$/.test(value)) fail(400,"INVALID_USERNAME","Use 3–50 letters, digits or underscores");
  const normalized = value.toLowerCase();
  if (RESERVED.has(normalized)) fail(409,"USERNAME_RESERVED","Choose another username");
  return normalized;
}
export function pairKey(participants) {
  const ids = participants.map(String).sort();
  if (ids.length !== 2 || ids[0] === ids[1] || ids.some(id => !/^[a-f\d]{24}$/i.test(id))) fail(400,"INVALID_PARTICIPANTS","Choose two distinct valid participants");
  return ids.join(":");
}
