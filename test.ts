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

// db.run(user.toString());
new SqliteBruv({ schema: [user] });
user.query.select("*").get();
