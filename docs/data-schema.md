# Data and provenance

## Shared records
`lib/types.ts` is the application contract. `DashboardData` contains city identity, metrics, market series, macro/policies/sources, projects, evidence, hierarchy and cycle history. `ProjectSnapshot` contains identity, optional housing type, budget/area fields, evidence status, scores, amenities, commutes, AMap metadata, source and optional `salesHistory`. `SourceMeta` carries URL, publisher/name, publication and collection times, basis version and quality. `Observation` in `lib/decision-model.ts` carries metric value, period, basis, source list, frequency, verification, completeness and method.

`ProjectSalesSnapshot` is deliberately named and scoped `all-project-uses`: total/sold/available/subscribed/todaySold are official project-page cumulative counters, not resale household transactions. `catalogIdentity.verified` means name/project identity was matched to a public source; it does not mean a current listing, price, score, or recommendation.

## D1 tables
`dashboard_snapshots` stores versioned city payloads; `projects` stores normalized project fields and JSON details; `amenities`, `commute_estimates`, and `policies` store related evidence; `visitor_preferences` stores per-visitor settings; `refresh_requests` tracks requested refreshes; `ingestion_runs` stores idempotency/checksum status; `source_health` stores last attempts, successes and consecutive failures. Schema and migrations live in `db/schema.ts` and `drizzle/`.

## Sources and cadence
National Bureau of Statistics 70-city/national releases are monthly; LPR is monthly; Nanjing online real-estate public project pages are attempted daily; Hangzhou identity sources are rechecked on a slower cadence because the public entry currently returns 405/blocked; AMap POI/routes use a seven-day cache. Every source failure retains its last valid value and marks health stale. The allowlist and exact source URLs are in `data/catalog-sources.json`.

## Non-negotiable integrity rules
Never join series across a `basisVersion` break. Never turn missing prices, coordinates, resale records, or evidence into guessed values. Keep immutable archives before ingest. Do not expose tokens, private cookies, contact details, or gated provider payloads.

