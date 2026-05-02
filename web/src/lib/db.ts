import { createDb, type Db } from "@seo-forge/shared";

let _db: Db | null = null;

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const { db } = createDb(url);
  _db = db;
  return db;
}
