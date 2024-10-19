type Params = string | number | null | boolean;

export class SqliteBruv<T = Record<string, Params>> {
  private db: any;
  _columns: string[] = ["*"];
  _conditions: string[] = [];
  _tableName: string = "blablabla";
  _params: Params[] = [];
  _limit?: number;
  _offset?: number;
  _orderBy?: { column: string; direction: "ASC" | "DESC" };
  _query: boolean = false;
  private _D1_api_key?: string;
  private _D1_url?: string;
  constructor(
    {
      db,
      D1,
    }: {
      db?: any;
      D1?: {
        accountId: string;
        databaseId: string;
        apiKey: string;
      };
    } = { D1: undefined, db: undefined }
  ) {
    if (db || D1) {
      this.db = db;
      if (D1) {
        const { accountId, databaseId, apiKey } = D1;
        this._D1_url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
        this._D1_api_key = apiKey;
      }
    } else {
      this._query = true;
    }
  }
  from<Model extends Record<string, Params> = Record<string, Params>>(
    tableName: string
  ) {
    this._tableName = tableName;
    return this as unknown as SqliteBruv<Model>;
  }
  // Read queries
  select(...columns: string[]) {
    this._columns = columns;
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
    this._offset = count;
    return this;
  }
  orderBy(column: string, direction: "ASC" | "DESC") {
    this._orderBy = { column, direction };
    return this;
  }
  get(): Promise<T[]> {
    const { query, params } = this.build();
    this.clear();
    if (this._query) {
      return { query, params } as unknown as Promise<T[]>;
    }
    return this.run(query, params, { single: false, many: true });
  }
  getOne(): Promise<T> {
    const { query, params } = this.build();
    this.clear();
    if (this._query) {
      return { query, params } as unknown as Promise<T>;
    }
    return this.run(query, params, { single: true, many: false });
  }
  insert(data: object): Promise<T> {
    const columns = Object.keys(data).join(", ");
    const placeholders = Object.keys(data)
      .map(() => "?")
      .join(", ");
    const query = `INSERT INTO ${this._tableName} (${columns}) VALUES (${placeholders})`;
    const params = Object.values(data);
    this.clear();
    if (this._query) {
      return { query, params } as unknown as Promise<T>;
    }
    return this.run(query, params);
  }
  update(data: object): Promise<T> {
    const columns = Object.keys(data)
      .map((column) => `${column} = ?`)
      .join(", ");
    const query = `UPDATE ${
      this._tableName
    } SET ${columns} ${this._conditions.join(" AND ")}`;
    const params = [...Object.values(data), ...this._params];
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
    this._conditions = [];
    this._params = [];
    this._limit = undefined;
    this._offset = undefined;
    this._orderBy = undefined;
    this._tableName = "blablabla";
  }
  async run(
    query: string,
    params: (string | number | null | boolean)[],
    { single, many }: { single: boolean; many: boolean } = {
      single: false,
      many: false,
    }
  ) {
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
