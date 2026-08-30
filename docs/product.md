# Product contract

## Goal and audience
Home Compass supports a long-term self-use buyer with asset-preservation concerns, initially comparing Hangzhou and Nanjing. The current default profile is purchase year 2027, cash 600万元, total-cost range 500–800万元, target area 110–140㎡, and housing type configurable (the saved profile may use “不限”). School quality is excluded unless the user explicitly enables it.

The product separates market timing from asset quality. Timing asks “is this city/district an attractive buying window?” Asset quality asks “which district/community/listing is more resilient and useful over the long term?” A large price fall alone is never a buy signal.

## Hierarchy and routes
The research hierarchy is 中国宏观 → 城市 → 板块 → 小区/楼盘 (with listing as a future detail layer). `/?city=&view=` drives the terminal views; `/settings` stores profile and refresh requests; `/cashflow` is the separate loan/cash-flow calculator. API routes are under `/api/dashboard`, `/api/projects`, `/api/projects/:id`, `/api/settings`, and authenticated ingest routes.

## UX contract
The terminal uses a dark, restrained, map-driven interface. The first viewport emphasizes “现在适合买房吗？” and keeps explanations, confidence, evidence, and risks visible. City changes atomically update data, image/background, accent palette, map and charts. Map modes are city/district/property; layers are opportunity, commute, nature, and supply. Favorites are browser-local. No school metric enters scoring by default.

## Current limitations
The repository currently has partial, evidence-backed data rather than a complete city directory. Project identity is not proof of a current offer. Official Nanjing cumulative project sales can include commercial/car-park uses and are not resale residential transactions. Beike OAuth has been tested, but the transaction product returned an access error; no Beike data is used. See `CATALOG_COVERAGE.md`.

