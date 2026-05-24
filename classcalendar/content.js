chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'SCRAPE_TIMETABLE') return;

  // .ofAuto は学期ごとのコンテナ div（複数あることもある）
  const containers = [...document.querySelectorAll('.ofAuto')];
  if (!containers.length) {
    sendResponse({ courses: [], error: '時間割が表示されていません。検索ボタンを押してから再試行してください。' });
    return true;
  }

  const DAY_MAP = { '月曜日': 1, '火曜日': 2, '水曜日': 3, '木曜日': 4, '金曜日': 5, '土曜日': 6 };
  const courses = [];

  for (const container of containers) {
    const table = container.querySelector('table.classTable') || container.querySelector('table');
    if (!table) continue;

    // ヘッダーから 列インデックス → 曜日番号 のマップを作成
    const colDay = {}; // colIndex → dayNum
    [...table.querySelectorAll('thead th')].forEach((th, i) => {
      const day = DAY_MAP[th.textContent.trim()];
      if (day) colDay[i] = day;
    });

    // tbody の各行をパース
    for (const row of table.querySelectorAll('tbody tr')) {
      // 昼休み行をスキップ
      if (row.querySelector('.colLunch')) continue;

      const jigenTd = row.querySelector('.colJigen');
      if (!jigenTd) continue;
      const period = parseInt(jigenTd.textContent.trim());
      if (!period) continue;

      // colYobi セルは colJigen の次から始まる（列インデックス1〜）
      [...row.querySelectorAll('.colYobi')].forEach((td, i) => {
        const day = colDay[i + 1];
        if (!day) return;

        // noClass = 授業なし
        const jugyo = td.querySelector('.jugyo-info:not(.noClass)');
        if (!jugyo) return;

        const name = jugyo.querySelector('.fontB')?.textContent.trim();
        if (!name) return;

        // room: span 要素（"葛：E503教室" 形式）
        const room = jugyo.querySelector('span')?.textContent.trim() || '';

        // teacher: fontB の直後にある class="" かつ span を持たない div
        let teacher = '';
        let afterName = false;
        for (const child of jugyo.children) {
          if (child.classList.contains('fontB')) { afterName = true; continue; }
          if (afterName && child.className === '' && !child.querySelector('span')) {
            teacher = child.textContent.trim();
            break;
          }
        }

        courses.push({ period, day, name, room, teacher });
      });
    }
  }

  sendResponse({ courses });
  return true;
});
