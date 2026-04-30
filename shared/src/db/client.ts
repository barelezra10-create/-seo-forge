import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Db; close: () => Promise<void> } {
  const sql = postgres(connectionString, { max: 5 });
  const db = drizzle(sql, { schema });
  return {
    db,
    close: async () => {
      await sql.end();
    },
  };
}

export { schema };
