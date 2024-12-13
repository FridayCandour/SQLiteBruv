// TODOs:
// [x] batching runner
// [x] support turso db https://docs.turso.tech/sdk/http/quickstart https://turso.tech/blog/bring-your-own-sdk-with-tursos-http-api-ff4ccbed

import { readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Database } from "bun:sqlite";

// TYPE:

export interface BruvSchema<Model> {
  name: string;
  columns: {
    [x in keyof Omit<Model, "_id">]: SchemaColumnOptions;
  };
}

interface SchemaColumnOptions {
  type: "INTEGER" | "REAL" | "TEXT" | "DATETIME";
  required?: boolean;
  unique?: boolean;
  default?: () => any;
  target?: string;
  relationType?: "MANY" | "ONE";
}
type Params = string | number | null | boolean;
type rawSchema = { name: string; schema: { sql: string } };

// SqliteBruv class

export class SqliteBruv<
  T extends Record<string, Params> = Record<string, Params>
> {
  static migrationFolder = "./Bruv-migrations";
  db: any;
  dbMem: any;
  private _columns: string[] = ["*"];
  private _conditions: string[] = [];
  private _tableName?: string = undefined;
  private _params: Params[] = [];
  private _cacheName?: string;
  private _limit?: number;
  private _offset?: number;
  private _orderBy?: { column: string; direction: "ASC" | "DESC" };
  private _query: boolean = false;
  private _D1_api_key?: string;
  private _D1_url?: string;
  private _logging: boolean = false;
  private _hotCache: Record<string | number, any> = {};
  constructor({
    D1,
    logging,
    schema,
    name,
  }: {
    D1?: {
      accountId: string;
      databaseId: string;
      apiKey: string;
    };
    schema: Schema[];
    logging?: boolean;
    name?: string;
  }) {
    // ?setup db
    this.db = new Database((name || "Database") + ".sqlite", {
      create: true,
      strict: true,
    });
    this.dbMem = new Database();
    if (D1) {
      const { accountId, databaseId, apiKey } = D1;
      this._D1_url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
      this._D1_api_key = apiKey;
    }
    // ?
    if (logging === true) {
      this._logging = true;
    }
    // ? get and set db for each schema
    if (!schema?.length) {
      throw new Error("Not database schema passed!");
    } else {
      schema.forEach((s) => {
        s.db = this;
        s.induce();
      });
    }
    //? Auto create migration files
    Promise.all([getSchema(this.db), getSchema(this.dbMem)])
      .then(async ([currentSchema, targetSchema]) => {
        const migration = await generateMigration(
          currentSchema || [],
          targetSchema || []
        );
        await createMigrationFileIfNeeded(migration);
        this.dbMem.close();
      })
      .catch((e) => {
        console.log(e);
      });
  }
  from<Model extends Record<string, any> = Record<string, any>>(
    tableName: string
  ) {
    this._tableName = tableName;
    return this as unknown as SqliteBruv<Model>;
  }
  // Read queries
  select(...columns: string[]) {
    this._columns = columns || ["*"];
    return this;
  }
  where(condition: string, ...params: Params[]) {
    this._conditions.push(`WHERE ${condition}`);
    this._params.push(...params);
    return this;
  }
  andWhere(condition: string, ...params: Params[]) {
    this._conditions.push(`AND ${condition}`);
    this._params.push(...params);
    return this;
  }
  orWhere(condition: string, ...params: Params[]) {
    this._conditions.push(`OR ${condition}`);
    this._params.push(...params);
    return this;
  }
  limit(count: number) {
    this._limit = count;
    return this;
  }
  offset(count: number) {
    this._offset = count || -1;
    return this;
  }
  orderBy(column: string, direction: "ASC" | "DESC") {
    this._orderBy = { column, direction };
    return this;
  }
  cacheAs(cacheName: string) {
    this._cacheName = cacheName;
    return this;
  }
  invalidateCache(cacheName: string) {
    this._hotCache[cacheName] = undefined;
    return this;
  }
  get(): Promise<T[]> {
    if (this._cacheName && this._hotCache[this._cacheName])
      this._hotCache[this._cacheName];
    const { query, params } = this.build();
    if (this._query) {
      return { query, params } as unknown as Promise<T[]>;
    }
    return this.run(query, params, { single: false });
  }
  getOne(): Promise<T> {
    if (this._cacheName && this._hotCache[this._cacheName])
      this._hotCache[this._cacheName];
    const { query, params } = this.build();
    if (this._query) {
      return { query, params } as unknown as Promise<T>;
    }
    return this.run(query, params, { single: true });
  }
  insert(data: T): Promise<T> {
    const columns = Object.keys(data).join(", ");
    const placeholders = Object.keys(data)
      .map(() => "?")
      .join(", ");
    const query = `INSERT INTO ${this._tableName} (${columns}) VALUES (${placeholders})`;
    const params = Object.values(data) as Params[];
    this.clear();
    if (this._query) {
      return { query, params } as unknown as Promise<T>;
    }
    return this.run(query, params);
  }
  update(data: Partial<T>): Promise<T> {
    const columns = Object.keys(data)
      .map((column) => `${column} = ?`)
      .join(", ");
    const query = `UPDATE ${
      this._tableName
    } SET ${columns} ${this._conditions.join(" AND ")}`;
    const params = [...(Object.values(data) as Params[]), ...this._params];
    this.clear();
    if (this._query) {
      return { query, params } as unknown as Promise<T>;
    }
    return this.run(query, params);
  }
  delete(): Promise<T> {
    const query = `DELETE FROM ${this._tableName} ${this._conditions.join(
      " AND "
    )}`;
    const params = [...this._params];
    this.clear();
    if (this._query) {
      return { query, params } as unknown as Promise<T>;
    }
    return this.run(query, params);
  }
  private build() {
    const query = [
      `SELECT ${this._columns.join(", ")} FROM ${this._tableName}`,
      ...this._conditions,
      this._orderBy
        ? `ORDER BY ${this._orderBy.column} ${this._orderBy.direction}`
        : "",
      this._limit ? `LIMIT ${this._limit}` : "",
      this._offset ? `OFFSET ${this._offset}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const params = [...this._params];
    this.clear();
    return { query, params };
  }
  clear() {
    if (!this._tableName || typeof this._tableName !== "string") {
      throw new Error("no table selected!");
    }
    this._conditions = [];
    this._params = [];
    this._limit = undefined;
    this._offset = undefined;
    this._orderBy = undefined;
    this._tableName = undefined;
  }
  private async run(
    query: string,
    params: (string | number | null | boolean)[],
    { single }: { single?: boolean } = {
      single: undefined,
    }
  ) {
    if (this._logging) {
      console.log({ query, params });
    }
    if (this._D1_api_key) {
      const res = await fetch(this._D1_url as string, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._D1_api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: query, params }),
      });
      const data = await res.json();
      if (data.success && data.result[0].success) {
        if (single) {
          return data.result[0].results[0];
        } else {
          return data.result[0].results;
        }
      }
      throw new Error(JSON.stringify(data.errors));
    }
    if (single) {
      if (this._cacheName) {
        return this.cacheResponse(this.db.query(query).get(params));
      }
      return this.db.query(query).get(params);
    }
    if (single === false) {
      if (this._cacheName) {
        return this.cacheResponse(this.db.query(query).all(params));
      }
      return this.db.query(query).all(params);
    }
    return this.db.run(query, params);
  }
  raw(raw: string, params: (string | number | boolean)[] = []) {
    return this.run(raw, params, { single: false });
  }
  async cacheResponse(response: any) {
    await response;
    this._hotCache[this._cacheName!] = response;
    return response;
  }
}

export class Schema<Model extends Record<string, any> = {}> {
  name: string;
  db?: SqliteBruv;
  columns: { [x in keyof Omit<Model, "_id">]: SchemaColumnOptions };
  constructor(def: BruvSchema<Model>) {
    this.name = def.name;
    this.columns = def.columns;
  }
  get query() {
    return this.db?.from(this.name)!;
  }
  queryRaw(raw: string) {
    return this.db?.from(this.name).raw(raw, [])!;
  }
  induce() {
    const tables = Object.keys(this.columns);
    const query = `CREATE TABLE IF NOT EXISTS ${
      this.name
    } (\n    id text PRIMARY KEY NOT NULL,\n     ${tables
      .map(
        (col, i) =>
          col +
          " " +
          this.columns[col].type +
          (this.columns[col].unique ? " UNIQUE" : "") +
          (this.columns[col].required ? " NOT NULL" : "") +
          (this.columns[col].default
            ? "  DEFAULT " + this.columns[col].default()
            : "") +
          (i + 1 !== tables.length ? ",\n    " : "\n")
      )
      .join(" ")})`;
    try {
      this.db?.db.run(query);
      this.db?.dbMem.run(query);
    } catch (error) {
      console.log({ err: String(error), query });
    }
  }
}

async function getSchema(db: any): Promise<rawSchema[] | void> {
  try {
    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    const schema = await Promise.all(
      tables.map(async (table: any) => ({
        name: table.name,
        schema: await db
          .prepare(
            `SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`
          )
          .get(table.name),
      }))
    );
    return schema;
  } catch (error) {
    console.error(error);
    db.close(); // Close connection
  }
}

interface ColumnDetails {
  [x: string]: { type: string; constraints: string };
}
[];

async function generateMigration(
  currentSchema: rawSchema[],
  targetSchema: rawSchema[]
) {
  if (!targetSchema?.length) return { up: "", down: "" };
  let up = "";
  let down = "";

  const currentTables: Record<string, string> = Object.fromEntries(
    currentSchema.map(({ name, schema }: any) => [name, schema.sql])
  );

  const targetTables: Record<string, string> = Object.fromEntries(
    targetSchema.map(({ name, schema }: any) => [name, schema.sql])
  );

  // Utility to parse table structures (naive example; improve as needed)
  function parseSchema(sql: string): ColumnDetails {
    // Improved regex to match column definitions
    const columnRegex =
      /(?<column_name>\w+)\s+(?<data_type>\w+)(?:\s+(?<constraints>(?:PRIMARY KEY|UNIQUE|NOT NULL|DEFAULT\s+[^,]+|CHECK\s*\(.+?\)|COLLATE\s+\w+|\s+)+))?(?:,|$)/gi;
    // Extract the content within the parentheses
    const columnSectionMatch = sql.match(/\(([\s\S]+)\)/);
    if (!columnSectionMatch) {
      return {};
    }
    const columnSection = columnSectionMatch[1];
    const matches: any = columnSection.matchAll(columnRegex);
    const columns: ColumnDetails = {};
    for (const match of matches) {
      const columnName = match.groups?.column_name || "";
      const dataType = match.groups?.data_type || "";
      const rawConstraints = match.groups?.constraints || "";
      const constraints = rawConstraints
        .split(/(?=PRIMARY KEY|UNIQUE|NOT NULL|DEFAULT|CHECK|COLLATE)/)
        .map((constraint: string) => constraint.trim())
        .filter((constraint: string[]) => constraint.length > 0)
        .join(" ");
      columns[columnName] = { type: dataType, constraints };
    }
    return columns;
  }

  // Compare schemas and generate migration steps
  for (const [tableName, currentSql] of Object.entries(currentTables)) {
    if (!targetTables[tableName]) {
      up += `DROP TABLE ${tableName};\n`;
      down += `CREATE TABLE ${tableName} (${currentSql});\n`;
      continue;
    }

    const currentColumns = parseSchema(currentSql);
    const targetColumns = parseSchema(targetTables[tableName]);

    // Compare columns
    for (const [colName, col] of Object.entries(currentColumns)) {
      if (!targetColumns[colName]?.type) {
        up += `ALTER TABLE ${tableName} DROP COLUMN ${colName};\n`;
        down += `ALTER TABLE ${tableName} ADD COLUMN ${colName} ${col.type}  ${col.constraints};\n`;
      } else if (targetColumns[colName].type !== col.type) {
        up += `ALTER TABLE ${tableName} ALTER COLUMN ${colName} TYPE ${targetColumns[colName].type}  ${targetColumns[colName].constraints};\n`;
        down += `ALTER TABLE ${tableName} ALTER COLUMN ${colName} TYPE ${col.type}  ${col.constraints};\n`;
      }
    }

    for (const [colName, col] of Object.entries(targetColumns)) {
      if (!currentColumns[colName]?.type) {
        up += `ALTER TABLE ${tableName} ADD COLUMN ${colName} ${col.type} ${col.constraints};\n`;
        down += `ALTER TABLE ${tableName} DROP COLUMN ${colName};\n`;
      }
    }
  }

  for (const [tableName, targetSql] of Object.entries(targetTables)) {
    if (!currentTables[tableName]) {
      up += `CREATE TABLE ${tableName} (${targetSql});\n`;
      down += `DROP TABLE ${tableName};\n`;
    }
  }

  return { up, down };
}

async function createMigrationFileIfNeeded(
  migration: { up: string; down: string } | null
) {
  if (!migration?.up) return;
  const timestamp = new Date().toString().split(" ").slice(0, 5).join("_");
  const filename = `${timestamp}_auto_migration.sql`;
  const filepath = join(SqliteBruv.migrationFolder, filename);
  const fileContent = `-- Up\n\n${migration.up}\n\n-- Down\n\n${migration.down}`;
  try {
    await mkdir(SqliteBruv.migrationFolder, { recursive: true });
    if (isDuplicateMigration(fileContent)) return;
    await writeFile(filepath, fileContent);
    console.log(`Created migration file: ${filename}`);
  } catch (error) {
    console.error("Error during file system operations: ", error);
  }
}

function isDuplicateMigration(newContent: string) {
  const migrationFiles = readdirSync(SqliteBruv.migrationFolder);
  for (const file of migrationFiles) {
    const filePath = join(SqliteBruv.migrationFolder, file);
    const existingContent = readFileSync(filePath, "utf8");
    if (existingContent.trim() === newContent.trim()) {
      return true;
    }
  }
  return false;
}
