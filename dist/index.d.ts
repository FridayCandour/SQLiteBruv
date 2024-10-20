type Params = string | number | null | boolean;
export declare class SqliteBruv<T = Record<string, Params>> {
    private db;
    private _columns;
    private _conditions;
    private _tableName?;
    private _params;
    private _limit?;
    private _offset?;
    private _orderBy?;
    private _query;
    private _D1_api_key?;
    private _D1_url?;
    private _logging;
    constructor({ db, D1, logging, }?: {
        db?: any;
        D1?: {
            accountId: string;
            databaseId: string;
            apiKey: string;
        };
        logging?: boolean;
    });
    from<Model extends Record<string, any> = Record<string, any>>(tableName: string): SqliteBruv<Model>;
    select(...columns: string[]): this;
    where(condition: string, ...params: Params[]): this;
    andWhere(condition: string, ...params: Params[]): this;
    orWhere(condition: string, ...params: Params[]): this;
    limit(count: number): this;
    offset(count: number): this;
    orderBy(column: string, direction: "ASC" | "DESC"): this;
    get(): Promise<T[]>;
    getOne(): Promise<T>;
    insert(data: Partial<T>, returning?: boolean): Promise<T>;
    update(data: Partial<T>, returning?: boolean): Promise<T>;
    delete(returning?: boolean): Promise<T>;
    private build;
    clear(): void;
    run(query: string, params: (string | number | null | boolean)[], { single }?: {
        single?: boolean;
    }): Promise<any>;
}
export {};
