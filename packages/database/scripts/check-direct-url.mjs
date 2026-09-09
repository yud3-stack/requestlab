import dotenv from "dotenv";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });

const directUrl = process.env.DIRECT_URL;
if (
  !directUrl ||
  (!directUrl.startsWith("postgresql://") && !directUrl.startsWith("postgres://"))
) {
  process.stderr.write(
    "DIRECT_URL must be set to a valid PostgreSQL connection for Prisma CLI operations.\n"
  );
  process.exit(1);
}
