import { test, expect } from '@playwright/test';
import fs from 'fs';
import https from 'https';

const sites = JSON.parse(fs.readFileSync('./sites.json', 'utf8'));

function checkSSLExpiry(hostname) {
  return new Promise((resolve) => {
    const req = https.request(
      { host: hostname, port: 443, method: 'HEAD', agent: false, timeout: 5000 },
      (res) => {
        const cert = res.socket.getPeerCertificate();
        if (cert && cert.valid_to) {
          const validTo = new Date(cert.valid_to);
          const daysLeft = Math.ceil((validTo - new Date()) / (1000 * 60 * 60 * 24));
          resolve({ daysLeft, validTo: validTo.toISOString().split('T')[0] });
        } else {
          resolve(null);
        }
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

test('Kiểm tra tổng thể hệ thống website', async ({ browser, request }) => {
  test.setTimeout(300000);

  // Đảm bảo thư mục reports luôn tồn tại ngay từ đầu
  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports', { recursive: true });
  }

  const sslInfo = await checkSSLExpiry('www.pavietnam.vn');
  const allHrefs = new Set();
  const linkCheckResults = [];

  try {
    // BƯỚC 1: Quét trang gom link
    for (const site of sites) {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        const sanitizedName = site.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        await page.screenshot({ path: `reports/${sanitizedName}.png`, fullPage: true });

        const pageLinks = await page.locator('a[href]').evaluateAll((links) =>
          links.map((a) => a.getAttribute('href'))
        );

        for (const href of pageLinks) {
          if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
          try {
            const absoluteUrl = new URL(href, site.url).href;
            if (absoluteUrl.includes('pavietnam.vn')) {
              allHrefs.add(absoluteUrl);
            }
          } catch (e) {}
        }
      } catch (err) {
        console.error(`❌ Lỗi tải trang ${site.name}: ${err.message}`);
      } finally {
        await context.close();
      }
    }

    const uniqueUrlsList = Array.from(allHrefs);

    // BƯỚC 2: Check song song các link
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
  } finally {
    // KHỐI FINALLY NÀY BẢO ĐẢM TỆP SUMMARY.JSON LUÔN ĐƯỢC GHI BẤT CHẤP CÓ LỖI XẢY RA
    const passed = linkCheckResults.filter((r) => r.ok).length;
    const failed = linkCheckResults.length - passed;

    const summaryData = {
      sslInfo,
      totalChecked: linkCheckResults.length,
      passed,
      failed,
      details: linkCheckResults
    };

    fs.writeFileSync('reports/summary.json', JSON.stringify(summaryData, null, 2));
    generateHtmlReport(summaryData);

    // Báo lỗi Playwright test nếu có link hỏng
    expect(failed, `Phát hiện ${failed} link bị lỗi!`).toBe(0);
  }
});

function generateHtmlReport(data) {
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <title>PAVietnam Health Check Dashboard</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 0; padding: 20px; color: #0f172a; }
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
      <h2>📊 Báo Cáo Giám Sát Tự Động PAVietnam</h2>
      <p>Tổng link đã quét: <b>${data.totalChecked}</b> | Sống: <b style="color:green">${data.passed}</b> | Lỗi: <b style="color:red">${data.failed}</b></p>
      <table>
        <thead><tr><th>URL Nội Bộ</th><th>Trạng Thái</th><th>Thời Gian</th></tr></thead>
        <tbody>
          ${data.details.map(d => `
            <tr>
              <td><a href="${d.url}" target="_blank">${d.url}</a></td>
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