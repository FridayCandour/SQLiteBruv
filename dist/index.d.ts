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
interface Query {
    from: string;
    select?: string[];
    where?: {
        condition: string;
        params: any[];
    }[];
    andWhere?: {
        condition: string;
        params: any[];
    }[];
    orWhere?: {
        condition: string;
        params: any[];
    }[];
    orderBy?: {
        column: string;
        direction: "ASC" | "DESC";
    };
    limit?: number;
    offset?: number;
    cacheAs?: string;
    invalidateCache?: string;
    action?: "get" | "getOne" | "insert" | "update" | "delete" | "count";
    data?: any;
}
interface TursoConfig {
    url: string;
    authToken: string;
}
export declare class SqliteBruv<T extends Record<string, Params> = Record<string, Params>> {
    static migrationFolder: string;
    db: any;
    dbMem: any;
    private _columns;
    private _conditions;
    private _tableName?;
    private _params;
    private _cacheName?;
    private _limit?;
    private _offset?;
    private _orderBy?;
    private _query;
    private _D1_api_key?;
    private _D1_url?;
    private _logging;
    private _hotCache;
    private _turso?;
    private readonly MAX_PARAMS;
    private readonly ALLOWED_OPERATORS;
    private readonly DANGEROUS_PATTERNS;
    constructor({ D1, turso, logging, schema, name, }: {
        D1?: {
            accountId: string;
            databaseId: string;
            apiKey: string;
        };
        turso?: TursoConfig;
        schema: Schema[];
        logging?: boolean;
        name?: string;
    });
    from<Model extends Record<string, any> = Record<string, any>>(tableName: string): SqliteBruv<Model>;
    select(...columns: string[]): this;
    private validateCondition;
    private validateParams;
    where(condition: string, ...params: Params[]): this;
    andWhere(condition: string, ...params: Params[]): this;
    orWhere(condition: string, ...params: Params[]): this;
    limit(count: number): this;
    offset(count: number): this;
    orderBy(column: string, direction: "ASC" | "DESC"): this;
    cacheAs(cacheName: string): this;
    invalidateCache(cacheName: string): this;
    get(): Promise<T[]>;
    getOne(): Promise<T>;
    insert(data: T): Promise<T>;
    update(data: Partial<T>): Promise<T>;
    delete(): Promise<T>;
    count(): Promise<{
        count: number;
    }>;
    executeJsonQuery(query: Query): Promise<any>;
    private build;
    clear(): void;
    private run;
    private executeTursoQuery;
    raw(raw: string, params?: (string | number | boolean)[]): Promise<any>;
    cacheResponse(response: any): Promise<any>;
}
export declare class Schema<Model extends Record<string, any> = {}> {
    private string;
    name: string;
    db?: SqliteBruv;
    columns: {
        [x in keyof Omit<Model, "_id">]: SchemaColumnOptions;
    };
    constructor(def: BruvSchema<Model>);
    get query(): SqliteBruv<Record<string, any>>;
    queryRaw(raw: string): Promise<any>;
    _induce(): void;
    toString(): string;
}
export declare const Id: () => string;
export {};
