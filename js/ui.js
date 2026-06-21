// DOM-хелперы: экраны, доска, статус, подсветка, тосты, таймер.

const UI = (() => {
  let _timerInterval = null;

  // Переключить видимый экран
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(el => {
      el.classList.toggle('is-active', el.id === `screen-${name}`);
    });
  }

  // Построить доску (9 клеток)
  function buildBoard() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('button');
      cell.className  = 'cell';
      cell.dataset.idx = i;
      cell.setAttribute('aria-label', `Клетка ${i+1}`);
      board.appendChild(cell);
    }
  }

  // Обновить состояние доски (символы + блокировка)
  function renderBoard(boardArr, disabled = false, dangerousCells = [], winLine = []) {
    document.querySelectorAll('#game-board .cell').forEach((cell, i) => {
      const val = boardArr[i];
      cell.textContent = val || '';
      cell.className   = 'cell' +
        (val       ? ` taken symbol-${val.toLowerCase()}` : '') +
        (winLine.includes(i) ? ' win-cell' : '') +
        (dangerousCells.includes(i) && !val ? ' dangerous' : '');
      cell.disabled = disabled || !!val;
    });
  }

  // Обновить строку статуса над доской
  function setStatus(text, cls = '') {
    const el = document.getElementById('game-status');
    if (el) { el.textContent = text; el.className = `game-status ${cls}`; }
  }

  // Подсветить произвольные клетки (для подсказок)
  function highlightCells(indices, cssClass) {
    document.querySelectorAll('#game-board .cell').forEach((cell, i) => {
      if (indices.includes(i)) cell.classList.add(cssClass);
    });
  }

  // Тост-уведомление (исчезает через 3 сек)
  function toast(msg, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent  = msg;
    el.className    = `toast toast-${type} show`;
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  // Таймер ожидания в секундах
  function startTimer(seconds, onTick, onDone) {
    stopTimer();
    let remaining = seconds;
    if (onTick) onTick(remaining);
    _timerInterval = setInterval(() => {
      remaining--;
      if (onTick) onTick(remaining);
      if (remaining <= 0) { stopTimer(); if (onDone) onDone(); }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }

  // Обновить текст в элементе таймера на экране ожидания
  function setWaitingTimer(seconds) {
    const el = document.getElementById('waiting-timer');
    if (el) el.textContent = `${seconds} с`;
  }

  // Показать/скрыть кнопку реванша
  function showRematch(show) {
    const el = document.getElementById('btn-rematch');
    if (el) el.style.display = show ? '' : 'none';
  }

  // Установить имена игроков на игровом экране
  function setPlayerNames(left, right) {
    const l = document.getElementById('player-left-name');
    const r = document.getElementById('player-right-name');
    if (l) l.textContent = left;
    if (r) r.textContent = right;
  }

  // Установить текущий режим (меняет цветовую тему)
  function setModeTheme(mode) {
    document.body.dataset.mode = mode;
  }

  // Показать дельту рейтинга после партии
  function showRatingDelta(deltaA, deltaB) {
    const dA = document.getElementById('delta-left');
    const dB = document.getElementById('delta-right');
    const fmt = d => d > 0 ? `+${d}` : `${d}`;
    if (dA) { dA.textContent = (deltaA !== 0) ? fmt(deltaA) : ''; dA.className = `rating-delta ${deltaA >= 0 ? 'pos' : 'neg'}`; }
    if (dB) { dB.textContent = (deltaB !== 0) ? fmt(deltaB) : ''; dB.className = `rating-delta ${deltaB >= 0 ? 'pos' : 'neg'}`; }
  }

  // Обновить счётчики текущей сессии (победы/ничьи/поражения) на игровом экране
  function updateSessionScore(wins, draws, losses) {
    const w = document.getElementById('session-wins');
    const d = document.getElementById('session-draws');
    const l = document.getElementById('session-losses');
    if (w) w.textContent = wins;
    if (d) d.textContent = draws;
    if (l) l.textContent = losses;
  }

  // Показать код комнаты для онлайн-игры
  function showRoomCode(code) {
    const el = document.getElementById('room-code');
    if (el) el.textContent = code;
    const wrap = document.getElementById('room-code-wrap');
    if (wrap) wrap.style.display = code ? '' : 'none';
  }

  // Обновить рейтинг в шапке профиля (используется после партии)
  function updateProfileRatings(profile) {
    const rc = document.getElementById('profile-rating-classic');
    const rr = document.getElementById('profile-rating-reverse');
    if (rc) rc.textContent = profile.ratingClassic;
    if (rr) rr.textContent = profile.ratingReverse;
  }

  return {
    showScreen, buildBoard, renderBoard, setStatus, highlightCells,
    toast, startTimer, stopTimer, setWaitingTimer, showRematch,
    setPlayerNames, setModeTheme, showRatingDelta, updateSessionScore,
    showRoomCode, updateProfileRatings,
  };
})();
