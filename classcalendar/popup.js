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
const GCAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

// アクセストークンはメモリのみ保持（ポップアップを閉じると消える）
let accessToken = null;
let courses = [];
let calendarId = null;
let _storedCalError = null;

async function getCalendarId() {
  if (calendarId) return calendarId;
  const stored = await chrome.storage.local.get('calendarId');
  if (stored.calendarId) {
    calendarId = stored.calendarId;
    return calendarId;
  }
  const res = await fetch(`${GCAL_BASE}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: 'CLASS時間割' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || res.statusText);
  }
  const data = await res.json();
  calendarId = data.id;
  await chrome.storage.local.set({ calendarId });
  return calendarId;
}

async function getTargetCalendarId() {
  return document.getElementById('useNewCalendar').checked
    ? await getCalendarId()
    : 'primary';
}

// ---- 初期化 ----

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['startDate', 'endDate', 'eventColor', 'notifyMinutes', 'useNewCalendar']);
  if (stored.startDate)  document.getElementById('startDate').value  = stored.startDate;
  if (stored.endDate)    document.getElementById('endDate').value    = stored.endDate;
  if (stored.eventColor) document.getElementById('eventColor').value = stored.eventColor;
  document.getElementById('notifyMinutes').value = stored.notifyMinutes ?? '10';
  document.getElementById('useNewCalendar').checked = !!stored.useNewCalendar;

  await tryScrape();
});

document.getElementById('startDate').addEventListener('change', e =>
  chrome.storage.local.set({ startDate: e.target.value }));
document.getElementById('endDate').addEventListener('change', e =>
  chrome.storage.local.set({ endDate: e.target.value }));
document.getElementById('eventColor').addEventListener('change', e =>
  chrome.storage.local.set({ eventColor: e.target.value }));
document.getElementById('notifyMinutes').addEventListener('change', e =>
  chrome.storage.local.set({ notifyMinutes: e.target.value }));
document.getElementById('useNewCalendar').addEventListener('change', e =>
  chrome.storage.local.set({ useNewCalendar: e.target.checked }));

document.getElementById('scrapeBtn').addEventListener('click', tryScrape);
document.getElementById('loginBtn').addEventListener('click', authenticate);
document.getElementById('bulkDlBtn').addEventListener('click', () => bulkAction('dl'));
document.getElementById('bulkRegBtn').addEventListener('click', () => {
  const btn = document.getElementById('bulkRegBtn');
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; }, 500);
  bulkAction('reg');
});
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

function countOccurrences(course, dates) {
  const firstOcc = firstOccurrence(dates.start, course.day);
  const fmt = s => `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  const first = new Date(`${fmt(firstOcc)}T00:00:00Z`);
  const end   = new Date(`${dates.end}T00:00:00Z`);
  return Math.floor((end - first) / (7 * 86400000)) + 1;
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
  const uid       = `${Date.now()}-${Math.random().toString(36).slice(2)}@classcalendar`;
  const notifyMin = parseInt(document.getElementById('notifyMinutes').value) || 0;

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
  const valarm = notifyMin ? [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICS(name)}`,
    `TRIGGER:-PT${notifyMin}M`,
    'END:VALARM',
  ] : [];
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;TZID=Asia/Tokyo:${firstDate}T${st.replace(':', '')}00`,
    `DTEND;TZID=Asia/Tokyo:${firstDate}T${et.replace(':', '')}00`,
    `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAY[day]};UNTIL=${rruleUntilDateTime(dates.end)}`,
    `SUMMARY:${escapeICS(name)}`,
    ...(room ? [`LOCATION:${escapeICS(room)}`] : []),
    ...valarm,
    'END:VEVENT',
  ];
}

function generateICS(targets, dates) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CLASS Calendar //JA',
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
  const colorId    = document.getElementById('eventColor').value || undefined;
  const notifyMin  = parseInt(document.getElementById('notifyMinutes').value) || 0;
  const reminders  = notifyMin
    ? { useDefault: false, overrides: [{ method: 'popup', minutes: notifyMin }] }
    : undefined;

  const EXT = { extendedProperties: { private: { source: 'classcalendar-letus', courseCode: course.courseCode || '' } } };

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
      ...(colorId && { colorId }),
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
    ...(colorId && { colorId }),
    ...(reminders && { reminders }),
  };
}

async function runConcurrent(items, fn, onProgress, limit = 5, weights = null) {
  const results     = new Array(items.length);
  const totalWeight = weights ? weights.reduce((a, b) => a + b, 0) : items.length;
  let next = 0, doneWeight = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await fn(items[i]) };
      } catch (e) {
        results[i] = { ok: false, error: e };
      }
      doneWeight += weights ? weights[i] : 1;
      onProgress(doneWeight, totalWeight);
    }
  });
  await Promise.all(workers);
  return results;
}

async function postToCalendar(course, dates) {
  const calId = await getTargetCalendarId();
  const res = await fetch(`${GCAL_BASE}/${calId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildGCalEvent(course, dates)),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || res.statusText);
  }
}

// ---- 登録確認（個別）----

let _regBtn           = null;
let _regCancelHandler = null;
let _regPendingCourse = null;
let _regPendingDates  = null;

function resetRegConfirm(msg) {
  if (_regCancelHandler) {
    document.removeEventListener('click', _regCancelHandler, true);
    _regCancelHandler = null;
  }
  if (_regBtn) {
    _regBtn.textContent = '📅';
    _regBtn.classList.remove('confirm');
    _regBtn = null;
  }
  _regPendingCourse = null;
  _regPendingDates  = null;
  if (msg) showStatus(msg, 'warn');
}

// ---- 登録確認（一括）----

let _bulkRegCancelHandler = null;
let _bulkRegTargets       = null;
let _bulkRegDates         = null;

function resetBulkRegConfirm(msg) {
  if (_bulkRegCancelHandler) {
    document.removeEventListener('click', _bulkRegCancelHandler, true);
    _bulkRegCancelHandler = null;
  }
  _bulkRegTargets = null;
  _bulkRegDates   = null;
  const btn = document.getElementById('bulkRegBtn');
  btn.textContent = '📅 月〜金を一括登録';
  btn.classList.remove('confirm');
  if (msg) showStatus(msg, 'warn');
}

// ---- アクション ----

async function courseAction(course, mode, btn = null) {
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

  // reg モード
  if (!accessToken) { showStatus('先にGoogleにログインしてください', 'warn'); return; }

  // 2回目クリック → 登録実行
  if (_regBtn === btn) {
    const c = _regPendingCourse, d = _regPendingDates;
    resetRegConfirm(null);
    try {
      await postToCalendar(c, d);
      showStatus(`「${c.name}」を ${countOccurrences(c, d)} 件登録しました ✓`, 'ok');
    } catch (e) {
      showStatus(`登録失敗: ${e.message}`, 'error');
    }
    return;
  }

  // 別ボタンがconfirm中なら先にリセット
  resetRegConfirm(null);

  // 重複チェック
  showStatus('確認中…', 'ok');
  let dupCount;
  try {
    dupCount = (await fetchAllCalendarIds(dates, course.courseCode)).reduce((sum, g) => sum + g.ids.length, 0);
  } catch (e) {
    showStatus('確認失敗: ' + e.message, 'error');
    return;
  }

  const errSuffix = _storedCalError ? ` (CLASS時間割: 確認不可)` : '';
  if (dupCount === 0) {
    try {
      await postToCalendar(course, dates);
      showStatus(`「${course.name}」を ${countOccurrences(course, dates)} 件登録しました ✓${errSuffix}`, _storedCalError ? 'warn' : 'ok');
    } catch (e) {
      showStatus(`登録失敗: ${e.message}`, 'error');
    }
    return;
  }

  // 重複あり → 確認待ち
  _regBtn           = btn;
  _regPendingCourse = course;
  _regPendingDates  = dates;
  btn.textContent = `⚠${dupCount}`;
  btn.classList.add('confirm');
  showStatus(`${dupCount}件重複する予定があります。もう一度押して続行${errSuffix}`, 'warn');

  _regCancelHandler = e => {
    if (e.target !== btn) resetRegConfirm('キャンセルしました');
  };
  setTimeout(() => document.addEventListener('click', _regCancelHandler, true), 0);
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

  // reg モード
  if (!accessToken) { showStatus('先にGoogleにログインしてください', 'warn'); return; }

  const bulkRegBtn = document.getElementById('bulkRegBtn');

  // 2回目クリック → 登録実行
  if (_bulkRegCancelHandler) {
    const ts = _bulkRegTargets, d = _bulkRegDates;
    resetBulkRegConfirm(null);
    const occs_ts = ts.map(c => countOccurrences(c, d));
    const results = await runConcurrent(
      ts,
      course => postToCalendar(course, d),
      (done, total) => showStatus(`${done} / ${total} 件登録中…`, 'ok'),
      5, occs_ts
    );
    const success     = results.filter(r => r.ok).length;
    const successOcc  = ts.reduce((acc, c, i) => acc + (results[i]?.ok ? occs_ts[i] : 0), 0);
    const totalOcc    = occs_ts.reduce((a, b) => a + b, 0);
    const firstError  = results.find(r => !r.ok)?.error?.message;
    if (success === 0 && firstError) {
      showStatus(`登録失敗: ${firstError}`, 'error');
    } else {
      showStatus(`完了: ${successOcc} / ${totalOcc} 件登録しました`, success === ts.length ? 'ok' : 'warn');
    }
    return;
  }

  // 重複チェック（1回のAPIで全件確認）
  showStatus('確認中…', 'ok');
  let existingCodes;
  try {
    existingCodes = await fetchExistingCourseCodes(dates);
  } catch (e) {
    showStatus('確認失敗: ' + e.message, 'error');
    return;
  }

  const dupCourses = targets.filter(c =>
    c.courseCode ? existingCodes.has(c.courseCode) : existingCodes.has('')
  );
  const dupCount   = dupCourses.length;
  const dupOcc     = dupCourses.reduce((acc, c) => acc + countOccurrences(c, dates), 0);

  const errSuffix = _storedCalError ? ` (CLASS時間割: 確認不可)` : '';
  if (dupCount === 0) {
    const occs = targets.map(c => countOccurrences(c, dates));
    const results = await runConcurrent(
      targets,
      course => postToCalendar(course, dates),
      (done, total) => showStatus(`${done} / ${total} 件登録中…`, 'ok'),
      5, occs
    );
    const success     = results.filter(r => r.ok).length;
    const successOcc  = targets.reduce((acc, c, i) => acc + (results[i]?.ok ? occs[i] : 0), 0);
    const totalOcc    = occs.reduce((a, b) => a + b, 0);
    const firstError  = results.find(r => !r.ok)?.error?.message;
    if (success === 0 && firstError) {
      showStatus(`登録失敗: ${firstError}`, 'error');
    } else {
      showStatus(`完了: ${successOcc} / ${totalOcc} 件登録しました${errSuffix}`, success === targets.length && !_storedCalError ? 'ok' : 'warn');
    }
    return;
  }

  // 重複あり → 確認待ち
  _bulkRegTargets = targets;
  _bulkRegDates   = dates;
  bulkRegBtn.textContent = `⚠ ${dupOcc}件重複 もう一度押して続行`;
  bulkRegBtn.classList.add('confirm');
  showStatus(`${dupOcc}件重複する予定があります。もう一度押して続行${errSuffix}`, 'warn');

  _bulkRegCancelHandler = e => {
    if (e.target !== bulkRegBtn) resetBulkRegConfirm('キャンセルしました');
  };
  setTimeout(() => document.addEventListener('click', _bulkRegCancelHandler, true), 0);
}

// ---- 削除 ----

let _deleteGroups        = [];
let _deleteCancelHandler = null;

function resetBulkDelete(msg) {
  if (_deleteCancelHandler) {
    document.removeEventListener('click', _deleteCancelHandler, true);
    _deleteCancelHandler = null;
  }
  _deleteGroups = [];
  const btn = document.getElementById('deleteBtn');
  btn.textContent = '🗑 登録済み予定を削除';
  btn.classList.remove('confirm');
  if (msg) showStatus(msg, 'warn');
}

let _courseDeleteGroups        = [];
let _courseDeleteBtn           = null;
let _courseDeleteCancelHandler = null;

function resetCourseDelete(msg) {
  if (_courseDeleteCancelHandler) {
    document.removeEventListener('click', _courseDeleteCancelHandler, true);
    _courseDeleteCancelHandler = null;
  }
  _courseDeleteGroups = [];
  if (_courseDeleteBtn) {
    _courseDeleteBtn.textContent = '🗑';
    _courseDeleteBtn.classList.remove('confirm');
    _courseDeleteBtn = null;
  }
  if (msg) showStatus(msg, 'warn');
}

async function deleteRegistered() {
  if (!accessToken) { showStatus('先にGoogleにログインしてください', 'warn'); return; }
  const dates = getDateRange();
  if (!dates) return;

  const btn = document.getElementById('deleteBtn');

  // 2回目クリック → 確定削除
  if (_deleteCancelHandler) {
    const groups = _deleteGroups;
    resetBulkDelete(null);
    const totalCount = groups.reduce((sum, g) => sum + g.ids.length, 0);
    let deletedCount = 0, anyFail = false;
    for (const { calId, ids } of groups) {
      const r = await bulkDeleteIds(ids, calId);
      deletedCount += r.deleted;
      anyFail ||= r.partialFail;
    }
    showStatus(
      anyFail ? `一部削除に失敗しました（${deletedCount} / ${totalCount}件削除）` : `${deletedCount}件の予定を削除しました`,
      anyFail ? 'warn' : 'ok'
    );
    return;
  }

  // 1回目クリック → 件数検索（全カレンダー対象）
  showStatus('検索中…', 'ok');
  try {
    _deleteGroups = await fetchAllCalendarIds(dates);
  } catch (e) {
    showStatus('取得失敗: ' + e.message, 'error');
    return;
  }

  const errSuffix = _storedCalError ? ` (CLASS時間割: 取得失敗)` : '';
  const totalIds = _deleteGroups.reduce((sum, g) => sum + g.ids.length, 0);
  if (!totalIds) {
    showStatus(`期間内に削除対象の予定が見つかりません${errSuffix}`, 'warn');
    return;
  }

  btn.textContent = `⚠ ${totalIds}件削除 もう一度押して確定`;
  btn.classList.add('confirm');
  showStatus(`${totalIds}件見つかりました。もう一度押して削除${errSuffix}`, 'warn');

  _deleteCancelHandler = e => {
    if (e.target !== btn) resetBulkDelete('キャンセルしました');
  };
  setTimeout(() => document.addEventListener('click', _deleteCancelHandler, true), 0);
}

async function bulkDeleteIds(ids, calId) {

  const doDelete = (targetIds, prefix = '') => runConcurrent(
    targetIds,
    async id => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${GCAL_BASE}/${calId}/events/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok || res.status === 204 || res.status === 410) return true;
        if (res.status !== 429 && res.status !== 503) return false;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
      return false;
    },
    (done, total) => showStatus(`${prefix}${done} / ${total} 件削除中…`, 'ok')
  );

  const results = await doDelete(ids);
  const failedIds = ids.filter((_, i) => !(results[i]?.ok && results[i]?.value));

  if (!failedIds.length) return { deleted: ids.length, partialFail: false };

  // 失敗分を1回だけ再試行
  showStatus(`${failedIds.length}件を再試行中…`, 'warn');
  await new Promise(r => setTimeout(r, 1500));
  const retryResults = await doDelete(failedIds, '再試行 ');
  const stillFailed  = failedIds.filter((_, i) => !(retryResults[i]?.ok && retryResults[i]?.value));

  return {
    deleted: ids.length - stillFailed.length,
    partialFail: stillFailed.length > 0,
  };
}

async function paginatedCalendarFetch(calId, dates, filter, mapFn) {
  const results = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: filter,
      timeMin: `${dates.start}T00:00:00+09:00`,
      timeMax: `${dates.end}T23:59:59+09:00`,
      singleEvents: 'true',
      maxResults: '250',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${GCAL_BASE}/${calId}/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || res.statusText);
    }
    const data = await res.json();
    for (const item of (data.items || [])) {
      const val = mapFn(item);
      if (val != null) results.push(val);
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return results;
}

async function fetchFromCalendar(calId, dates, courseCode = null) {
  const filter = courseCode ? `courseCode=${courseCode}` : 'source=classcalendar-letus';
  return paginatedCalendarFetch(calId, dates, filter, item => item.id ?? null);
}

async function fetchBothCalendars(fn) {
  const { calendarId: storedId } = await chrome.storage.local.get('calendarId');
  _storedCalError = null;
  const [primary, stored] = await Promise.all([
    fn('primary'),
    storedId
      ? fn(storedId).catch(e => {
          _storedCalError = e.message;
          return [];
        })
      : Promise.resolve([]),
  ]);
  return { storedId, primary, stored };
}

async function fetchAllCalendarIds(dates, courseCode = null) {
  const { storedId, primary: primaryIds, stored: newCalIds } = await fetchBothCalendars(
    calId => fetchFromCalendar(calId, dates, courseCode)
  );
  const groups = [];
  if (primaryIds.length) groups.push({ calId: 'primary', ids: primaryIds });
  if (storedId && newCalIds.length) groups.push({ calId: storedId, ids: newCalIds });
  return groups;
}

async function fetchExistingCourseCodes(dates) {
  const mapFn = item => item.extendedProperties?.private?.courseCode ?? null;
  const { primary, stored } = await fetchBothCalendars(
    calId => paginatedCalendarFetch(calId, dates, 'source=classcalendar-letus', mapFn)
  );
  return new Set([...primary, ...stored]);
}

async function deleteCourse(course, btn) {
  if (!accessToken) { showStatus('先にGoogleにログインしてください', 'warn'); return; }
  const dates = getDateRange();
  if (!dates) return;
  if (!course.courseCode) { showStatus('授業コードが取得できていません', 'warn'); return; }

  // 2回目クリック → 確定削除
  if (_courseDeleteBtn === btn) {
    const groups = _courseDeleteGroups;
    resetCourseDelete(null);
    const totalCount = groups.reduce((sum, g) => sum + g.ids.length, 0);
    let deletedCount = 0, anyFail = false;
    for (const { calId, ids } of groups) {
      const r = await bulkDeleteIds(ids, calId);
      deletedCount += r.deleted;
      anyFail ||= r.partialFail;
    }
    showStatus(
      anyFail ? `一部削除に失敗しました（${deletedCount} / ${totalCount}件削除）` : `「${course.name}」の予定を${deletedCount}件削除しました`,
      anyFail ? 'warn' : 'ok'
    );
    return;
  }

  // 別ボタンがconfirm中なら先にリセット
  resetCourseDelete(null);

  // 1回目クリック → 件数検索（全カレンダー対象）
  showStatus('検索中…', 'ok');
  try {
    _courseDeleteGroups = await fetchAllCalendarIds(dates, course.courseCode);
  } catch (e) {
    showStatus('取得失敗: ' + e.message, 'error');
    return;
  }
  const errSuffix = _storedCalError ? ` (CLASS時間割: 取得失敗)` : '';
  const totalIds = _courseDeleteGroups.reduce((sum, g) => sum + g.ids.length, 0);
  if (!totalIds) { showStatus(`期間内に削除対象の予定が見つかりません${errSuffix}`, 'warn'); return; }

  _courseDeleteBtn = btn;
  btn.textContent = `⚠${totalIds}`;
  btn.classList.add('confirm');
  showStatus(`${totalIds}件見つかりました。もう一度押して削除${errSuffix}`, 'warn');

  _courseDeleteCancelHandler = e => {
    if (e.target !== btn) resetCourseDelete('キャンセルしました');
  };
  setTimeout(() => document.addEventListener('click', _courseDeleteCancelHandler, true), 0);
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
  dlBtn.title = 'ICSをダウンロード';
  dlBtn.addEventListener('click', () => courseAction(course, 'dl'));

  const regBtn = document.createElement('button');
  regBtn.className = 'btn-reg';
  regBtn.textContent = '📅';
  regBtn.title = 'Googleカレンダーに登録';
  regBtn.addEventListener('click', () => {
    regBtn.disabled = true;
    setTimeout(() => { regBtn.disabled = false; }, 500);
    courseAction(course, 'reg', regBtn);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-del';
  delBtn.textContent = '🗑';
  delBtn.title = '登録済み予定を削除';
  delBtn.addEventListener('click', () => deleteCourse(course, delBtn));

  btns.appendChild(dlBtn);
  btns.appendChild(regBtn);
  btns.appendChild(delBtn);
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
