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
  const [owner, repoName] = repo.split('/');
  const pagesUrl = `https://${owner}.github.io/${repoName}/`;

  const isPassed = data.failed === 0;
  const icon = isPassed ? '✅' : '🚨';
  const statusText = isPassed ? 'TẤT CẢ TỐT' : 'CÓ LỖI PHÁT HIỆN';

  let msg = `${icon} *BÁO CÁO GIÁM SÁT WEBSITE PAVIETNAM* ${icon}\n\n`;
  msg += `• *Trạng thái:* \`${statusText}\`\n`;
  msg += `• *Thời gian:* \`${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\`\n`;
  msg += `• *Hạn SSL:* \`${data.sslInfo ? data.sslInfo.daysLeft + ' ngày (' + data.sslInfo.validTo + ')' : 'N/A'}\`\n`;
  msg += `• *Tổng URL pavietnam.vn đã quét:* \`${data.totalChecked}\`\n`;
  msg += `• *Link sống:* \`${data.passed}\` | *Link lỗi:* \`${data.failed}\`\n\n`;

  if (data.sslInfo && data.sslInfo.daysLeft <= 15) {
    msg += `⚠️ *CẢNH BÁO:* SSL sắp hết hạn (còn ${data.sslInfo.daysLeft} ngày)!\n\n`;
  }

  if (data.failed > 0) {
    msg += `❌ *DANH SÁCH LINK LỖI:*\n`;
    const failedLinks = data.details.filter((d) => !d.ok);
    failedLinks.forEach((item, idx) => {
      msg += `${idx + 1}. [${item.status}] \`${item.url}\`\n`;
    });
    msg += `\n`;
  }

  msg += `🌐 [Bấm vào đây để xem Báo cáo Web Online](${pagesUrl})`;

  if (msg.length > 4000) {
    await sendTelegramMessage(msg.substring(0, 4000));
  } else {
    await sendTelegramMessage(msg);
  }
}

run();