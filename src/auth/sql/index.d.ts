// Types for index.js. Keep in step with it.

export type ProfileIdColumn = 'id' | 'user_id';

export interface AuthMigrationTemplate {
  readonly name: string;
  readonly file: string;
}

export interface RenderedMigration {
  name: string;
  sql: string;
}

export interface MigrationFile {
  file: string;
  sql: string;
}

export declare const AUTH_MIGRATION_TEMPLATES: readonly AuthMigrationTemplate[];
export declare const PROFILE_ID_COLUMNS: readonly ProfileIdColumn[];
export declare const ACTIVE_STAFF_GATE_AUDIT_SQL: string;

export declare function renderAuthMigrations(options: { profileIdColumn: ProfileIdColumn }): RenderedMigration[];
export declare function renderActiveStaffGate(tables: readonly string[]): string;
export declare function authMigrationFiles(options: {
  profileIdColumn: ProfileIdColumn;
  timestamp: string;
  gateTables?: readonly string[];
}): MigrationFile[];
