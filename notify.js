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
    await sendTelegramMessage('🚨 **Lỗi:** Không tìm thấy tệp dữ liệu báo cáo summary.json');
    return;
  }

  const data = JSON.parse(fs.readFileSync('reports/summary.json'));
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;

  const isPassed = data.failed === 0;
  const icon = isPassed ? '✅' : '🚨';
  const statusText = isPassed ? 'TẤT CẢ LINK HOẠT ĐỘNG TỐT' : 'PHÁT HIỆN LINK LỖI';

  let msg = `${icon} *BÁO CÁO KIỂM TRA PAVIETNAM* ${icon}\n\n`;
  msg += `• *Trạng thái:* \`${statusText}\`\n`;
  msg += `• *Thời gian:* \`${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\`\n`;
  msg += `• *Tổng URL pavietnam.vn đã quét:* \`${data.totalChecked}\`\n`;
  msg += `• *Link hoạt động (2xx/3xx):* \`${data.passed}\`\n`;
  msg += `• *Link hỏng (4xx/5xx/Timeout):* \`${data.failed}\`\n\n`;

  if (data.failed > 0) {
    msg += `❌ *DANH SÁCH URL BỊ LỖI:*\n`;
    const failedLinks = data.details.filter((d) => !d.ok);
    failedLinks.forEach((item, idx) => {
      msg += `${idx + 1}. [${item.status}] \`${item.url}\`\n`;
    });
    msg += `\n`;
  }

  msg += `🔗 [Xem Ảnh Screenshot & Báo Cáo HTML](${runUrl})`;

  if (msg.length > 4000) {
    await sendTelegramMessage(msg.substring(0, 4000));
  } else {
    await sendTelegramMessage(msg);
  }
}

run();