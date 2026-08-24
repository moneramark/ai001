import { test, expect } from '@playwright/test';
import fs from 'fs';

test('Kiểm tra giao diện và tính năng website', async ({ page, request }) => {
  test.setTimeout(60000);

  // Tự động tạo thư mục reports nếu chưa có
  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports');
  }

  const targetUrl = 'https://www.matbao.net/';
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Chụp ảnh màn hình toàn trang
  await page.screenshot({ path: 'reports/full_page.png', fullPage: true });

  const hrefs = await page.locator('a[href]').evaluateAll((links) =>
    links
      .map((a) => a.getAttribute('href'))
      .filter((href) => href && !href.startsWith('#') && !href.startsWith('javascript:'))
  );

  const brokenLinks = [];
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

  expect(brokenLinks, `Phát hiện ${brokenLinks.length} link lỗi!`).toHaveLength(0);
});