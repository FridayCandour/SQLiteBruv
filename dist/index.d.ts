type Params = string | number | null | boolean;
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
    constructor({ D1, logging, schema, name, }: {
        D1?: {
            accountId: string;
            databaseId: string;
            apiKey: string;
        };
        schema: Schema[];
        logging?: boolean;
        name?: string;
    });
    from<Model extends Record<string, any> = Record<string, any>>(tableName: string): SqliteBruv<Model>;
    select(...columns: string[]): this;
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
    private build;
    clear(): void;
    private run;
    raw(raw: string, params?: (string | number | boolean)[]): Promise<any>;
    cacheResponse(response: any): Promise<any>;
}
export declare class Schema<Model extends Record<string, any> = {}> {
    name: string;
    db?: SqliteBruv;
    columns: {
        [x in keyof Omit<Model, "_id">]: SchemaColumnOptions;
    };
    constructor(def: BruvSchema<Model>);
    get query(): SqliteBruv<Record<string, any>>;
    queryRaw(raw: string): Promise<any>;
    induce(): void;
}
export {};
