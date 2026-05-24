const PERIODS = {
  1: { start: '08:50', end: '10:20' },
  2: { start: '10:30', end: '12:00' },
  3: { start: '13:00', end: '14:30' },
  4: { start: '14:40', end: '16:10' },
  5: { start: '16:20', end: '17:50' },
  6: { start: '18:10', end: '19:40' },
  7: { start: '19:50', end: '21:20' },
};

const DAY_LABEL = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' };
const RRULE_DAY = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// アクセストークンはメモリのみ保持（ポップアップを閉じると消える）
let accessToken = null;
let courses = [];

// ---- 初期化 ----

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['startDate', 'endDate']);
  if (stored.startDate) document.getElementById('startDate').value = stored.startDate;
  if (stored.endDate)   document.getElementById('endDate').value   = stored.endDate;

  await tryScrape();
});

document.getElementById('startDate').addEventListener('change', e =>
  chrome.storage.local.set({ startDate: e.target.value }));
document.getElementById('endDate').addEventListener('change', e =>
  chrome.storage.local.set({ endDate: e.target.value }));

document.getElementById('scrapeBtn').addEventListener('click', tryScrape);
document.getElementById('loginBtn').addEventListener('click', authenticate);
document.getElementById('bulkDlBtn').addEventListener('click', () => bulkAction('dl'));
document.getElementById('bulkRegBtn').addEventListener('click', () => bulkAction('reg'));
document.getElementById('deleteBtn').addEventListener('click', deleteRegistered);

// ---- スクレイピング ----

async function tryScrape() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes('class.admin.tus.ac.jp/uprx/up/')) {
    showStatus('CLASSの学生時間割表を開いてから実行してください', 'warn');
    return;
  }
  try {
    const res = await sendScrape(tab.id);
    if (res.error) { showStatus(res.error, 'warn'); return; }
    if (!res.courses.length) { showStatus('授業が見つかりませんでした', 'warn'); return; }
    courses = res.courses;
    renderCourses();
    showStatus(`${courses.length}件の授業を取得しました`, 'ok');
  } catch (e) {
    showStatus('取得失敗: ' + e.message, 'error');
  }
}

// ---- OAuth認証 ----

function authenticate() {
  chrome.identity.getAuthToken({ interactive: true }, token => {
    if (chrome.runtime.lastError || !token) {
      showStatus('ログイン失敗: ' + (chrome.runtime.lastError?.message || ''), 'error');
      return;
    }
    accessToken = token;
    const btn = document.getElementById('loginBtn');
    btn.textContent = '✓ ログイン済み';
    btn.disabled = true;
    showStatus('Googleにログインしました', 'ok');
  });
}

// ---- 日付ユーティリティ ----

function getDateRange() {
  const start = document.getElementById('startDate').value;
  const end   = document.getElementById('endDate').value;
  if (!start || !end) { showStatus('学期開始日と終了日を入力してください', 'warn'); return null; }
  return { start, end };
}

function firstOccurrence(startDateStr, dayNum) {
  const [y, m, day] = startDateStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  const offset = (dayNum - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + offset);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

function isInRange(yyyymmdd, endDateStr) {
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
  const [fy, fm, fd] = [yyyymmdd.slice(0,4), yyyymmdd.slice(4,6), yyyymmdd.slice(6,8)].map(Number);
  return new Date(Date.UTC(fy, fm - 1, fd, 12, 0, 0)) <= end;
}

function rruleUntilDateTime(endDateStr) {
  const d = new Date(`${endDateStr}T23:59:59+09:00`);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function rruleUntilDate(endDateStr) {
  return endDateStr.replace(/-/g, '');
}

// ---- ICS生成 ----

function escapeICS(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildVEVENT(course, dates) {
  const { period, day, name, room } = course;
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@classcalendar`;

  if (day === 6) {
    const firstDate = firstOccurrence(dates.start, 6);
    const next = new Date(`${firstDate.slice(0,4)}-${firstDate.slice(4,6)}-${firstDate.slice(6,8)}T00:00:00+09:00`);
    next.setDate(next.getDate() + 1);
    const nextDate = next.toISOString().slice(0, 10).replace(/-/g, '');
    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${firstDate}`,
      `DTEND;VALUE=DATE:${nextDate}`,
      `RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=${rruleUntilDate(dates.end)}`,
      `SUMMARY:${escapeICS(name)}`,
      ...(room ? [`LOCATION:${escapeICS(room)}`] : []),
      'END:VEVENT',
    ];
  }

  const { start: st, end: et } = PERIODS[period];
  const firstDate = firstOccurrence(dates.start, day);
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;TZID=Asia/Tokyo:${firstDate}T${st.replace(':', '')}00`,
    `DTEND;TZID=Asia/Tokyo:${firstDate}T${et.replace(':', '')}00`,
    `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAY[day]};UNTIL=${rruleUntilDateTime(dates.end)}`,
    `SUMMARY:${escapeICS(name)}`,
    ...(room ? [`LOCATION:${escapeICS(room)}`] : []),
    'END:VEVENT',
  ];
}

function generateICS(targets, dates) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CLASS Calendar LETUS++//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Tokyo',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:JST',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...targets.flatMap(c => buildVEVENT(c, dates)),
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadICS(icsContent, filename) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

// ---- Calendar API登録 ----

function buildGCalEvent(course, dates) {
  const { period, day, name, room } = course;

  const EXT = { extendedProperties: { private: { source: 'classcalendar-letus' } } };

  if (day === 6) {
    const firstDate = firstOccurrence(dates.start, 6);
    const fmt = s => `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    const next = new Date(`${fmt(firstDate)}T00:00:00+09:00`);
    next.setDate(next.getDate() + 1);
    return {
      summary: name,
      location: room || undefined,
      start: { date: fmt(firstDate) },
      end:   { date: next.toISOString().slice(0, 10) },
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=${rruleUntilDate(dates.end)}`],
      ...EXT,
    };
  }

  const { start: st, end: et } = PERIODS[period];
  const firstDate = firstOccurrence(dates.start, day);
  const fmt = s => `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  return {
    summary: name,
    location: room || undefined,
    start: { dateTime: `${fmt(firstDate)}T${st}:00`, timeZone: 'Asia/Tokyo' },
    end:   { dateTime: `${fmt(firstDate)}T${et}:00`, timeZone: 'Asia/Tokyo' },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAY[day]};UNTIL=${rruleUntilDateTime(dates.end)}`],
    ...EXT,
  };
}

async function postToCalendar(course, dates) {
  const res = await fetch(CALENDAR_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildGCalEvent(course, dates)),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || res.statusText);
  }
}

// ---- アクション ----

async function courseAction(course, mode) {
  const dates = getDateRange();
  if (!dates) return;

  if (!isInRange(firstOccurrence(dates.start, course.day), dates.end)) {
    showStatus(`「${course.name}」は期間内に${DAY_LABEL[course.day]}曜日がありません`, 'warn');
    return;
  }

  if (mode === 'dl') {
    const label = `${DAY_LABEL[course.day]}${course.period}_${course.name}`;
    downloadICS(generateICS([course], dates), `${label}.ics`);
    showStatus(`「${course.name}」のICSをダウンロードしました`, 'ok');
    return;
  }

  // 直接登録
  if (!accessToken) { showStatus('先にGoogleにログインしてください', 'warn'); return; }
  try {
    await postToCalendar(course, dates);
    showStatus(`「${course.name}」を登録しました ✓`, 'ok');
  } catch (e) {
    showStatus(`登録失敗: ${e.message}`, 'error');
  }
}

async function bulkAction(mode) {
  const dates = getDateRange();
  if (!dates) return;
  const targets = courses.filter(c => c.day >= 1 && c.day <= 5 && isInRange(firstOccurrence(dates.start, c.day), dates.end));
  if (!targets.length) { showStatus('月〜金の授業が見つかりません', 'warn'); return; }

  if (mode === 'dl') {
    downloadICS(generateICS(targets, dates), '時間割_月〜金.ics');
    showStatus(`${targets.length}件をICSに書き出しました`, 'ok');
    return;
  }

  // 直接一括登録
  if (!accessToken) { showStatus('先にGoogleにログインしてください', 'warn'); return; }
  let success = 0;
  let firstError = null;
  for (const course of targets) {
    try {
      await postToCalendar(course, dates);
      success++;
      showStatus(`${success} / ${targets.length} 件登録中…`, 'ok');
    } catch (e) {
      if (!firstError) firstError = e.message;
    }
  }
  if (success === 0 && firstError) {
    showStatus(`登録失敗: ${firstError}`, 'error');
  } else {
    showStatus(`完了: ${success} / ${targets.length} 件登録しました`, success === targets.length ? 'ok' : 'warn');
  }
}

// ---- 削除 ----

let _deleteTimer = null;
let _deleteIds   = [];

async function deleteRegistered() {
  if (!accessToken) { showStatus('先にGoogleにログインしてください', 'warn'); return; }
  const dates = getDateRange();
  if (!dates) return;

  const btn = document.getElementById('deleteBtn');

  if (_deleteTimer) {
    clearTimeout(_deleteTimer);
    _deleteTimer = null;
    let deleted = 0;
    for (const id of _deleteIds) {
      try {
        const res = await fetch(`${CALENDAR_API}/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok || res.status === 204 || res.status === 410) deleted++;
        showStatus(`${deleted} / ${_deleteIds.length} 件削除中…`, 'ok');
      } catch (e) { /* ignore */ }
    }
    _deleteIds = [];
    btn.textContent = '🗑 登録済み予定を削除';
    btn.classList.remove('confirm');
    showStatus(`${deleted}件の予定を削除しました`, 'ok');
    return;
  }

  showStatus('検索中…', 'ok');
  try {
    _deleteIds = await fetchRegisteredIds(dates);
  } catch (e) {
    showStatus('取得失敗: ' + e.message, 'error');
    return;
  }

  if (!_deleteIds.length) {
    showStatus('期間内に削除対象の予定が見つかりません', 'warn');
    return;
  }

  btn.textContent = `⚠ ${_deleteIds.length}件削除 もう一度押して確定`;
  btn.classList.add('confirm');
  _deleteTimer = setTimeout(() => {
    _deleteTimer = null;
    _deleteIds = [];
    btn.textContent = '🗑 登録済み予定を削除';
    btn.classList.remove('confirm');
    showStatus('キャンセルしました', 'warn');
  }, 5000);
}

async function fetchRegisteredIds(dates) {
  const ids = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: 'source=classcalendar-letus',
      timeMin: `${dates.start}T00:00:00+09:00`,
      timeMax: `${dates.end}T23:59:59+09:00`,
      singleEvents: 'true',
      maxResults: '250',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${CALENDAR_API}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || res.statusText);
    }
    const data = await res.json();
    ids.push(...(data.items || []).map(e => e.id));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return ids;
}

// ---- UI描画 ----

function renderCourses() {
  const weekdays  = courses.filter(c => c.day >= 1 && c.day <= 5).sort((a, b) => a.day - b.day || a.period - b.period);
  const saturdays = courses.filter(c => c.day === 6).sort((a, b) => a.period - b.period);

  const container = document.getElementById('courseList');
  container.innerHTML = '';

  if (!weekdays.length && !saturdays.length) {
    container.innerHTML = '<p class="empty">授業が見つかりません</p>';
    document.getElementById('bulkArea').style.display = 'none';
    return;
  }

  if (weekdays.length) {
    const sec = document.createElement('div');
    sec.className = 'section';
    sec.innerHTML = '<h3>月〜金</h3>';
    weekdays.forEach(c => sec.appendChild(makeCourseCard(c)));
    container.appendChild(sec);
    document.getElementById('bulkArea').style.display = '';
  }

  if (saturdays.length) {
    const sec = document.createElement('div');
    sec.className = 'section sat';
    sec.innerHTML = '<h3>土曜日（終日予定）</h3>';
    saturdays.forEach(c => sec.appendChild(makeCourseCard(c)));
    container.appendChild(sec);
  }
}

function makeCourseCard(course) {
  const { period, day, name, room } = course;
  const p = PERIODS[period];
  const timeLabel = (day !== 6 && p) ? `${p.start}〜${p.end}` : '終日';

  const card = document.createElement('div');
  card.className = 'course-card';

  const info = document.createElement('div');
  info.className = 'course-info';

  const label = document.createElement('span');
  label.className = 'course-label';
  label.textContent = `${DAY_LABEL[day]}曜 ${period}限 (${timeLabel})`;

  const nameEl = document.createElement('span');
  nameEl.className = 'course-name';
  nameEl.textContent = name;

  info.appendChild(label);
  info.appendChild(nameEl);

  if (room) {
    const roomEl = document.createElement('span');
    roomEl.className = 'course-room';
    roomEl.textContent = room;
    info.appendChild(roomEl);
  }

  const btns = document.createElement('div');
  btns.className = 'card-btns';

  const dlBtn = document.createElement('button');
  dlBtn.className = 'btn-dl';
  dlBtn.textContent = '💾';
  dlBtn.addEventListener('click', () => courseAction(course, 'dl'));

  const regBtn = document.createElement('button');
  regBtn.className = 'btn-reg';
  regBtn.textContent = '📅';
  regBtn.addEventListener('click', () => courseAction(course, 'reg'));

  btns.appendChild(dlBtn);
  btns.appendChild(regBtn);
  card.appendChild(info);
  card.appendChild(btns);
  return card;
}

// content.js が未注入の場合は動的に注入してリトライ
async function sendScrape(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_TIMETABLE' });
  } catch (e) {
    if (!e.message.includes('Receiving end does not exist')) throw e;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_TIMETABLE' });
  }
}

function showStatus(msg, type = 'ok') {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  if (type === 'ok') {
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
  }
}
