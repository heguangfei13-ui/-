'use client';
import { useEffect, useRef } from 'react';
import type { MarketSeriesPoint } from '@/lib/types';
export default function MarketChart({ points, color }: { points: MarketSeriesPoint[]; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let chart: import('echarts').ECharts | undefined;
    let resize: (() => void) | undefined;
    let active = true;
    import('echarts').then((echarts) => {
      if (!active || !ref.current) return;
      chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
      chart.setOption({ animationDuration: 650, tooltip: { trigger: 'axis', backgroundColor: '#13251f', borderWidth: 0, textStyle: { color: '#fff' } }, legend: { top: 0, right: 0, textStyle: { color: '#66736d' }, data: ['新房环比指数', '二手房环比指数', '成交活跃度'] }, grid: { left: 46, right: 42, top: 45, bottom: 34 }, xAxis: { type: 'category', data: points.map((p) => p.period.slice(5)), axisLine: { lineStyle: { color: '#cdd8d2' } }, axisLabel: { color: '#77817c' } }, yAxis: [{ type: 'value', min: 99, max: 100.5, axisLabel: { color: '#77817c' }, splitLine: { lineStyle: { color: '#edf1ef' } } }, { type: 'value', min: 0, max: 120, axisLabel: { show: false }, splitLine: { show: false } }], series: [{ name: '成交活跃度', type: 'bar', yAxisIndex: 1, data: points.map((p) => p.volume), itemStyle: { color: `${color}26`, borderRadius: [5, 5, 0, 0] }, barMaxWidth: 22 }, { name: '新房环比指数', type: 'line', data: points.map((p) => p.newHomeIndex), smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { color, width: 3 }, itemStyle: { color } }, { name: '二手房环比指数', type: 'line', data: points.map((p) => p.resaleIndex), smooth: true, symbol: 'diamond', symbolSize: 7, lineStyle: { color: '#8b6b4a', width: 2, type: 'dashed' }, itemStyle: { color: '#8b6b4a' } }] });
      resize = () => chart?.resize(); window.addEventListener('resize', resize);
    });
    return () => { active = false; if (resize) window.removeEventListener('resize', resize); chart?.dispose(); };
  }, [points, color]);
  return <div ref={ref} className="market-chart" role="img" aria-label="新房、二手房价格指数与成交活跃度联动图" />;
}
