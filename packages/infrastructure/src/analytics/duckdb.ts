import type * as DuckDbModuleNamespace from "@duckdb/node-api";

export interface DuckDbFactoryOptions {
  readonly mode: "memory" | "temporary";
  readonly maxRows: number;
  readonly timeoutMs: number;
}

type DuckDbModule = typeof DuckDbModuleNamespace;

export class DuckDbAnalyticsFactory {
  public constructor(private readonly options: DuckDbFactoryOptions) {}

  public describe(): DuckDbFactoryOptions {
    return this.options;
  }

  public async loadDriver(): Promise<DuckDbModule> {
    return import("@duckdb/node-api");
  }
}
