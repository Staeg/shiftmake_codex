import { randomUUID } from 'node:crypto';
import {
  LADDER_BASELINE_SETS_PER_CYCLE,
  LADDER_FINAL_CYCLE,
  generateBaselineLadderPayload,
  validateLadderRiftSetPayload,
} from '../engine/ladder';
import type { LadderCompatibilityIssue, LadderCompatibilityStatus, LadderDrawResult, LadderRiftSetPayload } from '../engine/types';

export interface LadderRiftSetRecord extends LadderDrawResult {
  appearances: number;
  spent: boolean;
  compatibilityStatus: LadderCompatibilityStatus;
  compatibilityCheckedAt: string;
  compatibilityIssues: LadderCompatibilityIssue[];
  createdAt: string;
}

export interface LadderStorageStats {
  totalRows: number;
  validRows: number;
  spentRows: number;
  incompatibleRows: number;
  approximatePayloadBytes: number;
}

export interface LadderListFilters {
  cycleNumber?: number;
  generation?: number;
  spent?: boolean;
  compatibilityStatus?: LadderCompatibilityStatus;
  limit?: number;
}

export interface LadderRepository {
  init(): Promise<void>;
  insert(record: Omit<LadderRiftSetRecord, 'createdAt' | 'compatibilityCheckedAt'> & { createdAt?: string; compatibilityCheckedAt?: string }): Promise<LadderRiftSetRecord>;
  draw(cycleNumber: number): Promise<LadderRiftSetRecord | null>;
  markCompatibility(id: string, status: LadderCompatibilityStatus, issues: LadderCompatibilityIssue[]): Promise<void>;
  incrementAppearances(id: string): Promise<void>;
  markSpent(id: string, spent: boolean): Promise<void>;
  harvestChild(parentId: string, payload: LadderRiftSetPayload): Promise<LadderRiftSetRecord>;
  list(filters?: LadderListFilters): Promise<LadderRiftSetRecord[]>;
  storageStats(): Promise<LadderStorageStats>;
  seedBaseline(): Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function validateRecord(cycleNumber: number, payload: LadderRiftSetPayload): {
  compatibilityStatus: LadderCompatibilityStatus;
  compatibilityIssues: LadderCompatibilityIssue[];
} {
  const compatibilityIssues = validateLadderRiftSetPayload(payload, cycleNumber);
  return {
    compatibilityStatus: compatibilityIssues.length === 0 ? 'valid' : 'incompatible',
    compatibilityIssues,
  };
}

export class MemoryLadderRepository implements LadderRepository {
  private records = new Map<string, LadderRiftSetRecord>();

  async init(): Promise<void> {}

  async insert(record: Omit<LadderRiftSetRecord, 'createdAt' | 'compatibilityCheckedAt'> & { createdAt?: string; compatibilityCheckedAt?: string }): Promise<LadderRiftSetRecord> {
    const next: LadderRiftSetRecord = {
      ...record,
      createdAt: record.createdAt ?? nowIso(),
      compatibilityCheckedAt: record.compatibilityCheckedAt ?? nowIso(),
    };
    this.records.set(next.id, next);
    return next;
  }

  async draw(cycleNumber: number): Promise<LadderRiftSetRecord | null> {
    const candidates = [...this.records.values()]
      .filter((record) => record.cycleNumber === cycleNumber && !record.spent && record.compatibilityStatus === 'valid')
      .sort((left, right) => left.appearances - right.appearances || left.generation - right.generation || left.createdAt.localeCompare(right.createdAt));
    return candidates[0] ?? null;
  }

  async markCompatibility(id: string, compatibilityStatus: LadderCompatibilityStatus, compatibilityIssues: LadderCompatibilityIssue[]): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, compatibilityStatus, compatibilityIssues, compatibilityCheckedAt: nowIso() });
    }
  }

  async incrementAppearances(id: string): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, appearances: record.appearances + 1 });
    }
  }

  async markSpent(id: string, spent: boolean): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, spent });
    }
  }

  async harvestChild(parentId: string, payload: LadderRiftSetPayload): Promise<LadderRiftSetRecord> {
    const parent = this.records.get(parentId);
    if (!parent) {
      throw new Error(`Unknown parent Ladder Rift-set ${parentId}.`);
    }
    const validation = validateRecord(parent.cycleNumber, payload);
    return this.insert({
      id: randomUUID(),
      cycleNumber: parent.cycleNumber,
      generation: parent.generation + 1,
      sourceSetId: parent.id,
      appearances: 0,
      spent: false,
      compatibilityStatus: validation.compatibilityStatus,
      compatibilityIssues: validation.compatibilityIssues,
      payload,
    });
  }

  async list(filters: LadderListFilters = {}): Promise<LadderRiftSetRecord[]> {
    const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));
    return [...this.records.values()]
      .filter((record) => filters.cycleNumber === undefined || record.cycleNumber === filters.cycleNumber)
      .filter((record) => filters.generation === undefined || record.generation === filters.generation)
      .filter((record) => filters.spent === undefined || record.spent === filters.spent)
      .filter((record) => filters.compatibilityStatus === undefined || record.compatibilityStatus === filters.compatibilityStatus)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async storageStats(): Promise<LadderStorageStats> {
    const records = [...this.records.values()];
    return {
      totalRows: records.length,
      validRows: records.filter((record) => record.compatibilityStatus === 'valid').length,
      spentRows: records.filter((record) => record.spent).length,
      incompatibleRows: records.filter((record) => record.compatibilityStatus !== 'valid').length,
      approximatePayloadBytes: records.reduce((sum, record) => sum + JSON.stringify(record.payload).length, 0),
    };
  }

  async seedBaseline(): Promise<void> {
    for (let cycleNumber = 1; cycleNumber <= LADDER_FINAL_CYCLE; cycleNumber += 1) {
      const existing = (await this.list({ cycleNumber, generation: 0, limit: 500 })).length;
      for (let index = existing; index < LADDER_BASELINE_SETS_PER_CYCLE; index += 1) {
        const payload = generateBaselineLadderPayload(10_000 + cycleNumber * 1_000 + index, cycleNumber);
        const validation = validateRecord(cycleNumber, payload);
        await this.insert({
          id: randomUUID(),
          cycleNumber,
          generation: 0,
          sourceSetId: null,
          appearances: 0,
          spent: false,
          compatibilityStatus: validation.compatibilityStatus,
          compatibilityIssues: validation.compatibilityIssues,
          payload,
        });
      }
    }
  }
}

export class PostgresLadderRepository implements LadderRepository {
  private pool: any = null;

  constructor(private readonly connectionString: string) {}

  private async getPool(): Promise<any> {
    if (!this.pool) {
      const importer = new Function('moduleName', 'return import(moduleName);') as (moduleName: string) => Promise<any>;
      const pg = await importer('pg');
      this.pool = new pg.Pool({ connectionString: this.connectionString });
    }
    return this.pool;
  }

  async init(): Promise<void> {
    const pool = await this.getPool();
    await pool.query(`
      create table if not exists ladder_rift_sets (
        id uuid primary key,
        cycle_number integer not null,
        generation integer not null,
        source_set_id uuid null references ladder_rift_sets(id),
        appearances integer not null default 0,
        spent boolean not null default false,
        compatibility_status text not null,
        compatibility_checked_at timestamptz not null,
        compatibility_issues jsonb not null default '[]'::jsonb,
        payload jsonb not null,
        created_at timestamptz not null default now()
      );
      create index if not exists ladder_rift_sets_draw_idx on ladder_rift_sets (cycle_number, spent, compatibility_status);
      create index if not exists ladder_rift_sets_generation_idx on ladder_rift_sets (cycle_number, generation);
      create index if not exists ladder_rift_sets_created_at_idx on ladder_rift_sets (created_at);
    `);
  }

  private rowToRecord(row: any): LadderRiftSetRecord {
    return {
      id: row.id,
      cycleNumber: Number(row.cycle_number),
      generation: Number(row.generation),
      sourceSetId: row.source_set_id ?? null,
      appearances: Number(row.appearances),
      spent: row.spent === true,
      compatibilityStatus: row.compatibility_status,
      compatibilityCheckedAt: new Date(row.compatibility_checked_at).toISOString(),
      compatibilityIssues: row.compatibility_issues ?? [],
      payload: row.payload,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async insert(record: Omit<LadderRiftSetRecord, 'createdAt' | 'compatibilityCheckedAt'> & { createdAt?: string; compatibilityCheckedAt?: string }): Promise<LadderRiftSetRecord> {
    const pool = await this.getPool();
    const result = await pool.query(
      `insert into ladder_rift_sets
        (id, cycle_number, generation, source_set_id, appearances, spent, compatibility_status, compatibility_checked_at, compatibility_issues, payload, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
       on conflict (id) do update set id = excluded.id
       returning *`,
      [
        record.id,
        record.cycleNumber,
        record.generation,
        record.sourceSetId,
        record.appearances,
        record.spent,
        record.compatibilityStatus,
        record.compatibilityCheckedAt ?? nowIso(),
        JSON.stringify(record.compatibilityIssues),
        JSON.stringify(record.payload),
        record.createdAt ?? nowIso(),
      ],
    );
    return this.rowToRecord(result.rows[0]);
  }

  async draw(cycleNumber: number): Promise<LadderRiftSetRecord | null> {
    const pool = await this.getPool();
    const result = await pool.query(
      `select * from ladder_rift_sets
       where cycle_number = $1 and spent = false and compatibility_status = 'valid'
       order by appearances asc, generation asc, random()
       limit 1`,
      [cycleNumber],
    );
    return result.rows[0] ? this.rowToRecord(result.rows[0]) : null;
  }

  async markCompatibility(id: string, compatibilityStatus: LadderCompatibilityStatus, compatibilityIssues: LadderCompatibilityIssue[]): Promise<void> {
    const pool = await this.getPool();
    await pool.query(
      `update ladder_rift_sets set compatibility_status = $2, compatibility_issues = $3::jsonb, compatibility_checked_at = now() where id = $1`,
      [id, compatibilityStatus, JSON.stringify(compatibilityIssues)],
    );
  }

  async incrementAppearances(id: string): Promise<void> {
    const pool = await this.getPool();
    await pool.query(`update ladder_rift_sets set appearances = appearances + 1 where id = $1`, [id]);
  }

  async markSpent(id: string, spent: boolean): Promise<void> {
    const pool = await this.getPool();
    await pool.query(`update ladder_rift_sets set spent = $2 where id = $1`, [id, spent]);
  }

  async harvestChild(parentId: string, payload: LadderRiftSetPayload): Promise<LadderRiftSetRecord> {
    const parent = (await this.list({ limit: 1 })).find((record) => record.id === parentId) ?? (await this.getById(parentId));
    if (!parent) {
      throw new Error(`Unknown parent Ladder Rift-set ${parentId}.`);
    }
    const validation = validateRecord(parent.cycleNumber, payload);
    return this.insert({
      id: randomUUID(),
      cycleNumber: parent.cycleNumber,
      generation: parent.generation + 1,
      sourceSetId: parent.id,
      appearances: 0,
      spent: false,
      compatibilityStatus: validation.compatibilityStatus,
      compatibilityIssues: validation.compatibilityIssues,
      payload,
    });
  }

  private async getById(id: string): Promise<LadderRiftSetRecord | null> {
    const pool = await this.getPool();
    const result = await pool.query(`select * from ladder_rift_sets where id = $1`, [id]);
    return result.rows[0] ? this.rowToRecord(result.rows[0]) : null;
  }

  async list(filters: LadderListFilters = {}): Promise<LadderRiftSetRecord[]> {
    const pool = await this.getPool();
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      where.push(sql.replace('?', `$${values.length}`));
    };
    if (filters.cycleNumber !== undefined) add('cycle_number = ?', filters.cycleNumber);
    if (filters.generation !== undefined) add('generation = ?', filters.generation);
    if (filters.spent !== undefined) add('spent = ?', filters.spent);
    if (filters.compatibilityStatus !== undefined) add('compatibility_status = ?', filters.compatibilityStatus);
    values.push(Math.max(1, Math.min(filters.limit ?? 100, 500)));
    const result = await pool.query(
      `select * from ladder_rift_sets ${where.length > 0 ? `where ${where.join(' and ')}` : ''} order by created_at desc limit $${values.length}`,
      values,
    );
    return result.rows.map((row: any) => this.rowToRecord(row));
  }

  async storageStats(): Promise<LadderStorageStats> {
    const pool = await this.getPool();
    const result = await pool.query(`
      select
        count(*)::int as total_rows,
        count(*) filter (where compatibility_status = 'valid')::int as valid_rows,
        count(*) filter (where spent = true)::int as spent_rows,
        count(*) filter (where compatibility_status != 'valid')::int as incompatible_rows,
        coalesce(sum(octet_length(payload::text)), 0)::int as approximate_payload_bytes
      from ladder_rift_sets
    `);
    const row = result.rows[0];
    return {
      totalRows: Number(row.total_rows),
      validRows: Number(row.valid_rows),
      spentRows: Number(row.spent_rows),
      incompatibleRows: Number(row.incompatible_rows),
      approximatePayloadBytes: Number(row.approximate_payload_bytes),
    };
  }

  async seedBaseline(): Promise<void> {
    for (let cycleNumber = 1; cycleNumber <= LADDER_FINAL_CYCLE; cycleNumber += 1) {
      const existing = (await this.list({ cycleNumber, generation: 0, limit: 500 })).length;
      for (let index = existing; index < LADDER_BASELINE_SETS_PER_CYCLE; index += 1) {
        const payload = generateBaselineLadderPayload(10_000 + cycleNumber * 1_000 + index, cycleNumber);
        const validation = validateRecord(cycleNumber, payload);
        await this.insert({
          id: randomUUID(),
          cycleNumber,
          generation: 0,
          sourceSetId: null,
          appearances: 0,
          spent: false,
          compatibilityStatus: validation.compatibilityStatus,
          compatibilityIssues: validation.compatibilityIssues,
          payload,
        });
      }
    }
  }
}

let sharedRepository: LadderRepository | null = null;

export function getLadderRepository(env: NodeJS.ProcessEnv = process.env): LadderRepository {
  if (!sharedRepository) {
    const databaseUrl = env.LADDER_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
    sharedRepository = databaseUrl ? new PostgresLadderRepository(databaseUrl) : new MemoryLadderRepository();
  }
  return sharedRepository;
}

export function resetLadderRepositoryForTests(repository: LadderRepository | null = null): void {
  sharedRepository = repository;
}
