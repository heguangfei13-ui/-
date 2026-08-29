import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: '置业罗盘｜杭州 · 南京商品房监测',
  description: '为 2027 年购房准备的杭州与南京商品房趋势、时机和楼盘监测看板。',
  openGraph: { title: '置业罗盘｜杭州 · 南京商品房监测', description: '价格、成交、信贷、项目证据与现金流，一张看板持续监测。', images: [{ url: '/og.png', width: 1200, height: 630 }], locale: 'zh_CN', type: 'website' },
  twitter: { card: 'summary_large_image', title: '置业罗盘｜杭州 · 南京商品房监测', description: '为 2027 买房做有证据的决定。', images: ['/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
