import { Schema, SqliteBruv } from "./src/index";

// Example usage:

const user = new Schema<{
  name: string;
  username: string;
  age: number;
  createdAt: Date;
}>({
  name: "users",
  columns: {
    name: { type: "TEXT", required: true },
    username: { type: "TEXT", required: true, unique: true },
    age: { type: "INTEGER", required: true },
    createdAt: {
      type: "DATETIME",
      unique: true,
      default() {
        return "CURRENT_TIMESTAMP";
      },
    },
  },
});

const qb = new SqliteBruv({
  schema: [user],
  // turso: {
  //   url: process.env.TURSO_URL!,
  //   authToken: process.env.TURSO_AUTH_TOKEN!,
  // },
  D1: {
    accountId: process.env.CFAccountId!,
    databaseId: process.env.D1databaseId!,
    apiKey: process.env.CFauthorizationToken!,
  },
});

await qb.raw(user.toString());

await qb.executeJsonQuery({
  action: "insert",
  where: [{ condition: "username =? ", params: ["JohnDoe"] }],
  data: {
    name: "John Doe",
    username: "JohnDoe",
    age: 10,
  },
  from: "users",
});

const a = await user.query.count();
console.log({ a });
const result = await qb.executeJsonQuery({
  action: "getOne",
  where: [{ condition: "username =? ", params: ["JohnDoe"] }],
  from: "users",
});

console.log({ result });
