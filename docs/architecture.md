# Architecture (current)

The app is a Vinext/React/TypeScript site deployed through Sites with a D1 binding. `app/` contains routes, pages, API handlers, and presentation components. `lib/` contains shared domain types, preferences, evidence enrichment, catalog merging, scoring and decision adaptation. `db/schema.ts` defines the durable D1 tables. `scripts/collect.py` is the scheduled collector/orchestrator; `scripts/catalog.py` handles bounded official project catalog snapshots; `scripts/enrich.py` handles verified enrichment. `tests/` contains TypeScript and Python fixtures/tests.

Data flow: scheduled GitHub Actions fetches allow-listed public sources → validates shape, reconciliation, date/basis and provenance → archives raw/selected evidence → POSTs a versioned checksum payload to `/api/ingest/v1/snapshots` → D1 stores immutable city snapshots, projects and health → GET APIs return saved snapshots only. Browser visits do not scrape external sites. A settings save creates a refresh request; it does not synchronously scrape.

The UI calls `useDashboard`, `assessDashboard`, and shared types. `withVerifiedEvidence`/`withCatalog` merge only verified or explicitly marked catalog identity; catalog merge preserves existing price, score, asset evidence, and newer sales observations. Map coordinates/routes are accepted only with appropriate AMap precision metadata.

## Deliberate conflicts / facts to remember
- The historical plan proposed a fully complete city-wide directory and resale transaction feed; current code intentionally reports `complete: false` and `resaleTransactions: 0`.
- The original plan mentioned ECharts and MapLibre; MapLibre is present and ECharts is a dependency, but charts are not a guarantee of complete source coverage.
- The public Sites domain can be blocked by Cloudflare for some networks; this is deployment-edge behavior, not an application fallback.

