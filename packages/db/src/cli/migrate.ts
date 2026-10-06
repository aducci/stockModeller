// npm run db:migrate — applies pending migrations to $DATABASE_URL.
import { migrate } from "../migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL, e.g. postgres://postgres:postgres@localhost:5432/connectome");
  process.exit(1);
}
const applied = await migrate(url);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date");
