import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const dashboardSnapshots = sqliteTable('dashboard_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  city: text('city').notNull(),
  period: text('period').notNull(),
  payloadJson: text('payload_json').notNull(),
  checksum: text('checksum').notNull(),
  observedAt: text('observed_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('dashboard_city_period_uidx').on(table.city, table.period),
  index('dashboard_city_observed_idx').on(table.city, table.observedAt),
]);

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), city: text('city').notNull(), name: text('name').notNull(), district: text('district').notNull(),
  developer: text('developer'), address: text('address'), areaMin: real('area_min'), areaMax: real('area_max'), avgPrice: real('avg_price'),
  estimatedTotalMin: real('estimated_total_min'), estimatedTotalMax: real('estimated_total_max'), deliveryDate: text('delivery_date'),
  sourceName: text('source_name').notNull(), sourceUrl: text('source_url').notNull(), updatedAt: text('updated_at').notNull(),
  preservationScore: real('preservation_score'), environmentScore: real('environment_score'), commuteScore: real('commute_score'),
  riskPenalty: real('risk_penalty').default(0), finalScore: real('final_score'), evidenceStatus: text('evidence_status').notNull().default('pending'),
  riskFlagsJson: text('risk_flags_json').notNull().default('[]'), detailJson: text('detail_json').notNull().default('{}'),
}, (table) => [index('projects_city_score_idx').on(table.city, table.finalScore), index('projects_city_total_idx').on(table.city, table.estimatedTotalMin)]);

export const amenities = sqliteTable('amenities', {
  id: integer('id').primaryKey({ autoIncrement: true }), projectId: text('project_id').notNull().references(() => projects.id),
  category: text('category').notNull(), name: text('name').notNull(), distanceMeters: integer('distance_meters'), sourceUrl: text('source_url').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [index('amenities_project_idx').on(table.projectId)]);

export const commuteEstimates = sqliteTable('commute_estimates', {
  id: integer('id').primaryKey({ autoIncrement: true }), projectId: text('project_id').notNull().references(() => projects.id),
  destination: text('destination').notNull(), mode: text('mode').notNull(), minutes: integer('minutes').notNull(), transfers: integer('transfers'),
  sourceName: text('source_name').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [index('commute_project_idx').on(table.projectId)]);

export const policies = sqliteTable('policies', {
  id: text('id').primaryKey(), city: text('city').notNull(), title: text('title').notNull(), publishedAt: text('published_at').notNull(), impact: text('impact').notNull(), sourceUrl: text('source_url').notNull(),
}, (table) => [index('policies_city_date_idx').on(table.city, table.publishedAt)]);

export const ingestionRuns = sqliteTable('ingestion_runs', {
  runId: text('run_id').primaryKey(), schemaVersion: integer('schema_version').notNull(), checksum: text('checksum').notNull(),
  observedAt: text('observed_at').notNull(), status: text('status').notNull(), createdAt: text('created_at').notNull(), error: text('error'),
});

export const sourceHealth = sqliteTable('source_health', {
  sourceId: text('source_id').primaryKey(), sourceName: text('source_name').notNull(), status: text('status').notNull(),
  lastSuccessAt: text('last_success_at'), lastAttemptAt: text('last_attempt_at').notNull(), consecutiveFailures: integer('consecutive_failures').notNull().default(0), note: text('note'),
});
