// Stores the whole garden as one JSON document in Netlify Blobs.
//
//   GET  /api/notes  -> the garden (anyone)
//   PUT  /api/notes  -> replace the garden (needs the EDIT_PASSWORD header)
//   POST /api/login  -> check a password
//
// Every save keeps the previous version under backups/ (the newest 50 are kept).

import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";
import seed from "./seed.mjs";

const KEEP_BACKUPS = 50;
const MAX_BYTES = 4 * 1024 * 1024;

const reply = (body, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

function passwordOk(req) {
  const expected = process.env.EDIT_PASSWORD;
  if (!expected) return false;
  const hash = (s) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(req.headers.get("x-garden-password") || ""), hash(expected));
}

function validate(data) {
  if (!data || typeof data !== "object") return "The garden must be an object.";
  if (typeof data.siteTitle !== "string" || !data.siteTitle.trim()) return "The garden needs a name.";
  if (!data.notes || typeof data.notes !== "object") return "The garden has no notes.";
  if (!data.notes[data.home]) return "The home note is missing.";
  for (const [slug, n] of Object.entries(data.notes)) {
    if (!/^[A-Za-z0-9_.~-]+$/.test(slug)) return `Bad note id: ${slug}`;
    if (typeof n.title !== "string" || typeof n.body !== "string") return `Note ${slug} is malformed.`;
  }
  return null;
}

export default async (req) => {
  const store = getStore({ name: "garden", consistency: "strong" });
  const path = new URL(req.url).pathname;

  if (path === "/api/login") {
    if (req.method !== "POST") return reply({ error: "Use POST." }, 405);
    if (!process.env.EDIT_PASSWORD) {
      return reply({ error: "No password is set up yet. Add EDIT_PASSWORD in Netlify's environment variables, then redeploy." }, 503);
    }
    return passwordOk(req) ? reply({ ok: true }) : reply({ error: "That password isn't right." }, 401);
  }

  if (req.method === "GET") {
    const data = (await store.get("garden", { type: "json" })) || seed;
    return reply(data);
  }

  if (req.method === "PUT") {
    if (!passwordOk(req)) return reply({ error: "Sign in again to save." }, 401);
    const text = await req.text();
    if (text.length > MAX_BYTES) return reply({ error: "The garden is too large to save in one piece." }, 413);
    let data;
    try { data = JSON.parse(text); } catch { return reply({ error: "Couldn't read the notes that were sent." }, 400); }
    const problem = validate(data);
    if (problem) return reply({ error: problem }, 400);

    const current = await store.get("garden", { type: "json" });
    // Stops two open tabs/devices from silently overwriting each other.
    const base = req.headers.get("x-garden-base") || "";
    if (current && (current.updatedAt || "") !== base) {
      return reply({ error: "These notes were changed somewhere else since you opened the page. Reload to get the latest version." }, 409);
    }

    if (current) {
      await store.setJSON(`backups/${current.updatedAt || new Date().toISOString()}`, current);
      const { blobs } = await store.list({ prefix: "backups/" });
      const old = blobs.map((b) => b.key).sort().slice(0, -KEEP_BACKUPS);
      await Promise.all(old.map((k) => store.delete(k)));
    }

    const saved = { siteTitle: data.siteTitle, home: data.home, notes: data.notes, updatedAt: new Date().toISOString() };
    await store.setJSON("garden", saved);
    return reply(saved);
  }

  return reply({ error: "Not supported." }, 405);
};

export const config = { path: ["/api/notes", "/api/login"] };
