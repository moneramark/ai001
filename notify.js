import fs from 'fs';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

// Hàm AI Gemini Phân tích Sự cố
async function analyzeWithAI(issueSummary) {
  if (!GEMINI_API_KEY) return null;
  
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `Bạn là một AI Senior DevOps Engineer chuyên giám sát hệ thống website PAVietnam.
Dưới đây là tóm tắt sự cố vừa phát hiện trên hệ thống:

${JSON.stringify(issueSummary, null, 2)}

Hãy đưa ra nhận định ngắn gọn (3-4 dòng) bằng tiếng Việt:
1. Nguyên nhân gốc rễ dự đoán (Root Cause).
2. Tác động tới trải nghiệm người dùng.
3. Hướng khắc phục ngay lập tức cho bộ phận IT.`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (err) {
    console.error('Lỗi gọi Gemini AI:', err);
    return null;
  }
}

async function run() {
  if (!fs.existsSync('reports/summary.json')) {
    await sendTelegramMessage('🚨 **Lỗi:** Không tìm thấy tệp dữ liệu báo cáo summary.json');
    return;
  }

  const data = JSON.parse(fs.readFileSync('reports/summary.json'));
  const repo = process.env.GITHUB_REPOSITORY || 'moneramark/ai001';
  const [owner, repoName] = repo.split('/');
  const pagesUrl = `https://${owner}.github.io/${repoName}/`;

  const visualIssues = (data.visualAudit || []).filter(
    v => v.status !== 200 || v.isBlankPage || v.hasPhpError || v.hasDatabaseError
  );
  
  const hasLinkError = data.failed > 0;
  const hasVisualError = visualIssues.length > 0;
  const isPassed = !hasLinkError && !hasVisualError;

  const icon = isPassed ? '✅' : '🚨';
  const statusText = isPassed ? 'HỆ THỐNG HOẠT ĐỘNG HOÀN HẢO' : 'PHÁT HIỆN SỰ CỐ WEBSITE';

  let msg = `${icon} *PAVIETNAM SMART AI MONITOR* ${icon}\n\n`;
  msg += `• *Trạng thái:* \`${statusText}\`\n`;
  msg += `• *Thời gian:* \`${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\`\n`;
  msg += `• *Hạn SSL:* \`${data.sslInfo ? data.sslInfo.daysLeft + ' ngày' : 'N/A'}\`\n`;
  msg += `• *Tổng URL đã quét:* \`${data.totalChecked}\` | *Sống:* \`${data.passed}\` | *Lỗi:* \`${data.failed}\`\n\n`;

  if (hasVisualError) {
    msg += `⚠️ *CẢNH BÁO LỖI GIAO DIỆN / NỘI DUNG:*\n`;
    visualIssues.forEach((v, idx) => {
      msg += `${idx + 1}. *${v.siteName}* (${v.url})\n`;
      if (v.isBlankPage) msg += `   - 🔴 Trang bị trắng (Blank Page)\n`;
      if (v.hasPhpError) msg += `   - 🔴 Lỗi cú pháp PHP / Server Crash\n`;
      if (v.hasDatabaseError) msg += `   - 🔴 Lỗi Cơ sở dữ liệu (DB Error)\n`;
      if (v.status !== 200) msg += `   - 🔴 HTTP Status: ${v.status}\n`;
    });
    msg += `\n`;
  }

  if (hasLinkError) {
    msg += `❌ *DANH SÁCH LINK LỖI HTTP:*\n`;
    const failedLinks = data.details.filter((d) => !d.ok);
    failedLinks.slice(0, 5).forEach((item, idx) => {
      msg += `${idx + 1}. [${item.status}] \`${item.url}\`\n`;
    });
    msg += `\n`;
  }

  // Nếu có sự cố, nhờ AI phân tích
  if (!isPassed) {
    const issueSummary = {
      visualIssues,
      failedLinksCount: data.failed,
      failedLinksSample: data.details.filter((d) => !d.ok).slice(0, 3)
    };

    const aiAnalysis = await analyzeWithAI(issueSummary);
    if (aiAnalysis) {
      msg += `🧠 *PHÂN TÍCH TỰ ĐỘNG BỞI AI GEMINI:*\n${aiAnalysis}\n\n`;
    }
  }

  msg += `🌐 [Bấm xem Báo cáo Visual Dashboard](${pagesUrl})`;

  if (msg.length > 4000) {
    await sendTelegramMessage(msg.substring(0, 4000));
  } else {
    await sendTelegramMessage(msg);
  }
}

run();