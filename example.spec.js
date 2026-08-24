import { test, expect } from '@playwright/test';

test('Kiểm tra giao diện và tính năng website', async ({ page, request }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Thay URL trang web của bạn vào đây
  const targetUrl = 'https://www.matbao.net/';
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  // 1. Chụp ảnh màn hình toàn trang
  await page.screenshot({ path: 'reports/full_page.png', fullPage: true });

  // 2. Kiểm tra danh sách link chết (Broken Links)
  const hrefs = await page.locator('a[href]').evaluateAll((links) =>
    links
      .map((a) => a.getAttribute('href'))
      .filter((href) => href && !href.startsWith('#') && !href.startsWith('javascript:'))
  );

  const brokenLinks = [];
  for (const href of hrefs) {
    try {
      const absoluteUrl = new URL(href, targetUrl).href;
      const response = await request.get(absoluteUrl);
      if (response.status() >= 400) {
        brokenLinks.push({ url: absoluteUrl, status: response.status() });
      }
    } catch (err) {
      brokenLinks.push({ url: href, error: err.message });
    }
  }

  // Nếu có link lỗi hoặc console error, đánh dấu test thất bại để trigger gửi Telegram
  expect(brokenLinks, `Phát hiện ${brokenLinks.length} link lỗi!`).toHaveLength(0);
  expect(consoleErrors, `Phát hiện ${consoleErrors.length} lỗi Console!`).toHaveLength(0);
});