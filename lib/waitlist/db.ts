import "server-only";

import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { getDatabaseUrl } from "./config";
import * as schema from "./schema";

type WaitlistDatabase = NeonHttpDatabase<typeof schema>;

let database: WaitlistDatabase | undefined;

export function getWaitlistDatabase(): WaitlistDatabase {
  if (!database) {
    database = drizzle(getDatabaseUrl(), { schema });
  }

  return database;
}
