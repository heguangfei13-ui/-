import type { City, DashboardData, ProjectSnapshot, SourceMeta } from './types';

const collectedAt = '2026-08-29T09:00:00+08:00';

const commonSources: SourceMeta[] = [
  { id: 'nbs-70', name: '国家统计局｜70城住宅销售价格', url: 'https://www.stats.gov.cn/sj/zxfbhjd/202608/t20260817_1965050.html', publishedAt: '2026-08-17', collectedAt, basisVersion: 'NBS-70CITY-2026', quality: 'verified', note: '2026 年统计基期单独存储，不与旧基期直接拼接。' },
  { id: 'nbs-national', name: '国家统计局｜全国房地产开发销售', url: 'https://www.stats.gov.cn/sj/zxfb/202608/t20260817_1965053.html', publishedAt: '2026-08-17', collectedAt, basisVersion: 'NBS-NATIONAL-2026', quality: 'verified' },
  { id: 'lpr', name: '中国货币网｜贷款市场报价利率', url: 'https://www.chinamoney.com.cn/chinese/rdgz/20260820/3399885.html', publishedAt: '2026-08-20', collectedAt, basisVersion: 'LPR-2026', quality: 'verified' },
];

const baseSeries = [
  ['2025-08', 99.7, 99.4, 74, 112], ['2025-09', 99.8, 99.5, 78, 111], ['2025-10', 99.7, 99.4, 82, 110],
  ['2025-11', 99.8, 99.5, 88, 108], ['2025-12', 99.9, 99.6, 96, 106], ['2026-01', 100.0, 99.7, 68, 107],
  ['2026-02', 99.9, 99.6, 54, 108], ['2026-03', 100.0, 99.7, 91, 105], ['2026-04', 100.1, 99.7, 88, 103],
  ['2026-05', 100.0, 99.8, 85, 102], ['2026-06', 100.1, 99.8, 92, 100], ['2026-07', 100.3, 99.8, 86, 101],
] as const;

function series(city: City) {
  return baseSeries.map(([period, n, r, v, i], index) => ({
    period,
    newHomeIndex: city === 'hangzhou' ? n : Number((n - (index < 9 ? 0.2 : 0.1)).toFixed(1)),
    resaleIndex: city === 'hangzhou' ? r : Number((r - 0.1).toFixed(1)),
    volume: city === 'hangzhou' ? v : Math.round(v * 0.82),
    inventory: city === 'hangzhou' ? i : i + 8,
    basisVersion: index < 5 ? 'MONITOR-NORMALIZED-2025' : 'NBS-70CITY-2026',
  }));
}

const hzSource: SourceMeta = { id: 'hz-tmsf', name: '杭州透明售房网', url: 'https://www.tmsf.com/yhweb/', publishedAt: '2026-08-29', collectedAt, basisVersion: 'TMSF-DAILY', quality: 'stale', note: '公开入口当前返回 405；未绕过访问限制。成交量保留空值，待自动任务恢复后更新。' };
const njSource: SourceMeta = { id: 'nj-house', name: '南京网上房地产', url: 'https://www.njhouse.com.cn/projectindex.html', publishedAt: '2026-08-29', collectedAt, basisVersion: 'NJHOUSE-DAILY', quality: 'verified', note: '当日首页公开快照：本月成交面积 27.04 万㎡。' };

function pendingProject(city: City, id: string, name: string, district: string, developer: string, address: string, tags: string[], source: SourceMeta, permits: string[] = [], inventory?: { total: number; sold: number; available: number }): ProjectSnapshot {
  const destinations = city === 'hangzhou' ? ['未来科技城', '滨江', '钱江新城'] : ['河西', '软件谷', '新街口'];
  return {
    id, city, name, district, developer, address, areaRange: [null, null], averagePrice: null, totalCostRange: [null, null],
    status: 'watchlist', evidenceStatus: 'pending', score: null, tags, risks: ['价格与目标户型尚待官方销许交叉核验'], permits,
    inventory, amenities: [], commutes: destinations.map((destination) => ({ destination, transitMinutes: null, driveMinutes: null, transfers: null })), source,
  };
}

const hangzhouProjects = [
  pendingProject('hangzhou', 'hz-lucheng-xijinghenglu', '绿城溪径恒庐', '余杭区', '待官方详情核验', '余杭区', ['官方网签榜出现', '低密观察'], hzSource),
  pendingProject('hangzhou', 'hz-jiuyindanqingfu', '玖隐丹青府', '余杭区', '待官方详情核验', '余杭区', ['官方网签榜出现', '自然环境'], hzSource),
  pendingProject('hangzhou', 'hz-diantanyunzhicheng', '低碳云之城', '余杭区', '待官方详情核验', '未来科技城走廊', ['未来科技城', '产业通勤'], hzSource),
];

const nanjingProjects = [
  pendingProject('nanjing', 'nj-yuemanyunchuanfu', '樾满云川府', '江宁区', '南京满茂置业有限公司', '天元中路以北、竹山路以西', ['证照公开', '地铁走廊'], { ...njSource, url: 'https://www.njhouse.com.cn/project/info/4596200/homePage.html' }, ['预售许可与土地/规划/施工证照已公开'], { total: 640, sold: 492, available: 82 }),
  pendingProject('nanjing', 'nj-binheyuncheng', '滨河云城', '雨花台区', '南京市雨花台城镇建设综合开发有限公司', '板桥 A 地块', ['官方项目', '国资开发'], { ...njSource, url: 'https://www.njhouse.com.cn/project/info/109026/homePage.html' }, ['2026-07-07 最新开盘']),
  pendingProject('nanjing', 'nj-jinxiuchengyuefu', '锦绣前程悦府', '江宁区', '南京华滨置业有限公司', '江宁区', ['官方项目', '库存可见'], { ...njSource, url: 'https://www.njhouse.com.cn/project/info/4099150/homePage.html' }, ['2026-06-19 最新开盘'], { total: 1528, sold: 609, available: 902 }),
];

function makeDashboard(city: City): DashboardData {
  const hz = city === 'hangzhou';
  const local = hz ? hzSource : njSource;
  return {
    city, cityName: hz ? '杭州' : '南京', english: hz ? 'HANGZHOU' : 'NANJING',
    region: hz ? '西湖 · 钱塘江 · 科技走廊' : '紫金山 · 明城墙 · 长江岸线', image: hz ? '/cities/hangzhou.jpg' : '/cities/nanjing.jpg',
    score: hz ? 68 : 61, verdict: hz ? '中性偏积极 · 进入项目甄选期' : '中性 · 仍处价格与库存磨底期',
    rationale: '这是解释性信号，不是涨跌预测；建议把看房节奏与项目证据、现金流压力共同判断。', observedAt: '2026-08-29',
    metrics: [
      { label: '新房价格环比', value: hz ? '+0.3%' : '+0.1%', delta: hz ? '同比 +2.6%' : '同比 -1.8%', direction: 'up', quality: 'verified', sourceId: 'nbs-70' },
      { label: '二手房价格环比', value: '-0.2%', delta: hz ? '90–144㎡同比 -3.3%' : '90–144㎡同比 -5.4%', direction: 'down', quality: 'verified', sourceId: 'nbs-70' },
      { label: hz ? '日度网签' : '本月成交面积', value: hz ? '暂缺' : '27.04 万㎡', delta: hz ? '源站公开入口受限' : '年度累计 290.91 万㎡', direction: hz ? 'flat' : 'up', quality: hz ? 'stale' : 'verified', sourceId: hz ? 'hz-tmsf' : 'nj-house' },
      { label: '5 年期以上 LPR', value: '3.50%', delta: '2026-08-20', direction: 'flat', quality: 'verified', sourceId: 'lpr' },
      { label: '全国住宅销售面积', value: '-12.0%', delta: '2026 年 1–7 月同比', direction: 'down', quality: 'verified', sourceId: 'nbs-national' },
      { label: '数据新鲜度', value: hz ? '部分过期' : '今日', delta: hz ? '1 个源待恢复' : '核心源正常', direction: 'flat', quality: hz ? 'stale' : 'verified', sourceId: local.id },
    ],
    contributions: [
      { label: '价格动量', weight: 25, contribution: hz ? 18 : 13, note: hz ? '新房走强，二手仍弱' : '新房微升，二手承压' },
      { label: '量价关系', weight: 20, contribution: hz ? 13 : 12, note: hz ? '成交数据待恢复' : '本月成交面积可核验' },
      { label: '库存', weight: 20, contribution: hz ? 12 : 10, note: '以去化改善为加分条件' },
      { label: '信贷', weight: 15, contribution: 11, note: '5 年期以上 LPR 3.50%' },
      { label: '土地供应', weight: 10, contribution: hz ? 7 : 6, note: '关注核心区供地节奏' },
      { label: '政策', weight: 10, contribution: 7, note: '仅计已正式发布政策' },
    ],
    series: series(city),
    macro: [
      { label: '全国房地产开发投资', value: '-19.2%', change: '1–7 月同比', sourceId: 'nbs-national' },
      { label: '全国新建商品房销售额', value: '-13.1%', change: '1–7 月同比', sourceId: 'nbs-national' },
      { label: '5 年期以上 LPR', value: '3.50%', change: '月度', sourceId: 'lpr' },
      { label: '可动用现金', value: '600 万', change: '你的预算画像', sourceId: 'profile' },
    ],
    policies: [
      { date: '2026-08-20', title: '5 年期以上 LPR 维持 3.50%', impact: '贷款成本信号保持稳定', sourceId: 'lpr' },
      { date: '2026-08-17', title: '国家统计局发布 7 月住房价格指数', impact: hz ? '杭州新房环比 +0.3%' : '南京新房环比 +0.1%', sourceId: 'nbs-70' },
      { date: '2026-08-17', title: '1–7 月全国房地产数据发布', impact: '销售与投资仍处收缩区间', sourceId: 'nbs-national' },
    ],
    sources: [...commonSources, local], projects: hz ? hangzhouProjects : nanjingProjects,
  };
}

export const dashboards: Record<City, DashboardData> = { hangzhou: makeDashboard('hangzhou'), nanjing: makeDashboard('nanjing') };
export const allProjects = [...hangzhouProjects, ...nanjingProjects];
export function isCity(value: string | null): value is City { return value === 'hangzhou' || value === 'nanjing'; }
