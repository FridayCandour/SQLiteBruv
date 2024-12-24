import { readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Database } from "bun:sqlite";
export class SqliteBruv {
    static migrationFolder = "./Bruv-migrations";
    db;
    dbMem;
    _columns = ["*"];
    _conditions = [];
    _tableName = undefined;
    _params = [];
    _cacheName;
    _limit;
    _offset;
    _orderBy;
    _query = false;
    _D1_api_key;
    _D1_url;
    _logging = false;
    _hotCache = {};
    _turso;
    MAX_PARAMS = 100;
    ALLOWED_OPERATORS = [
        "=",
        ">",
        "<",
        ">=",
        "<=",
        "LIKE",
        "IN",
        "BETWEEN",
        "IS NULL",
        "IS NOT NULL",
    ];
    DANGEROUS_PATTERNS = [
        /;\s*$/,
        /UNION/i,
        /DROP/i,
        /DELETE/i,
        /UPDATE/i,
        /INSERT/i,
        /ALTER/i,
        /EXEC/i,
    ];
    constructor({ D1, turso, logging, schema, name, }) {
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
        if (logging === true) {
            this._logging = true;
        }
        if (!schema?.length) {
            throw new Error("Not database schema passed!");
        }
        else {
            schema.forEach((s) => {
                s.db = this;
                s._induce();
            });
        }
        Promise.all([getSchema(this.db), getSchema(this.dbMem)])
            .then(async ([currentSchema, targetSchema]) => {
            const migration = await generateMigration(currentSchema || [], targetSchema || []);
            await createMigrationFileIfNeeded(migration);
            this.dbMem.close();
        })
            .catch((e) => {
            console.log(e);
        });
        if (turso) {
            this._turso = turso;
        }
    }
    from(tableName) {
        this._tableName = tableName;
        return this;
    }
    select(...columns) {
        this._columns = columns || ["*"];
        return this;
    }
    validateCondition(condition) {
        if (this.DANGEROUS_PATTERNS.some((pattern) => pattern.test(condition))) {
            throw new Error("Invalid condition pattern detected");
        }
        const hasValidOperator = this.ALLOWED_OPERATORS.some((op) => condition.toUpperCase().includes(op));
        if (!hasValidOperator) {
            throw new Error("Invalid or missing operator in condition");
        }
        return true;
    }
    validateParams(params) {
        if (params.length > this.MAX_PARAMS) {
            throw new Error("Too many parameters");
        }
        for (const param of params) {
            if (param !== null &&
                !["string", "number", "boolean"].includes(typeof param)) {
                throw new Error("Invalid parameter type");
            }
            if (typeof param === "string" && param.length > 1000) {
                throw new Error("Parameter string too long");
            }
        }
        return true;
    }
    where(condition, ...params) {
        if (!condition || typeof condition !== "string") {
            throw new Error("Condition must be a non-empty string");
        }
        this.validateCondition(condition);
        this.validateParams(params);
        this._conditions.push(`WHERE ${condition}`);
        this._params.push(...params);
        return this;
    }
    andWhere(condition, ...params) {
        this.validateCondition(condition);
        this.validateParams(params);
        this._conditions.push(`AND ${condition}`);
        this._params.push(...params);
        return this;
    }
    orWhere(condition, ...params) {
        this.validateCondition(condition);
        this.validateParams(params);
        this._conditions.push(`OR ${condition}`);
        this._params.push(...params);
        return this;
    }
    limit(count) {
        this._limit = count;
        return this;
    }
    offset(count) {
        this._offset = count || -1;
        return this;
    }
    orderBy(column, direction) {
        this._orderBy = { column, direction };
        return this;
    }
    cacheAs(cacheName) {
        this._cacheName = cacheName;
        return this;
    }
    invalidateCache(cacheName) {
        this._hotCache[cacheName] = undefined;
        return this;
    }
    get() {
        if (this._cacheName && this._hotCache[this._cacheName]) {
            this._hotCache[this._cacheName];
        }
        const { query, params } = this.build();
        if (this._query) {
            return { query, params };
        }
        return this.run(query, params, { single: false });
    }
    getOne() {
        if (this._cacheName && this._hotCache[this._cacheName]) {
            this._hotCache[this._cacheName];
        }
        const { query, params } = this.build();
        if (this._query) {
            return { query, params };
        }
        return this.run(query, params, { single: true });
    }
    insert(data) {
        data.id = Id();
        const columns = Object.keys(data).join(", ");
        const placeholders = Object.keys(data)
            .map(() => "?")
            .join(", ");
        const query = `INSERT INTO ${this._tableName} (${columns}) VALUES (${placeholders})`;
        const params = Object.values(data);
        this.clear();
        if (this._query) {
            return { query, params };
        }
        return this.run(query, params);
    }
    update(data) {
        const columns = Object.keys(data)
            .map((column) => `${column} = ?`)
            .join(", ");
        const query = `UPDATE ${this._tableName} SET ${columns} ${this._conditions.join(" AND ")}`;
        const params = [...Object.values(data), ...this._params];
        this.clear();
        if (this._query) {
            return { query, params };
        }
        return this.run(query, params);
    }
    delete() {
        const query = `DELETE FROM ${this._tableName} ${this._conditions.join(" AND ")}`;
        const params = [...this._params];
        this.clear();
        if (this._query) {
            return { query, params };
        }
        return this.run(query, params);
    }
    count() {
        const query = `SELECT COUNT(*) as count  FROM ${this._tableName} ${this._conditions.join(" AND ")}`;
        const params = [...this._params];
        this.clear();
        if (this._query) {
            return { query, params };
        }
        return this.run(query, params);
    }
    async executeJsonQuery(query) {
        if (!query.action) {
            throw new Error("Action is required.");
        }
        if (!query.from) {
            throw new Error("Table is required.");
        }
        let queryBuilder = this.from(query.from);
        if (query.select)
            queryBuilder = queryBuilder.select(...query.select);
        if (query.limit)
            queryBuilder = queryBuilder.limit(query.limit);
        if (query.offset)
            queryBuilder = queryBuilder.offset(query.offset);
        if (query.cacheAs)
            queryBuilder = queryBuilder.cacheAs(query.cacheAs);
        if (query.where) {
            for (const condition of query.where) {
                queryBuilder = queryBuilder.where(condition.condition, ...condition.params);
            }
        }
        if (query.andWhere) {
            for (const condition of query.andWhere) {
                queryBuilder = queryBuilder.andWhere(condition.condition, ...condition.params);
            }
        }
        if (query.orWhere) {
            for (const condition of query.orWhere) {
                queryBuilder = queryBuilder.orWhere(condition.condition, ...condition.params);
            }
        }
        if (query.orderBy) {
            queryBuilder = queryBuilder.orderBy(query.orderBy.column, query.orderBy.direction);
        }
        let result;
        try {
            switch (query.action) {
                case "get":
                    result = await queryBuilder.get();
                    break;
                case "count":
                    result = await queryBuilder.count();
                    break;
                case "getOne":
                    result = await queryBuilder.getOne();
                    break;
                case "insert":
                    if (!query.data) {
                        throw new Error("Data is required for insert action.");
                    }
                    result = await queryBuilder.insert(query.data);
                    break;
                case "update":
                    if (!query.data || !query.from || !query.where) {
                        throw new Error("Data, from, and where are required for update action.");
                    }
                    result = await queryBuilder.update(query.data);
                    break;
                case "delete":
                    if (!query.from || !query.where) {
                        throw new Error("From and where are required for delete action.");
                    }
                    result = await queryBuilder.delete();
                    break;
                default:
                    throw new Error("Invalid action specified.");
            }
            if (query.invalidateCache) {
                queryBuilder.invalidateCache(query.invalidateCache);
            }
        }
        catch (error) {
            console.error("Query execution failed:", error);
            throw new Error("Query execution failed.");
        }
        return result;
    }
    build() {
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
    async run(query, params, { single } = {
        single: undefined,
    }) {
        if (this._logging) {
            console.log({ query, params });
        }
        if (this._turso) {
            const results = await this.executeTursoQuery(query, params);
            if (single) {
                return results[0];
            }
            return results;
        }
        if (this._D1_api_key) {
            const res = await fetch(this._D1_url, {
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
                }
                else {
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
    async executeTursoQuery(query, params = []) {
        if (!this._turso) {
            throw new Error("Turso configuration not found");
        }
        const response = await fetch(this._turso.url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this._turso.authToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                statements: [
                    {
                        q: query,
                        params: params,
                    },
                ],
            }),
        });
        if (!response.ok) {
            throw new Error(`Turso API error: ${response.statusText}`);
        }
        const results = (await response.json())[0];
        const { columns, rows } = results?.results || {};
        if (results.error) {
            throw new Error(`Turso API error: ${results.error}`);
        }
        const transformedRows = rows.map((row) => {
            const rowObject = {};
            columns.forEach((column, index) => {
                rowObject[column] = row[index];
            });
            return rowObject;
        });
        return transformedRows;
    }
    raw(raw, params = []) {
        return this.run(raw, params, { single: false });
    }
    async cacheResponse(response) {
        await response;
        this._hotCache[this._cacheName] = response;
        return response;
    }
}
export class Schema {
    string = "";
    name;
    db;
    columns;
    constructor(def) {
        this.name = def.name;
        this.columns = def.columns;
    }
    get query() {
        return this.db?.from(this.name);
    }
    queryRaw(raw) {
        return this.db?.from(this.name).raw(raw, []);
    }
    _induce() {
        const tables = Object.keys(this.columns);
        this.string = `CREATE TABLE IF NOT EXISTS ${this.name} (\n    id text PRIMARY KEY NOT NULL,\n     ${tables
            .map((col, i) => col +
            " " +
            this.columns[col].type +
            (this.columns[col].unique ? " UNIQUE" : "") +
            (this.columns[col].required ? " NOT NULL" : "") +
            (this.columns[col].default
                ? "  DEFAULT " + this.columns[col].default()
                : "") +
            (i + 1 !== tables.length ? ",\n    " : "\n"))
            .join(" ")})`;
        try {
            this.db?.db.run(this.string);
            this.db?.dbMem.run(this.string);
        }
        catch (error) {
            console.log({ err: String(error), schema: this.string });
        }
    }
    toString() {
        return this.string;
    }
}
async function getSchema(db) {
    try {
        const tables = await db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all();
        const schema = await Promise.all(tables.map(async (table) => ({
            name: table.name,
            schema: await db
                .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`)
                .get(table.name),
        })));
        return schema;
    }
    catch (error) {
        console.error(error);
        db.close();
    }
}
[];
async function generateMigration(currentSchema, targetSchema) {
    if (!targetSchema?.length)
        return { up: "", down: "" };
    let up = "";
    let down = "";
    const currentTables = Object.fromEntries(currentSchema.map(({ name, schema }) => [name, schema.sql]));
    const targetTables = Object.fromEntries(targetSchema.map(({ name, schema }) => [name, schema.sql]));
    function parseSchema(sql) {
        const columnRegex = /(?<column_name>\w+)\s+(?<data_type>\w+)(?:\s+(?<constraints>(?:PRIMARY KEY|UNIQUE|NOT NULL|DEFAULT\s+[^,]+|CHECK\s*\(.+?\)|COLLATE\s+\w+|\s+)+))?(?:,|$)/gi;
        const columnSectionMatch = sql.match(/\(([\s\S]+)\)/);
        if (!columnSectionMatch) {
            return {};
        }
        const columnSection = columnSectionMatch[1];
        const matches = columnSection.matchAll(columnRegex);
        const columns = {};
        for (const match of matches) {
            const columnName = match.groups?.column_name || "";
            const dataType = match.groups?.data_type || "";
            const rawConstraints = match.groups?.constraints || "";
            const constraints = rawConstraints
                .split(/(?=PRIMARY KEY|UNIQUE|NOT NULL|DEFAULT|CHECK|COLLATE)/)
                .map((constraint) => constraint.trim())
                .filter((constraint) => constraint.length > 0)
                .join(" ");
            columns[columnName] = { type: dataType, constraints };
        }
        return columns;
    }
    for (const [tableName, currentSql] of Object.entries(currentTables)) {
        if (!targetTables[tableName]) {
            up += `DROP TABLE ${tableName};\n`;
            down += `CREATE TABLE ${tableName} (${currentSql});\n`;
            continue;
        }
        const currentColumns = parseSchema(currentSql);
        const targetColumns = parseSchema(targetTables[tableName]);
        for (const [colName, col] of Object.entries(currentColumns)) {
            if (!targetColumns[colName]?.type) {
                up += `ALTER TABLE ${tableName} DROP COLUMN ${colName};\n`;
                down += `ALTER TABLE ${tableName} ADD COLUMN ${colName} ${col.type}  ${col.constraints};\n`;
            }
            else if (targetColumns[colName].type !== col.type) {
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
async function createMigrationFileIfNeeded(migration) {
    if (!migration?.up)
        return;
    const timestamp = new Date().toString().split(" ").slice(0, 5).join("_");
    const filename = `${timestamp}_auto_migration.sql`;
    const filepath = join(SqliteBruv.migrationFolder, filename);
    const fileContent = `-- Up\n\n${migration.up}\n\n-- Down\n\n${migration.down}`;
    try {
        await mkdir(SqliteBruv.migrationFolder, { recursive: true });
        if (isDuplicateMigration(fileContent))
            return;
        await writeFile(filepath, fileContent);
        console.log(`Created migration file: ${filename}`);
    }
    catch (error) {
        console.error("Error during file system operations: ", error);
    }
}
function isDuplicateMigration(newContent) {
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
const PROCESS_UNIQUE = randomBytes(5);
const buffer = Buffer.alloc(12);
export const Id = () => {
    let index = ~~(Math.random() * 0xffffff);
    const time = ~~(Date.now() / 1000);
    const inc = (index = (index + 1) % 0xffffff);
    buffer[3] = time & 0xff;
    buffer[2] = (time >> 8) & 0xff;
    buffer[1] = (time >> 16) & 0xff;
    buffer[0] = (time >> 24) & 0xff;
    buffer[4] = PROCESS_UNIQUE[0];
    buffer[5] = PROCESS_UNIQUE[1];
    buffer[6] = PROCESS_UNIQUE[2];
    buffer[7] = PROCESS_UNIQUE[3];
    buffer[8] = PROCESS_UNIQUE[4];
    buffer[11] = inc & 0xff;
    buffer[10] = (inc >> 8) & 0xff;
    buffer[9] = (inc >> 16) & 0xff;
    return buffer.toString("hex");
};
