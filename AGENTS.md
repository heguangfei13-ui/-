# Home Compass agent guide

## Purpose
Home Compass is an evidence-first, public read-only intelligence terminal for a 2027 home purchase in Hangzhou or Nanjing. It helps answer two separate questions: whether the market timing is attractive, and which city/district/community assets are more resilient. It is not a short-term price forecast.

## Boundaries
- Treat the repository as the durable project memory. A decision is incomplete until documented.
- Keep Data, Scoring, and UI responsibilities separate. UI renders API/model results; it must not invent evidence, prices, scores, or fallback values.
- Keep Score and Confidence distinct. Missing or stale evidence reduces coverage/confidence; it must not silently become zero, fifty, or a guessed substitute.
- Use authoritative, attributable HTTPS sources. Never bypass login, CAPTCHA, anti-bot controls, or redistribute provider data without permission.
- Reuse existing types and schemas. Do not create duplicate domain models in components or adapters.
- Preserve source timestamps, basis versions, quality, and failure fallback semantics.

## Before editing
- Product or UX work: read `docs/product.md` and `docs/design-system.md`.
- Scoring/model work: read `docs/scoring-model.md` and `lib/decision-model.ts`.
- API, persistence, or collectors: read `docs/architecture.md`, `docs/data-schema.md`, and the relevant route/schema/script.
- Update the relevant docs whenever behavior, data provenance, scoring rules, or user-visible constraints change.

## Validation
Run `npx tsc --noEmit`, `npm run lint`, `npm test`, the applicable Python unittest suite, and `npm run build` for substantive changes. Do not publish without explicit user approval. Do not treat a green collector run as proof that a source was current or complete.

