# Scoring model (implemented)

Model version is `2.1.0` in `lib/decision-model.ts`. Scores are transparent heuristics, not forecasts or investment advice.

## Axes
`fundamentals` is the city long-term axis (population 20, employment 20, industry 20, income 15, economy/fiscal 10, city scarcity 10, long supply 5). `timing` has resale volume 15, price 15, resale stock 10, new stock 10, bargaining 10, land 10, credit 10, credit demand 5, policy 5, valuation 10. `district` and `asset` are separate axes; asset weights are commute 20, location 15, nature 15, liquidity 15, supply 10, product 10, facilities 5, property 5, age 5. School is weight zero unless explicitly enabled.

Use cases are home 30% timing/70% asset, balanced 40/60, investment 50/50. `combineScores` applies the city coefficient: ≥90 1.00; ≥80 0.97; ≥70 0.92; ≥60 0.85; otherwise 0.70. It only returns a full combined numeric score when timing, asset, and city scores are all present; a partial `baseScore` is retained for explanation but is not presented as a fully qualified recommendation.

## Evidence and missingness
Each metric is mapped through explicit anchors. Evidence must be verified, finite, dated, HTTPS, and from accepted source kinds; stale, conflicting, incomplete, unsupported, or non-door-to-door commute observations reduce confidence or are excluded. Dimensions renormalize over usable metric coverage, while `coverage`, `confidence`, `status`, `plus`, `minus`, and `excluded` explain what was and was not used. This is why one missing indicator should not erase an otherwise supported axis, while an axis with no evidence remains unavailable.

## Timing cycle
`cycleStep` evaluates multi-month price/volume moving averages, inventory and bargaining slopes, land recovery and core stability. It can identify the nine states in `CYCLE_LABELS`; it requires confirmation across months and explicitly treats stages 5→6→7 as a research window, not a guaranteed return.

## Important definitions
Trend statistics expose current, MA3, MA6, MA12 and slope where the series permits. `inventoryMonths` uses stock divided by MA6 or MA12 sales. `liquidityStats`, `bargainingRate`, `supplyWithin`, `planningValue`, `natureValue`, and `commuteBasket` are pure helpers; they do not create missing source data.

