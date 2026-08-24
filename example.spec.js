import { test, expect } from '@playwright/test';

test('Kiểm tra giao diện và tính năng website', async ({ page, request }) => {
  // Đặt thời gian timeout cho test lên 60 giây để thoải mái xử lý trang nặng
  test.setTimeout(60000);

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const targetUrl = 'https://www.matbao.net/';
  
  // ✔️ Đổi sang 'domcontentloaded' để tránh bị treo timeout do network ngầm
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 1. Chụp ảnh màn hình toàn trang
  await page.screenshot({ path: 'reports/full_page.png', fullPage: true });

  // 2. Kiểm tra danh sách link chết (Broken Links)
  const hrefs = await page.locator('a[href]').evaluateAll((links) =>
    links
      .map((a) => a.getAttribute('href'))
      .filter((href) => href && !href.startsWith('#') && !href.startsWith('javascript:'))
  );

  const brokenLinks = [];
  // Lấy tối đa 15 link đầu tiên để kiểm tra nhanh, tránh kéo dài thời gian
  const linksToTest = hrefs.slice(0, 15);

  for (const href of linksToTest) {
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

  // Đánh dấu test thất bại nếu tìm thấy link chết
  expect(brokenLinks, `Phát hiện ${brokenLinks.length} link lỗi!`).toHaveLength(0);
});