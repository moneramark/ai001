import fs from 'fs';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });
}

async function run() {
  if (!fs.existsSync('reports/summary.json')) {
    await sendTelegramMessage('🚨 **Lỗi hệ thống:** Không tìm thấy dữ liệu kết quả kiểm tra.');
    return;
  }

  const rawData = fs.readFileSync('reports/summary.json');
  const summaryData = JSON.parse(rawData);

  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;

  let totalLinksChecked = 0;
  let totalBrokenLinks = 0;

  let message = `📊 *BÁO CÁO KIỂM TRA ĐA WEBSITE*\n`;
  message += `⏱ *Thời gian:* \`${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\`\n\n`;

  for (const site of summaryData) {
    totalLinksChecked += site.total;
    totalBrokenLinks += site.failed;

    const statusIcon = site.failed === 0 ? '✅' : '🚨';
    message += `${statusIcon} *${site.siteName}*\n`;
    message += `• Tổng link đã quét: \`${site.total}\` | Thành công: \`${site.passed}\` | Lỗi: \`${site.failed}\`\n`;

    // Nếu có link lỗi, liệt kê chi tiết danh sách link lỗi
    if (site.failed > 0) {
      message += `  ❌ *Danh sách Link bị lỗi:*\n`;
      const failedLinks = site.details.filter((d) => !d.ok);
      failedLinks.forEach((link, idx) => {
        message += `    ${idx + 1}. [${link.status}] \`${link.url}\`\n`;
      });
    }
    message += `\n`;
  }

  const headerStatus = totalBrokenLinks === 0 ? '🟢 ALL PASSED' : '🔴 ISSUES DETECTED';
  message += `📌 *TỔNG KẾT:* \`${headerStatus}\`\n`;
  message += `• Tổng số URL đã check: \`${totalLinksChecked}\`\n`;
  message += `• Tổng số Link hỏng: \`${totalBrokenLinks}\`\n\n`;
  message += `🔗 [Xem chi tiết Artifacts & Screenshots](${runUrl})`;

  // Nếu tin nhắn quá dài (giới hạn Telegram là 4096 ký tự), tự động cắt đôi
  if (message.length > 4000) {
    const half = Math.floor(message.length / 2);
    await sendTelegramMessage(message.substring(0, half));
    await sendTelegramMessage(message.substring(half));
  } else {
    await sendTelegramMessage(message);
  }
}

run();