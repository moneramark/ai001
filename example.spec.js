import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('Kiểm tra giao diện và tính năng website', async ({ page, request }) => {
  test.setTimeout(90000);

  if (!fs.existsSync('reports')) fs.mkdirSync('reports');

  const targetUrl = 'https://www.pavietnam.vn/';
  const startTime = new Date();

  // 1. Truy cập và chụp ảnh giao diện
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const screenshotPath = 'reports/screenshot.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // 2. Thu thập danh sách liên kết
  const hrefs = await page.locator('a[href]').evaluateAll((links) =>
    links
      .map((a) => a.getAttribute('href'))
      .filter((href) => href && !href.startsWith('#') && !href.startsWith('javascript:'))
  );

  const uniqueHrefs = [...new Set(hrefs)].slice(0, 20); // Check 20 link độc nhất
  const results = [];

  for (const href of uniqueHrefs) {
    try {
      const absoluteUrl = new URL(href, targetUrl).href;
      const start = Date.now();
      const res = await request.get(absoluteUrl);
      const duration = Date.now() - start;

      results.push({
        url: absoluteUrl,
        status: res.status(),
        ok: res.ok(),
        duration: `${duration}ms`
      });
    } catch (err) {
      results.push({
        url: href,
        status: 'ERROR',
        ok: false,
        duration: 'N/A'
      });
    }
  }

  // 3. Tính toán số liệu tổng quan
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  const endTime = new Date();

  // 4. Tạo giao diện HTML Report trực quan
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <title>Website Health Check Report</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; color: #333; }
      .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
      h1 { text-align: center; color: #1e293b; margin-bottom: 5px; }
      .subtitle { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 25px; }
      .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
      .card { padding: 20px; border-radius: 8px; text-align: center; font-weight: bold; }
      .card.total { background: #e0f2fe; color: #0369a1; }
      .card.passed { background: #dcfce7; color: #15803d; }
      .card.failed { background: #fee2e2; color: #b91c1c; }
      .card .num { font-size: 32px; display: block; margin-top: 5px; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
      th { background: #f8fafc; color: #475569; }
      .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
      .badge-success { background: #dcfce7; color: #166534; }
      .badge-danger { background: #fee2e2; color: #991b1b; }
      .img-container { text-align: center; margin-top: 30px; }
      .img-container img { max-width: 100%; border-radius: 8px; border: 1px solid #ddd; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>📊 Báo Cáo Kiểm Tra Website</h1>
      <div class="subtitle">Mục tiêu: <b>${targetUrl}</b> | Thời gian: ${startTime.toLocaleString('vi-VN')}</div>

      <div class="stats-grid">
        <div class="card total">TỔNG KIỂM TRA<span class="num">${total}</span></div>
        <div class="card passed">HOẠT ĐỘNG<span class="num">${passed}</span></div>
        <div class="card failed">BỊ LỖI<span class="num">${failed}</span></div>
      </div>

      <h2>Danh Sách Liên Kết Kiểm Tra</h2>
      <table>
        <thead>
          <tr>
            <th>URL</th>
            <th>Trạng thái</th>
            <th>Phản hồi</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(r => `
            <tr>
              <td style="max-width: 450px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <a href="${r.url}" target="_blank">${r.url}</a>
              </td>
              <td><span class="badge ${r.ok ? 'badge-success' : 'badge-danger'}">${r.status}</span></td>
              <td>${r.duration}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="img-container">
        <h2>📷 Ảnh Chụp Giao Diện Website</h2>
        <img src="screenshot.png" alt="Full Page Screenshot">
      </div>
    </div>
  </body>
  </html>
  `;

  fs.writeFileSync('reports/index.html', htmlContent);

  // Đánh dấu fail test nếu có link chết
  expect(failed, `Phát hiện ${failed} link bị lỗi!`).toBe(0);
});