import { createDb, type Db } from "@seo-forge/shared";

let _db: Db | null = null;
let _close: (() => Promise<void>) | null = null;

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const { db, close } = createDb(url);
  _db = db;
  _close = close;
  return db;
}

export async function closeDb(): Promise<void> {
  if (_close) await _close();
  _db = null;
  _close = null;
}
