export interface BruvSchema<Model> {
  name: string;
  columns: {
    [x in keyof Omit<Model, "_id">]: SchemaColumnOptions;
  };
}

export interface SchemaColumnOptions {
  type: "INTEGER" | "REAL" | "TEXT" | "DATETIME";
  required?: boolean;
  unique?: boolean;
  default?: () => any;
  target?: string;
  relationType?: "MANY" | "ONE";
}
