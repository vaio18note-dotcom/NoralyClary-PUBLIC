// ---- 定数 ----
const LETUS_URL = 'https://letus.ed.tus.ac.jp/';
const LETUS_LOGIN_URL = 'https://letus.ed.tus.ac.jp/2026/auth/shibboleth/index.php';
const IDP_URL = 'https://idp.admin.tus.ac.jp/idp/Authn/SamCallback';
const MS_AUTH_URL = 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize';

const STORAGE_KEY = {
  lastLogin: 'letus_lastLogin',
  sessionValid: 'letus_sessionValid'
};

// ---- UI 要素 ----
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('statusText');
const lastLoginEl = document.getElementById('lastLogin');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const openLetusBtn = document.getElementById('openLetusBtn');

// ---- 初期化 ----
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup loaded');
  setupEventListeners();

  // UI状態を更新（非同期で実行、ブロックしない）
  updateUIState().catch(e => {
    console.error('UI update error:', e);
    showStatus('初期化エラー', 'error');
  });
});

function setupEventListeners() {
  console.log('Setting up event listeners');

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
    console.log('Login button listener added');
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
    console.log('Logout button listener added');
  }
  if (openLetusBtn) {
    openLetusBtn.addEventListener('click', handleOpenLetus);
    console.log('Open LETUS button listener added');
  }
}

// ---- ログイン状態確認 ----
async function updateUIState() {
  try {
    const isLoggedIn = await checkLoginStatus();
    const data = await chrome.storage.local.get(STORAGE_KEY.lastLogin);

    if (isLoggedIn) {
      statusTextEl.textContent = '✅ ログイン済み';
      statusTextEl.parentElement.style.color = '#1e8e3e';
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'block';
      openLetusBtn.style.display = 'block';
    } else {
      statusTextEl.textContent = '❌ 未ログイン';
      statusTextEl.parentElement.style.color = '#c62828';
      loginBtn.style.display = 'block';
      logoutBtn.style.display = 'none';
      openLetusBtn.style.display = 'none';
    }

    if (data[STORAGE_KEY.lastLogin]) {
      const date = new Date(data[STORAGE_KEY.lastLogin]);
      lastLoginEl.textContent = `最終ログイン: ${date.toLocaleString('ja-JP')}`;
    }
  } catch (e) {
    console.error('Session check error:', e.message);
  }
}

// ---- セッション確認（chrome.cookies API で判定） ----
// fetch は SameSite=Lax の制限でクッキーが送られないため chrome.cookies を使う
async function checkLoginStatus() {
  try {
    const cookie = await chrome.cookies.get({
      url: LETUS_URL,
      name: 'MoodleSession2026'
    });
    console.log('MoodleSession2026:', cookie ? 'found' : 'not found');
    return cookie !== null;
  } catch (e) {
    console.error('Session check error:', e);
    return false;
  }
}

// ---- ログイン処理 ----
function handleLogin() {
  loginBtn.disabled = true;
  showStatus('LETUS ログインページを開いています...', 'warn');
  // ログインページを新しいタブで開く
  chrome.tabs.create({ url: LETUS_LOGIN_URL }, (tab) => {
    if (!tab) {
      showStatus('タブを開けませんでした', 'error');
      loginBtn.disabled = false;
      return;
    }

    showStatus('ブラウザで Microsoft Authenticator の承認を完了してください', 'warn');

    // ユーザーがログインするのを待つ（約60秒）
    let checkCount = 0;
    const checkInterval = setInterval(async () => {
      checkCount++;

      if (checkCount > 60) {
        clearInterval(checkInterval);
        showStatus('ログイン確認タイムアウト。ブラウザで手動ログインしてください。', 'error');
        loginBtn.disabled = false;
        return;
      }

      const isLoggedIn = await checkLoginStatus();
      if (isLoggedIn) {
        clearInterval(checkInterval);
        const now = new Date().toISOString();
        await chrome.storage.local.set({
          [STORAGE_KEY.lastLogin]: now,
          [STORAGE_KEY.sessionValid]: true
        });
        showStatus('✅ ログインに成功しました！', 'ok');

        setTimeout(() => {
          chrome.tabs.remove(tab.id);
          updateUIState();
          loginBtn.disabled = false;
        }, 1500);
        return;
      }
    }, 1000);
  });
}

// ---- ログアウト処理 ----
function handleLogout() {
  logoutBtn.disabled = true;
  showStatus('ログアウト処理中...', 'warn');

  chrome.tabs.create({ url: LETUS_URL }, async (tab) => {
    // 2秒待ってからクッキーを削除
    setTimeout(async () => {
      try {
        // TUS ドメインのクッキーをすべて削除
        const cookies = await chrome.cookies.getAll({
          domain: '.tus.ac.jp'
        });

        for (const cookie of cookies) {
          const url = `https://${cookie.domain}${cookie.path}`;
          await chrome.cookies.remove({
            url: url,
            name: cookie.name
          });
        }

        await chrome.storage.local.set({
          [STORAGE_KEY.lastLogin]: null,
          [STORAGE_KEY.sessionValid]: false
        });

        showStatus('✅ ログアウトしました', 'ok');

        setTimeout(() => {
          chrome.tabs.remove(tab.id);
          updateUIState();
          logoutBtn.disabled = false;
        }, 1000);
      } catch (error) {
        console.error('Logout error:', error);
        showStatus('❌ ログアウトエラー: ' + error.message, 'error');
        logoutBtn.disabled = false;
      }
    }, 2000);
  });
}

// ---- LETUS を開く ----
function handleOpenLetus() {
  chrome.tabs.create({ url: LETUS_URL });
}

// ---- ステータス表示 ----
function showStatus(message, type = 'warn') {
  statusEl.textContent = message;
  statusEl.className = 'status show ' + type;
}
