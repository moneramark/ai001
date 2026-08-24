import { test, expect } from '@playwright/test';
import fs from 'fs';

const sites = JSON.parse(fs.readFileSync('./sites.json', 'utf8'));

test('Kiểm tra nhiều trang web và quét toàn bộ liên kết', async ({ browser, request }) => {
  test.setTimeout(600000); // 10 phút timeout

  if (!fs.existsSync('reports')) fs.mkdirSync('reports');

  const overallResults = [];

  for (const site of sites) {
    console.log(`\n🔍 Đang quét trang: ${site.name} (${site.url})`);

    // Tạo Tab mới độc lập cho từng trang
    const context = await browser.newContext();
    const page = await context.newPage();

    let pageLoaded = true;
    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err) {
      pageLoaded = false;
      console.error(`❌ Không thể truy cập ${site.url}: ${err.message}`);
    }

    if (!pageLoaded) {
      overallResults.push({
        siteName: site.name,
        siteUrl: site.url,
        total: 0,
        passed: 0,
        failed: 1,
        details: [{ url: site.url, status: 'DOWN/TIMEOUT', ok: false, duration: 'N/A' }]
      });
      await context.close(); // Đóng tab
      continue;
    }

    // Chụp ảnh màn hình
    const sanitizedName = site.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    await page.screenshot({ path: `reports/${sanitizedName}.png`, fullPage: true });

    // Quét toàn bộ liên kết
    const hrefs = await page.locator('a[href]').evaluateAll((links) =>
      links
        .map((a) => a.getAttribute('href'))
        .filter((href) => href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:'))
    );

    await context.close(); // Đóng tab sau khi thu thập xong link

    const uniqueHrefs = [...new Set(hrefs)];
    console.log(`🔗 Tìm thấy ${uniqueHrefs.length} liên kết trên ${site.name}`);

    const linkCheckResults = [];
    const batchSize = 10; // Kiểm tra song song 10 link/lượt

    for (let i = 0; i < uniqueHrefs.length; i += batchSize) {
      const batch = uniqueHrefs.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (href) => {
          try {
            const absoluteUrl = new URL(href, site.url).href;
            const start = Date.now();
            const res = await request.get(absoluteUrl, { timeout: 15000 });
            const duration = Date.now() - start;

            linkCheckResults.push({
              url: absoluteUrl,
              status: res.status(),
              ok: res.ok(),
              duration: `${duration}ms`
            });
          } catch (err) {
            linkCheckResults.push({
              url: href,
              status: 'ERROR',
              ok: false,
              duration: 'N/A'
            });
          }
        })
      );
    }

    const passed = linkCheckResults.filter((r) => r.ok).length;
    const failed = linkCheckResults.length - passed;

    overallResults.push({
      siteName: site.name,
      siteUrl: site.url,
      total: linkCheckResults.length,
      passed,
      failed,
      details: linkCheckResults
    });
  }

  fs.writeFileSync('reports/summary.json', JSON.stringify(overallResults, null, 2));
  generateHtmlReport(overallResults);

  const totalFailures = overallResults.reduce((acc, s) => acc + s.failed, 0);
  expect(totalFailures, `Phát hiện tổng cộng ${totalFailures} link bị lỗi trên các trang!`).toBe(0);
});

function generateHtmlReport(data) {
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <title>Multi-Site Health Check Dashboard</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
      .container { max-width: 1100px; margin: 0 auto; }
      .site-card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .site-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
      .badge { padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
      .badge-success { background: #dcfce7; color: #15803d; }
      .badge-danger { background: #fee2e2; color: #b91c1c; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #f1f5f9; }
      th { background: #f8fafc; color: #64748b; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>📊 Báo Cáo Tổng Hợp Website</h1>
      ${data.map(site => `
        <div class="site-card">
          <div class="site-header">
            <h2>${site.siteName} (${site.siteUrl})</h2>
            <div>
              <span class="badge badge-success">Sống: ${site.passed}</span>
              <span class="badge badge-danger">Lỗi: ${site.failed}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>URL</th><th>Trạng Thái</th><th>Thời Gian</th></tr>
            </thead>
            <tbody>
              ${site.details.map(d => `
                <tr>
                  <td style="max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <a href="${d.url}" target="_blank">${d.url}</a>
                  </td>
                  <td><span class="badge ${d.ok ? 'badge-success' : 'badge-danger'}">${d.status}</span></td>
                  <td>${d.duration}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  </body>
  </html>
  `;
  fs.writeFileSync('reports/index.html', htmlContent);
}