# Design system and interaction contract

Home Compass uses a premium dark intelligence-terminal language: background `#070A0F`/`#080B10`, surfaces `#0F141C` and `#151C26`, low-contrast borders, near-white primary text, cool-gray secondary text, mint/emerald opportunity accent, amber warning and soft red risk. Rounded surfaces are generally 16–24px; hierarchy, borders and spacing carry depth instead of heavy shadows or glow.

The visual center is the current buying-window answer and Opportunity Compass. Full-width sections prioritize Overview, map intelligence, market pulse, district ranking and cycle timeline. MapLibre provides a dark map; score nodes, not generic pins, represent districts/communities. City themes swap the saved Hangzhou West Lake and Nanjing autumn images and accent/control colors atomically.

Shared terminal components include `OverviewHero`, `OpportunityCompass`/score primitives, `MarketPulse`, `CycleTimeline`, `IntelligenceMap`, `DistrictRanking`, `CityIntelligence`, `PropertyDetail`, `ScoreExplanation`, `CommandPalette` and `MapLayerSwitcher`. Keep charts on the custom dark theme. Motion is short and restrained (count-up/path draw/fade/fly-to); respect reduced motion. Desktop map is dominant; on mobile ranking/detail become sheets/drawers. New components should compose shared primitives rather than copy card/score markup.

This document records the intended language; inspect `app/terminal.css` and the components for the exact current implementation before changing tokens.

