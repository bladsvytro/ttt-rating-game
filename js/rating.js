// Elo-рейтинг и рендер лидерборда/истории.

const RATING = (() => {

  // Ожидаемый счёт игрока A против B
  function expectedScore(ra, rb) {
    return 1 / (1 + Math.pow(10, (rb - ra) / 400));
  }

  // K-фактор: 40 для первых 10 игр, затем 20
  function kFactor(gamesPlayed) {
    return gamesPlayed < CONFIG.ELO_K_THRESHOLD ? CONFIG.ELO_K_HIGH : CONFIG.ELO_K_LOW;
  }

  /**
   * Пересчитать рейтинг одного игрока.
   * scoreA: 1 = победа, 0.5 = ничья, 0 = поражение
   */
  function computeElo(ratingA, ratingB, scoreA, gamesPlayed) {
    const E = expectedScore(ratingA, ratingB);
    const K = kFactor(gamesPlayed);
    return Math.round(ratingA + K * (scoreA - E));
  }

  /**
   * Применить результат матча к профилям обоих игроков (в памяти).
   * Возвращает { newA, newB } — новые рейтинги.
   * mode: 'classic' | 'reverse'
   */
  function applyMatch(profileA, profileB, scoreA, mode) {
    const ratingKey = mode === 'classic' ? 'ratingClassic' : 'ratingReverse';
    const gamesKey  = mode === 'classic' ? 'gamesClassic'  : 'gamesReverse';

    const ra = profileA[ratingKey];
    const rb = profileB[ratingKey];
    const ga = profileA[gamesKey];
    const gb = profileB[gamesKey];

    const newA = computeElo(ra, rb, scoreA, ga);
    const newB = computeElo(rb, ra, 1 - scoreA, gb);

    return { newA, newB, deltaA: newA - ra, deltaB: newB - rb };
  }

  // ---------- Рендер -------------------------------------------------------

  /**
   * Отрисовать таблицу лидерборда.
   * mode: 'classic' | 'reverse' — активная колонка для сортировки.
   * data: массив записей из leaderboard_classic.json / leaderboard_reverse.json
   * Отображает обе колонки рейтинга (classic / reverse), объединяя данные из обоих файлов.
   */
  function renderLeaderboard(classicData, reverseData) {
    const container = document.getElementById('leaderboard-table');
    if (!container) return;

    // Объединяем записи по playerId
    const map = {};
    (classicData || []).forEach(r => {
      map[r.playerId] = { ...r, ratingClassic: r.rating, rankClassic: r.rank };
    });
    (reverseData || []).forEach(r => {
      if (map[r.playerId]) {
        map[r.playerId].ratingReverse = r.rating;
        map[r.playerId].rankReverse   = r.rank;
      } else {
        map[r.playerId] = { ...r, ratingReverse: r.rating, rankReverse: r.rank, ratingClassic: CONFIG.ELO_START };
      }
    });

    const rows = Object.values(map);
    rows.sort((a,b) => ((b.ratingClassic||0) + (b.ratingReverse||0)) - ((a.ratingClassic||0) + (a.ratingReverse||0)));

    let sortBy   = 'classic'; // текущая колонка сортировки
    let sortDesc = true;

    function buildTable() {
      container.innerHTML = '';
      const sortedRows = [...rows].sort((a,b) => {
        const key = sortBy === 'classic' ? 'ratingClassic' : 'ratingReverse';
        return sortDesc ? (b[key]||0) - (a[key]||0) : (a[key]||0) - (b[key]||0);
      });

      const table = document.createElement('table');
      table.className = 'lb-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>#</th>
            <th>Игрок</th>
            <th class="sortable ${sortBy==='classic'?'active':''}" data-col="classic">
              Классика ${sortBy==='classic' ? (sortDesc?'↓':'↑') : ''}
            </th>
            <th class="sortable ${sortBy==='reverse'?'active':''}" data-col="reverse">
              Реверс ${sortBy==='reverse' ? (sortDesc?'↓':'↑') : ''}
            </th>
            <th>Игр</th>
          </tr>
        </thead>
        <tbody>
          ${sortedRows.map((r,i) => `
            <tr>
              <td>${i+1}</td>
              <td>${escHtml(r.name || r.playerId)}</td>
              <td class="${sortBy==='classic'?'active':''}">${r.ratingClassic || CONFIG.ELO_START}</td>
              <td class="${sortBy==='reverse'?'active':''}">${r.ratingReverse || CONFIG.ELO_START}</td>
              <td>${(r.games||0)}</td>
            </tr>
          `).join('')}
        </tbody>`;

      table.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.col;
          if (sortBy === col) {
            sortDesc = !sortDesc;
          } else {
            sortBy   = col;
            sortDesc = true;
          }
          buildTable();
        });
      });
      container.appendChild(table);
    }

    buildTable();
  }

  /**
   * Отрисовать историю последних 5 партий игрока.
   * entries: массив из history.json[playerId]
   */
  function renderHistory(entries) {
    const container = document.getElementById('history-list');
    if (!container) return;

    if (!entries || entries.length === 0) {
      container.innerHTML = '<p class="empty">Нет сыгранных партий</p>';
      return;
    }

    container.innerHTML = entries.slice(0,5).map(e => {
      const resultLabel = e.result === 'win'  ? '✔ Победа'
                        : e.result === 'lose' ? '✘ Поражение'
                        :                       '— Ничья';
      const resultCls   = e.result === 'win'  ? 'win'
                        : e.result === 'lose' ? 'lose'
                        :                       'draw';
      const delta = e.ratingDelta > 0 ? `+${e.ratingDelta}` : `${e.ratingDelta}`;
      const modeName = e.mode === 'classic' ? 'Классика' : 'Реверс';
      const date  = new Date(e.date).toLocaleDateString('ru-RU');
      return `
        <div class="history-item ${resultCls}">
          <span class="hist-result">${resultLabel}</span>
          <span class="hist-opponent">vs <b>${escHtml(e.opponent)}</b></span>
          <span class="hist-mode">${modeName}</span>
          <span class="hist-delta ${e.ratingDelta >= 0 ? 'pos' : 'neg'}">${delta}</span>
          <span class="hist-date">${date}</span>
        </div>`;
    }).join('');
  }

  // Рендер профиля в шапке экрана профиля
  function renderProfile(profile) {
    const nameEl  = document.getElementById('profile-name-display');
    const ratingC = document.getElementById('profile-rating-classic');
    const ratingR = document.getElementById('profile-rating-reverse');
    const gamesC  = document.getElementById('profile-games-classic');
    const gamesR  = document.getElementById('profile-games-reverse');
    if (nameEl)  nameEl.textContent  = profile.name;
    if (ratingC) ratingC.textContent = profile.ratingClassic;
    if (ratingR) ratingR.textContent = profile.ratingReverse;
    if (gamesC)  gamesC.textContent  = profile.gamesClassic;
    if (gamesR)  gamesR.textContent  = profile.gamesReverse;
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  return { expectedScore, kFactor, computeElo, applyMatch, renderLeaderboard, renderHistory, renderProfile };
})();
