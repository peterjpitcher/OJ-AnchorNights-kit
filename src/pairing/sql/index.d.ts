// Types for index.js. Keep in step with it.

export interface PairingMigrationTemplate {
  readonly name: string;
  readonly file: string;
}

export interface RenderedPairingMigration {
  name: string;
  sql: string;
}

export interface PairingMigrationFile {
  file: string;
  sql: string;
}

export declare const PAIRING_MIGRATION_TEMPLATES: readonly PairingMigrationTemplate[];

export declare function renderPairingMigrations(): RenderedPairingMigration[];
export declare function pairingMigrationFiles(options: { timestamp: string }): PairingMigrationFile[];
