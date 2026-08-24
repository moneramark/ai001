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

test('AI Vision & Health Check Website', async ({ browser, request }) => {
  test.setTimeout(300000);

  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports', { recursive: true });
  }

  const sslInfo = await checkSSLExpiry('www.pavietnam.vn');
  const allHrefs = new Set();
  const linkCheckResults = [];
  const visualAuditResults = [];

  try {
    // BƯỚC 1: Quét các trang chính + AI Smart Heuristics Audit
    for (const site of sites) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const failedRequests = [];

      // Lắng nghe Console Log & Network Errors ngầm
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      page.on('requestfailed', req => {
        failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText || 'Failed'}`);
      });

      let pageStatus = 200;
      let loadTimeMs = 0;
      const startTime = Date.now();

      try {
        const response = await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        loadTimeMs = Date.now() - startTime;
        if (response) pageStatus = response.status();

        await page.waitForTimeout(2000);

        const sanitizedName = site.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const screenshotPath = `reports/${sanitizedName}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: false });

        // Heuristics Check: Phát hiện Blank Page / Lỗi DOM / PHP Error
        const bodyText = await page.evaluate(() => document.body.innerText.trim());
        
        const isBlankPage = bodyText.length < 50;
        const hasPhpError = /fatal error|uncaught exception|parse error|stack trace/i.test(bodyText);
        const hasDatabaseError = /database error|connection refused|sqlstate/i.test(bodyText);

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

        visualAuditResults.push({
          siteName: site.name,
          url: site.url,
          status: pageStatus,
          loadTimeMs,
          screenshotPath,
          isBlankPage,
          hasPhpError,
          hasDatabaseError,
          consoleErrorCount: consoleErrors.length,
          consoleErrors: consoleErrors.slice(0, 5),
          failedRequestsCount: failedRequests.length
        });

      } catch (err) {
        console.error(`❌ Lỗi tải trang ${site.name}: ${err.message}`);
        visualAuditResults.push({
          siteName: site.name,
          url: site.url,
          status: 'TIMEOUT/LOAD_FAILED',
          loadTimeMs: Date.now() - startTime,
          screenshotPath: null,
          isBlankPage: true,
          hasPhpError: false,
          hasDatabaseError: false,
          consoleErrorCount: consoleErrors.length,
          consoleErrors: [err.message],
          failedRequestsCount: failedRequests.length
        });
      } finally {
        await context.close();
      }
    }

    const uniqueUrlsList = Array.from(allHrefs);

    // BƯỚC 2: Check HTTP Status Batch
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
    const passed = linkCheckResults.filter((r) => r.ok).length;
    const failed = linkCheckResults.length - passed;

    const summaryData = {
      timestamp: new Date().toISOString(),
      sslInfo,
      visualAudit: visualAuditResults,
      totalChecked: linkCheckResults.length,
      passed,
      failed,
      details: linkCheckResults
    };

    fs.writeFileSync('reports/summary.json', JSON.stringify(summaryData, null, 2));
    generateHtmlReport(summaryData);
  }
});

function generateHtmlReport(data) {
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PAVietnam AI Smart Monitor Dashboard</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }
      .container { max-width: 1100px; margin: 0 auto; background: white; padding: 28px; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
      .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
      .card { padding: 20px; border-radius: 12px; text-align: center; }
      .card.total { background: #eff6ff; color: #1d4ed8; }
      .card.passed { background: #f0fdf4; color: #15803d; }
      .card.failed { background: #fef2f2; color: #b91c1c; }
      .card.ssl { background: #fffbeb; color: #b45309; }
      .section-title { font-size: 18px; font-weight: bold; margin-top: 28px; margin-bottom: 16px; color: #334155; }
      .grid-visual { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
      .visual-card { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; }
      .visual-card img { width: 100%; height: 180px; object-fit: cover; border-bottom: 1px solid #e2e8f0; }
      .visual-info { padding: 16px; }
      .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; display: inline-block; }
      .badge-success { background: #dcfce7; color: #166534; }
      .badge-danger { background: #fee2e2; color: #991b1b; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
      th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
      th { background: #f8fafc; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <h2 style="margin:0;">🤖 PAVietnam AI Smart Monitor</h2>
          <small style="color:#64748b;">Giám sát tự động với AI Smart Audit & Visual Inspection</small>
        </div>
        <div>
          <span class="badge badge-success" style="font-size:13px;">SSL: ${data.sslInfo ? data.sslInfo.daysLeft + ' ngày' : 'N/A'}</span>
        </div>
      </div>

      <div class="metrics">
        <div class="card total"><span style="font-size:12px;">TỔNG LINK QUÉT</span><br><b style="font-size:28px;">${data.totalChecked}</b></div>
        <div class="card passed"><span style="font-size:12px;">LINK SỐNG</span><br><b style="font-size:28px;">${data.passed}</b></div>
        <div class="card failed"><span style="font-size:12px;">LINK LỖI</span><br><b style="font-size:28px;">${data.failed}</b></div>
        <div class="card ssl"><span style="font-size:12px;">TRANG CHÍNH</span><br><b style="font-size:28px;">${data.visualAudit ? data.visualAudit.length : 0}</b></div>
      </div>

      <div class="section-title">📷 Visual & Smart Health Audit</div>
      <div class="grid-visual">
        ${(data.visualAudit || []).map(v => `
          <div class="visual-card">
            ${v.screenshotPath ? `<img src="${v.siteName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png" alt="${v.siteName}"/>` : '<div style="height:180px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;">Không có ảnh</div>'}
            <div class="visual-info">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <b>${v.siteName}</b>
                <span class="badge ${v.status === 200 && !v.isBlankPage && !v.hasPhpError ? 'badge-success' : 'badge-danger'}">HTTP ${v.status}</span>
              </div>
              <div style="font-size:12px;color:#64748b;margin-bottom:8px;">Tốc độ: <b>${v.loadTimeMs}ms</b> | Console Errors: <b>${v.consoleErrorCount}</b></div>
              ${v.isBlankPage ? '<span class="badge badge-danger">⚠️ Trắng trang (Blank Page)</span> ' : ''}
              ${v.hasPhpError ? '<span class="badge badge-danger">🚨 Lỗi PHP/Code</span> ' : ''}
              ${v.hasDatabaseError ? '<span class="badge badge-danger">🚨 Lỗi Database</span> ' : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="section-title">🔗 Danh Sách Chi Tiết Links Nội Bộ</div>
      <table>
        <thead><tr><th>URL Nội Bộ</th><th>Trạng Thái</th><th>Thời Gian</th></tr></thead>
        <tbody>
          ${data.details.map(d => `
            <tr>
              <td style="max-width:500px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><a href="${d.url}" target="_blank">${d.url}</a></td>
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