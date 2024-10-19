# SqliteBruv

### A Simple and Efficient Query Builder for SQLite

Lightweight, modular, and secure SQLite query builder designed to simplify database interactions and optimize performance.
Key Features:

- Simple Query Building: Construct complex queries with ease.
- Parameterized Queries: Prevent SQL injection attacks.
- Works with cloudflare D1.
- Works with bun's Inbuilt SQLite.
- Provides raw query.
- Zero Deps

<center>
<img src="https://github.com/FridayCandour/SQLiteBruv/blob/main/icon.png?raw=true" style="width: 320px; margin: auto;" />
</center>

## Installation

Install sqlitebruv with npm

```bash
  npm install sqlitebruv

```

## Usage/Examples

```typescript
import { SQLiteBruv } from "SQLiteBruv";

// Example usage:
const db = Database.open("database.db");

db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      country TEXT
    );
`);

const queryBuilder = new SqliteBruv({
  db, //? or
  D1: {
    accountId: "xxx",
    databaseId: "xxx",
    apiKey: "xxx",
  }, //? or nothing to get the query instead
});

// Insert
await queryBuilder
  .from("users")
  .insert({ name: "John Doe", email: "john@example.com" })
  .then((changes) => {
    // console.log({ changes });
  });

// Update
await queryBuilder
  .from("users")
  .where("id = ?", 1)
  .update({ name: "Jane Doe" })
  .then((changes) => {
    // console.log({ changes });
  });

// Search
await queryBuilder
  .from("users")
  .where("id = ?", 1)
  .andWhere("name LIKE ?", `%oh%`)
  .get()
  .then((changes) => {
    // console.log({ changes });
  });

// Delete
await queryBuilder
  .from("users")
  .select("*")
  .where("id = ?", 1)
  .delete()
  .then((changes) => {
    console.log({ changes });
  });

// Get all users
queryBuilder
  .from("users")
  .get()
  .then((changes) => {
    // console.log({ changes });
  });

// Get one user
await queryBuilder
  .from("users")
  .where("id = ?", 1)
  .getOne()
  .then((changes) => {
    // console.log({ changes });
  });

// Select specific columns
await queryBuilder
  .from("users")
  .select("id", "name")
  .get()
  .then((changes) => {
    // console.log({ changes });
  });

// Where conditions
await queryBuilder
  .from("users")
  .where("age > ?", 18)
  .get()
  .then((changes) => {
    // console.log({ changes });
  });

// AndWhere conditions
await queryBuilder
  .from("users")
  .where("age > ?", 18)
  .andWhere("country = ?", "USA")
  .get()
  .then((changes) => {
    // console.log({ changes });
  });

// OrWhere conditions
await queryBuilder
  .from("users")
  .where("age > ?", 18)
  .orWhere("country = ?", "Canada")
  .get()
  .then((changes) => {
    // console.log({ changes });
  });

// Limit and Offset
await queryBuilder
  .from("users")
  .limit(10)
  .offset(5)
  .get()
  .then((changes) => {
    // console.log({ changes });
  });

// OrderBy
await queryBuilder
  .from("users")
  .orderBy("name", "ASC")
  .get()
  .then((changes) => {
    // console.log({ changes });
  });

await queryBuilder
  .from("users")
  .orderBy("name", "ASC")
  .get()
  .then((changes) => {
    // console.log({ changes });
  });
```

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Contributing

Contributions are always welcome!
creates issues and pull requests.

## Support

<center>
<img src="https://github.com/FridayCandour/SQLiteBruv/blob/main/qrcode.png?raw=true" style="width: 320px; margin: auto;" />
</center>
