export type City = 'hangzhou' | 'nanjing';
export type QualityStatus = 'verified' | 'estimated' | 'stale' | 'pending';
export interface SourceMeta { id: string; name: string; url: string; publishedAt: string; collectedAt: string; basisVersion: string; quality: QualityStatus; note?: string }
export interface MarketSeriesPoint { period: string; newHomeIndex: number | null; resaleIndex: number | null; volume: number | null; inventory: number | null; basisVersion: string }
export interface ProjectSnapshot {
  id: string; city: City; name: string; district: string; developer: string; address: string;
  areaRange: [number | null, number | null]; averagePrice: number | null; totalCostRange: [number | null, number | null];
  status: 'recommended' | 'watchlist'; evidenceStatus: 'verified' | 'pending'; score: number | null;
  scoreParts?: { preservation: number; environment: number; commute: number; riskPenalty: number };
  tags: string[]; risks: string[]; permits: string[]; inventory?: { total: number; sold: number; available: number };
  amenities: { category: string; name: string; distance?: string }[];
  commutes: { destination: string; transitMinutes: number | null; driveMinutes: number | null; transfers: number | null }[];
  source: SourceMeta;
}
export interface DashboardData {
  city: City; cityName: string; english: string; region: string; image: string; score: number; verdict: string; rationale: string; observedAt: string;
  metrics: { label: string; value: string; delta: string; direction: 'up' | 'down' | 'flat'; quality: QualityStatus; sourceId: string }[];
  contributions: { label: string; weight: number; contribution: number; note: string }[];
  series: MarketSeriesPoint[]; macro: { label: string; value: string; change: string; sourceId: string }[];
  policies: { date: string; title: string; impact: string; sourceId: string }[]; sources: SourceMeta[]; projects: ProjectSnapshot[];
}
