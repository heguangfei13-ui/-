'use client';
import { useEffect, useRef } from 'react';
import type { ProjectSnapshot } from '@/lib/types';

export default function ProjectEvidence({ project, onClose }: { project: ProjectSnapshot; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const map = project.amapMeta;
  return <dialog ref={dialog} className="project-modal evidence-dialog" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }} aria-label={`${project.name}详情`}>
    <div>
      <button className="modal-close" onClick={onClose} aria-label="关闭详情">×</button>
      <p className="eyebrow">OFFICIAL EVIDENCE</p><h2>{project.name}</h2><p>{project.address}</p>
      <dl><div><dt>开发商</dt><dd>{project.developer}</dd></div><div><dt>推荐资格</dt><dd>暂未获得 · 价格与户型证据不完整</dd></div><div><dt>目标总成本</dt><dd>待核验 500–800 万区间</dd></div></dl>
      {project.inventory && <div className="modal-inventory"><b>销售快照</b><span>总套数 {project.inventory.total}</span><span>已成交 {project.inventory.sold}</span><span>可售 {project.inventory.available}</span></div>}
      <h3>三条通勤估计</h3>
      <p className="chart-note">就业走廊使用下列代表地点，并非你的实际办公地址。时间为查询时估计，不代表工作日高峰；公交时间包含步行与等车。</p>
      {map?.address && <p className="chart-note">匹配起点：{map.address}（{map.level}级，未核验具体出入口）</p>}
      {map?.error && <p className="data-alert">△ 本次未完整刷新：{map.error}。有历史值时保留原采集日期，否则留空。</p>}
      <div className="commute-list">{project.commutes.map((c) => <div key={c.destination}><b>{c.destination}</b><small>{c.destinationAddress ?? '代表地点待核验'}</small><span>公交 {c.transitMinutes != null ? `约 ${c.transitMinutes} 分钟 · ${c.transfers == null ? '换乘待核验' : `${c.transfers} 次换乘`}` : '待刷新'}</span><span>驾车 {c.driveMinutes != null ? `约 ${c.driveMinutes} 分钟` : '待刷新'}</span></div>)}</div>
      {project.amenities.length > 0 && <><h3>3 公里范围内 POI</h3><p className="chart-note">距离为地图返回值，不等于步行距离；地铁站收录不保证已运营，医院名称也不代表等级或诊疗能力。</p><div className="tag-row">{project.amenities.map((item) => <span key={`${item.category}-${item.name}`}>{item.category} · {item.name} · {item.distance}</span>)}</div></>}
      {map && <p className="chart-note"><a href={map.sourceUrl} target="_blank" rel="noreferrer">高德地图 Web 服务 ↗</a> · 有效采集 {map.collectedAt?.replace('T', ' ').slice(0, 19) ?? '暂无'} · 最近尝试 {map.lastAttemptAt?.slice(0, 10) ?? '暂无'}</p>}
      <h3>风险提示</h3><ul>{project.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
      <a className="source-link" href={project.source.url} target="_blank" rel="noreferrer">官方项目证据 · 采集 {project.source.collectedAt.slice(0, 10)} ↗</a>
    </div>
  </dialog>;
}
