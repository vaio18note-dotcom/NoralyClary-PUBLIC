// ---- Background Service Worker ----
// セッション管理

const LETUS_DOMAIN = '.tus.ac.jp';
const STORAGE_KEY = {
  lastLogin: 'letus_lastLogin',
  sessionValid: 'letus_sessionValid'
};

// ---- 初期化 ----
chrome.runtime.onInstalled.addListener(() => {
  console.log('LETUS Auto Login 拡張機能がインストールされました');
  
  // 初期化ストレージ
  chrome.storage.local.set({
    [STORAGE_KEY.lastLogin]: null,
    [STORAGE_KEY.sessionValid]: false
  });

  // 定期的なセッション確認をスケジュール
  try {
    chrome.alarms.create('checkSession', { periodInMinutes: 5 });
  } catch (error) {
    console.error('Alarm creation error:', error);
  }
});

// ---- メッセージリスナー ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_LOGIN') {
    checkSessionCookie().then(isValid => {
      sendResponse({ isLoggedIn: isValid });
    });
    return true; // 非同期レスポンス
  }
});

// ---- セッションクッキー確認 ----
async function checkSessionCookie() {
  try {
    const cookies = await chrome.cookies.getAll({
      domain: LETUS_DOMAIN
    });
    
    // セッションクッキーが存在するかチェック
    const hasSession = cookies.length > 0;
    
    if (hasSession) {
      await chrome.storage.local.set({
        [STORAGE_KEY.lastLogin]: new Date().toISOString(),
        [STORAGE_KEY.sessionValid]: true
      });
    } else {
      await chrome.storage.local.set({
        [STORAGE_KEY.sessionValid]: false
      });
    }
    
    return hasSession;
  } catch (error) {
    console.error('Cookie check error:', error);
    return false;
  }
}

// ---- 定期実行：セッション確認 ----
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkSession') {
    checkSessionCookie();
  }
});
