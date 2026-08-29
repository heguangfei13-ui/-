# 置业罗盘｜杭州 / 南京商品房监测

面向 2027 年购房决策的公开匿名看板。页面只读取 D1 中已验证的持久化快照；GitHub Actions 每日采集，适配器按来源频率决定是否更新。任何登录、验证码或访问限制都不会被绕过。

## 本地运行

```bash
npm install
npm run db:generate
npm test
python -m unittest tests/test_collect.py
npm run dev
```

## GitHub Secrets

- `INGEST_URL`：已发布 Sites 根地址
- `INGEST_TOKEN`：与 Sites 服务端密钥一致的长随机令牌
- `AMAP_KEY`：高德 Web 服务 Key，仅用于每周通勤与 POI 刷新

## 数据口径

- 国家统计局 70 城与全国开发销售：月度
- 杭州透明售房网、南京网上房地产：每日尝试
- LPR：月度；货币政策报告：季度
- 土地、人口、供应与政策：月度/事件触发
- POI、地铁与通勤：每周

高德适配器使用 `Web服务` 类型 Key：项目与就业中心先地理编码，再按项目保存 3 公里内公园、地铁、商业、医院，以及三条就业走廊的公交/驾车时间。首次或手动运行强制刷新，之后每周日刷新；Key 仅从 `AMAP_KEY` Secret 读取。

`basis_version` 保存统计基期断点；无法比较的序列不会直接拼接。项目只有在价格、110–140㎡户型、证照和三条通勤证据齐全时才进入推荐榜。评分不包含学区。

## 开源归属

数据管线借鉴 `china-housing-market-analysis` 与 `house_price_index` 的增量、缓存与口径校验思想（未复制无明确许可证的代码）。前端信息组织参考 Apache-2.0 的 [how-to-buy-house](https://github.com/851235550/how-to-buy-house)，本项目保留此归属说明。

城市图片来自 Unsplash：杭州 [NQJBkCU9v6o](https://unsplash.com/photos/traditional-chinese-bridge-with-pavilion-over-water-NQJBkCU9v6o)，南京 [nsZVk5LwqxM](https://unsplash.com/photos/a-view-of-a-city-from-the-top-of-a-wall-nsZVk5LwqxM)。
