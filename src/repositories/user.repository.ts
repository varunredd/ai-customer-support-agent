import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { StaffRole, StaffUser, StaffUserStatus } from "@/domain/auth/types";

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: StaffRole;
  status: StaffUserStatus;
  created_at: string;
  updated_at: string;
}

function mapUser(row: UserRow): StaffUser {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UserRepository {
  constructor(private readonly db: AppDatabase) {}

  findByEmail(tenantId: string, email: string): (StaffUser & { passwordHash: string }) | null {
    const row = this.db.prepare(`
      SELECT id, tenant_id, email, password_hash, role, status, created_at, updated_at
      FROM users
      WHERE tenant_id = ? AND email = ? COLLATE NOCASE
    `).get(tenantId, email.trim()) as UserRow | undefined;
    if (!row) return null;
    return { ...mapUser(row), passwordHash: row.password_hash };
  }

  findById(userId: string): StaffUser | null {
    const row = this.db.prepare(`
      SELECT id, tenant_id, email, password_hash, role, status, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(userId) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  findByIdForTenant(tenantId: string, userId: string): StaffUser | null {
    const row = this.db.prepare(`
      SELECT id, tenant_id, email, password_hash, role, status, created_at, updated_at
      FROM users
      WHERE tenant_id = ? AND id = ?
    `).get(tenantId, userId) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  listByTenant(tenantId: string): StaffUser[] {
    return (this.db.prepare(`
      SELECT id, tenant_id, email, password_hash, role, status, created_at, updated_at
      FROM users
      WHERE tenant_id = ?
      ORDER BY created_at ASC
    `).all(tenantId) as UserRow[]).map(mapUser);
  }

  updateUser(
    tenantId: string,
    userId: string,
    patch: { role?: StaffRole; status?: StaffUserStatus },
  ): StaffUser {
    const existing = this.findByIdForTenant(tenantId, userId);
    if (!existing) throw new Error("Staff user was not found.");
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE users
      SET role = ?, status = ?, updated_at = ?
      WHERE tenant_id = ? AND id = ?
    `).run(
      patch.role ?? existing.role,
      patch.status ?? existing.status,
      now,
      tenantId,
      userId,
    );
    return this.findByIdForTenant(tenantId, userId)!;
  }

  createUser(input: {
    tenantId: string;
    email: string;
    passwordHash: string;
    role: StaffRole;
    status?: StaffUserStatus;
  }): StaffUser {
    const now = new Date().toISOString();
    const id = `usr_${randomUUID()}`;
    this.db.prepare(`
      INSERT INTO users (
        id, tenant_id, email, password_hash, role, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.tenantId,
      input.email.trim().toLowerCase(),
      input.passwordHash,
      input.role,
      input.status ?? "ACTIVE",
      now,
      now,
    );
    return this.findById(id)!;
  }
}
