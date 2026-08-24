import { test, expect } from '@playwright/test';
import fs from 'fs';

const sites = JSON.parse(fs.readFileSync('./sites.json', 'utf8'));

test('Kiểm tra đa trang và tối ưu hóa liên kết', async ({ browser, request }) => {
  test.setTimeout(300000); // 5 phút timeout tối đa

  if (!fs.existsSync('reports')) fs.mkdirSync('reports');

  const allHrefs = new Set();
  const siteScreenshots = [];

  // BƯỚC 1: Quét nhanh qua các trang để chụp ảnh và thu gom liên kết
  for (const site of sites) {
    console.log(`🔍 Đang cào dữ liệu từ: ${site.name}`);
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      
      const sanitizedName = site.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      await page.screenshot({ path: `reports/${sanitizedName}.png`, fullPage: true });
      siteScreenshots.push({ name: site.name, image: `${sanitizedName}.png` });

      // Lấy toàn bộ link
      const pageLinks = await page.locator('a[href]').evaluateAll((links) =>
        links.map((a) => a.getAttribute('href'))
      );

      // Lọc và chỉ giữ lại link thuộc domain pavietnam.vn
      for (const href of pageLinks) {
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          continue;
        }

        try {
          const absoluteUrl = new URL(href, site.url).href;
          // Chỉ thêm nếu là subdomain hoặc domain chính của pavietnam.vn
          if (absoluteUrl.includes('pavietnam.vn')) {
            allHrefs.add(absoluteUrl);
          }
        } catch (e) {
          // Bỏ qua URL không hợp lệ
        }
      }
    } catch (err) {
      console.error(`❌ Lỗi khi tải trang ${site.name}: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  const uniqueUrlsList = Array.from(allHrefs);
  console.log(`\n🎯 Tổng số URL ĐỘC NHẤT thuộc pavietnam.vn cần kiểm tra: ${uniqueUrlsList.length}`);

  // BƯỚC 2: Kiểm tra song song danh sách URL độc nhất (Batch 20 requets/lần)
  const linkCheckResults = [];
  const batchSize = 20;

  for (let i = 0; i < uniqueUrlsList.length; i += batchSize) {
    const batch = uniqueUrlsList.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const start = Date.now();
          const res = await request.get(url, { timeout: 10000 });
          const duration = Date.now() - start;

          linkCheckResults.push({
            url,
            status: res.status(),
            ok: res.ok(),
            duration: `${duration}ms`
          });
        } catch (err) {
          linkCheckResults.push({
            url,
            status: 'TIMEOUT/ERROR',
            ok: false,
            duration: 'N/A'
          });
        }
      })
    );
  }

  const passed = linkCheckResults.filter((r) => r.ok).length;
  const failed = linkCheckResults.length - passed;

  const summaryData = {
    totalChecked: linkCheckResults.length,
    passed,
    failed,
    details: linkCheckResults
  };

  // Lưu file summary để notify.js gửi tin nhắn
  fs.writeFileSync('reports/summary.json', JSON.stringify(summaryData, null, 2));

  // Tạo báo cáo HTML
  generateHtmlReport(summaryData);

  expect(failed, `Phát hiện ${failed} link bị lỗi trên hệ thống!`).toBe(0);
});

function generateHtmlReport(data) {
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <title>PAVietnam Health Check Dashboard</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
      .container { max-width: 1000px; margin: 0 auto; background: white; padding: 24px; border-radius: 12px; }
      .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
      .badge-success { background: #dcfce7; color: #166534; }
      .badge-danger { background: #fee2e2; color: #991b1b; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
      th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>📊 Báo Cáo Tổng Kiểm Tra URL PAVietnam</h1>
      <p>Tổng URL nội bộ đã quét: <b>${data.totalChecked}</b> | Sống: <b style="color:green">${data.passed}</b> | Lỗi: <b style="color:red">${data.failed}</b></p>
      <table>
        <thead><tr><th>URL Nội Bộ</th><th>Status</th><th>Thời Gian</th></tr></thead>
        <tbody>
          ${data.details.map(d => `
            <tr>
              <td style="max-width:550px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><a href="${d.url}" target="_blank">${d.url}</a></td>
              <td><span class="badge ${d.ok ? 'badge-success' : 'badge-danger'}">${d.status}</span></td>
              <td>${d.duration}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </body>
  </html>`;
  fs.writeFileSync('reports/index.html', htmlContent);
}