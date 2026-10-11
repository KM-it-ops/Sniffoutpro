export interface JournalEntry {
  readonly tag: string;
  readonly when: number;
}

export interface CatalogSnapshot {
  readonly tables: ReadonlySet<string>;
  /** `table.column` */
  readonly columns: ReadonlySet<string>;
  readonly constraints: ReadonlySet<string>;
  readonly indexes: ReadonlySet<string>;
}

export interface RequiredObjects {
  readonly tables: readonly string[];
  readonly columns: readonly string[];
  readonly constraints: readonly string[];
  readonly indexes: readonly string[];
}

export interface BaselineDecision {
  readonly tag: string;
  readonly when: number;
  readonly record: boolean;
  readonly reason: string;
}

export declare const PRE_LEDGER_TAGS: readonly string[];

export declare function requiredObjects(sqlText: string): RequiredObjects;

export declare function planBaseline(input: {
  readonly entries: readonly JournalEntry[];
  readonly sqlByTag: ReadonlyMap<string, string>;
  /** created_at of the newest ledger row, or null when the ledger is empty or absent. */
  readonly ledgerHighWater: number | null;
  readonly catalog: CatalogSnapshot;
}): BaselineDecision[];
