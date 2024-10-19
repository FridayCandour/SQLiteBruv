export class SqliteBruv {
    db;
    _columns = ["*"];
    _conditions = [];
    _tableName = undefined;
    _params = [];
    _limit;
    _offset;
    _orderBy;
    _query = false;
    _D1_api_key;
    _D1_url;
    constructor({ db, D1, } = { D1: undefined, db: undefined }) {
        if (db || D1) {
            this.db = db;
            if (D1) {
                const { accountId, databaseId, apiKey } = D1;
                this._D1_url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
                this._D1_api_key = apiKey;
            }
        }
        else {
            this._query = true;
        }
    }
    from(tableName) {
        this._tableName = tableName;
        return this;
    }
    select(...columns) {
        this._columns = columns;
        return this;
    }
    where(condition, ...params) {
        this._conditions.push(`WHERE ${condition}`);
        this._params.push(...params);
        return this;
    }
    andWhere(condition, ...params) {
        this._conditions.push(`AND ${condition}`);
        this._params.push(...params);
        return this;
    }
    orWhere(condition, ...params) {
        this._conditions.push(`OR ${condition}`);
        this._params.push(...params);
        return this;
    }
    limit(count) {
        this._limit = count;
        return this;
    }
    offset(count) {
        this._offset = count;
        return this;
    }
    orderBy(column, direction) {
        this._orderBy = { column, direction };
        return this;
    }
    get() {
        const { query, params } = this.build();
        if (this._query) {
            return { query, params };
        }
        return this.run(query, params, { single: false, many: true });
    }
    getOne() {
        const { query, params } = this.build();
        if (this._query) {
            return { query, params };
        }
        return this.run(query, params, { single: true, many: false });
    }
    insert(data) {
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
    async run(query, params, { single, many } = {
        single: false,
        many: false,
    }) {
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
            if (data.success) {
                console.log(JSON.stringify({ data, sql: query, params }, null, 2));
                return data.result;
            }
            throw new Error(JSON.stringify(data.errors));
        }
        if (single) {
            return this.db.query(query, params).get();
        }
        if (many) {
            return this.db.query(query, params).all();
        }
        return this.db.run(query, params);
    }
}
