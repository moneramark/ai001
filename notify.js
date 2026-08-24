const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  const jobStatus = process.argv[2];
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;

  const isSuccess = jobStatus === 'success';
  const statusIcon = isSuccess ? '✅' : '🚨';
  const statusText = isSuccess ? 'THÀNH CÔNG' : 'CÓ LỖI PHÁT HIỆN';

  const message = `
${statusIcon} *BÁO CÁO KIỂM TRA WEBSITE* ${statusIcon}

• *Trạng thái:* \`${statusText}\`
• *Dự án:* \`${repo}\`
• *Thời gian:* \`${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\`

🔗 [Xem file Báo Cáo & Ảnh Screenshot chi tiết trên GitHub](${runUrl})
  `;

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    })
  });
}

sendTelegram();