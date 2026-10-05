import { db } from "./db.js";

/** Central audit helper — every mutating action in every module logs here. */
export function logActivity(opts: {
  module?: string;
  projectId?: number | null;
  userId: number;
  action: string;
  entityType?: string;
  entityId?: number;
  details?: string;
}) {
  db.prepare(
    `INSERT INTO activity (module, project_id, user_id, action, entity_type, entity_id, details)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    opts.module || "presales",
    opts.projectId ?? null,
    opts.userId,
    opts.action,
    opts.entityType ?? null,
    opts.entityId ?? null,
    opts.details ?? null
  );
}
