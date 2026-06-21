// Оркестратор: appState, роутер, обработчики, bootstrap.

const APP = (() => {
  // Единое состояние приложения
  const appState = {
    screen:     'menu',
    mode:       'classic',
    opponent:   'bot',
    difficulty: 'hard',
    board:      null,
    current:    'X',
    mySymbol:   'X',
    result:     null,
    busy:       false,
    online:     { roomCode: null, connected: false, isHost: false },
    profile:    null,
    botProfile: { id: 'bot', name: 'Бот', ratingClassic: 1000, ratingReverse: 1000, gamesClassic: 0, gamesReverse: 0 },
    session:    { wins: 0, draws: 0, losses: 0 },
    waitingTimeout: null,
  };

  // ---- Инициализация -------------------------------------------------------

  function init() {
    appState.profile = STORAGE.getOrCreateProfile('Игрок');

    // Проверить URL-hash (correspondence-режим)
    const urlState = ONLINE.decodeStateFromUrl();
    if (urlState) {
      _startCorrespondenceGame(urlState);
      return;
    }

    UI.showScreen('menu');
    _bindMenu();
    _bindProfile();
    _bindGame();
    _bindLeaderboard();
    _bindHistory();
    _bindWaiting();
    _bindOnline();
  }

  // ---- Привязка обработчиков -----------------------------------------------

  function _bindMenu() {
    // Выбор режима
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        appState.mode = btn.dataset.mode;
        document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b === btn));
        UI.setModeTheme(appState.mode);
      });
    });

    // Выбор типа соперника
    document.querySelectorAll('[data-opponent]').forEach(btn => {
      btn.addEventListener('click', () => {
        appState.opponent = btn.dataset.opponent;
        document.querySelectorAll('[data-opponent]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // Уровень сложности бота
    document.querySelectorAll('[data-diff]').forEach(btn => {
      btn.addEventListener('click', () => {
        appState.difficulty = btn.dataset.diff;
        document.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // Кнопка «Играть»
    document.getElementById('btn-play')?.addEventListener('click', () => {
      if (appState.opponent === 'online') {
        _startOnlineSearch();
      } else {
        _startGame();
      }
    });

    // Кнопки навигации
    document.getElementById('btn-to-profile')?.addEventListener('click', () => {
      UI.setModeTheme('classic');
      RATING.renderProfile(appState.profile);
      UI.showScreen('profile');
    });
    document.getElementById('btn-to-leaderboard')?.addEventListener('click', () => {
      UI.setModeTheme('classic');
      UI.showScreen('leaderboard');
      _loadLeaderboard();
    });
    document.getElementById('btn-to-history')?.addEventListener('click', () => {
      UI.setModeTheme('classic');
      UI.showScreen('history');
      _loadHistory();
    });
  }

  function _bindProfile() {
    document.getElementById('btn-back-profile')?.addEventListener('click', () => { UI.setModeTheme(appState.mode); UI.showScreen('menu'); });
    document.getElementById('btn-save-name')?.addEventListener('click', () => {
      const inp = document.getElementById('profile-name-input');
      if (!inp) return;
      const name = inp.value.trim().slice(0, 20) || 'Игрок';
      appState.profile.name = name;
      STORAGE.saveProfile(appState.profile);
      RATING.renderProfile(appState.profile);
      UI.toast('Имя сохранено', 'success');
    });
  }

  function _bindGame() {
    // Ходы по клеткам
    document.getElementById('game-board')?.addEventListener('click', e => {
      const cell = e.target.closest('.cell');
      if (!cell || appState.busy || appState.result) return;
      const idx = Number(cell.dataset.idx);
      _handleMove(idx);
    });

    document.getElementById('btn-rematch')?.addEventListener('click', () => {
      appState.session = { wins: 0, draws: 0, losses: 0 };
      _startGame();
    });
    document.getElementById('btn-new-game')?.addEventListener('click', () => _startGame());
    document.getElementById('btn-back-game')?.addEventListener('click', () => {
      ONLINE.disconnect();
      UI.setModeTheme(appState.mode);
      UI.showScreen('menu');
    });

    // Кнопка «Поделиться ходом» (correspondence)
    document.getElementById('btn-share-move')?.addEventListener('click', () => {
      const url = ONLINE.encodeStateToUrl({
        board:    appState.board,
        current:  appState.current,
        mode:     appState.mode,
        mySymbol: appState.mySymbol,
      });
      navigator.clipboard.writeText(url).then(() => UI.toast('Ссылка скопирована!', 'success'));
    });
  }

  function _bindLeaderboard() {
    document.getElementById('btn-back-leaderboard')?.addEventListener('click', () => { UI.setModeTheme(appState.mode); UI.showScreen('menu'); });
  }

  function _bindHistory() {
    document.getElementById('btn-back-history')?.addEventListener('click', () => { UI.setModeTheme(appState.mode); UI.showScreen('menu'); });
  }

  function _bindWaiting() {
    document.getElementById('btn-cancel-wait')?.addEventListener('click', () => {
      clearTimeout(appState.waitingTimeout);
      MATCHMAKING.leaveQueue();
      ONLINE.disconnect();
      UI.stopTimer();
      UI.showScreen('menu');
    });
  }

  function _bindOnline() {
    document.getElementById('btn-copy-room')?.addEventListener('click', () => {
      const code = document.getElementById('room-code')?.textContent;
      if (code) navigator.clipboard.writeText(code).then(() => UI.toast('Код скопирован!', 'success'));
    });

    document.getElementById('btn-join-room')?.addEventListener('click', () => {
      const inp  = document.getElementById('join-room-input');
      const code = inp?.value.trim();
      if (!code) return;
      _joinOnlineRoom(code);
    });
  }

  // ---- Запуск игры --------------------------------------------------------

  function _startGame() {
    appState.board   = GAME.createBoard();
    appState.current = 'X';
    appState.result  = null;
    appState.busy    = false;
    appState.mySymbol = 'X'; // в bot/local я всегда X (или меняется ниже)

    UI.buildBoard();
    UI.setModeTheme(appState.mode);
    UI.showRematch(false);
    UI.showRatingDelta(0, 0);
    UI.updateSessionScore(appState.session.wins, appState.session.draws, appState.session.losses);

    const botName = `Бот (${_diffLabel(appState.difficulty)})`;
    if (appState.opponent === 'bot') {
      UI.setPlayerNames(appState.profile.name, botName);
    } else if (appState.opponent === 'local') {
      UI.setPlayerNames('Игрок X', 'Игрок O');
    }

    UI.showScreen('game');
    _renderCurrentState();

    // Если бот ходит первым (X и opponent=bot при смене сторон — можно не делать, X всегда игрок)
  }

  function _diffLabel(d) {
    return d === 'easy' ? 'лёгкий' : d === 'medium' ? 'средний' : 'сложный';
  }

  // ---- Обработка хода -----------------------------------------------------

  function _handleMove(idx) {
    if (appState.board[idx] || appState.result || appState.busy) return;

    // Онлайн: отправить ход сопернику
    if (appState.opponent === 'online' && appState.online.connected) {
      ONLINE.sendMove(idx);
    }

    _applyMove(idx, appState.current);
  }

  function _applyMove(idx, symbol) {
    appState.board   = GAME.applyMove(appState.board, idx, symbol);
    appState.current = GAME.nextSymbol(symbol);

    const result = GAME.getResult(appState.board, appState.mode);
    appState.result = result.state !== 'playing' ? result : null;

    _renderCurrentState();

    if (appState.result) {
      _handleGameOver(appState.result);
      return;
    }

    // Ход бота
    if (appState.opponent === 'bot' && appState.current !== appState.mySymbol) {
      appState.busy = true;
      _renderCurrentState();
      setTimeout(() => {
        const botIdx = BOT.botMove(appState.board, appState.mode, appState.difficulty, appState.current);
        appState.busy = false;
        if (botIdx >= 0) _applyMove(botIdx, appState.current);
      }, CONFIG.BOT_DELAY_MS);
    }
  }

  function _renderCurrentState() {
    const dangerous = (appState.mode === 'reverse' && !appState.result)
      ? BOT.getDangerousCells(appState.board, appState.current, appState.mode)
      : [];

    const winLine = appState.result?.line || [];

    UI.renderBoard(
      appState.board,
      !!appState.busy || !!appState.result ||
        (appState.opponent === 'online' && appState.current !== appState.mySymbol),
      dangerous,
      winLine
    );

    if (!appState.result) {
      const whose = appState.current === appState.mySymbol ? 'Ваш ход' : 'Ход соперника';
      const dangerWarn = dangerous.length > 0 ? ' — осторожно: выделены опасные клетки!' : '';
      UI.setStatus(`${whose} (${appState.current})${dangerWarn}`,
                   appState.current === appState.mySymbol ? 'your-turn' : 'opp-turn');
    }
  }

  // ---- Конец партии -------------------------------------------------------

  function _handleGameOver(result) {
    let playerWon = false;
    let playerLost = false;
    let draw = false;

    if (result.state === 'draw') {
      draw = true;
      UI.setStatus('Ничья!', 'draw');
    } else if (result.state === 'win') {
      // Классика: winner собрал тройку → победил
      playerWon  = result.winner === appState.mySymbol;
      playerLost = !playerWon;
      UI.setStatus(playerWon ? 'Вы победили!' : 'Вы проиграли', playerWon ? 'win' : 'lose');
    } else if (result.state === 'lose') {
      // Реверс: loser собрал тройку → ПРОИГРАЛ
      playerLost = result.loser === appState.mySymbol;
      playerWon  = !playerLost;
      UI.setStatus(playerWon ? 'Вы победили!' : 'Вы проиграли', playerWon ? 'win' : 'lose');
    }

    if (playerWon)  appState.session.wins++;
    if (playerLost) appState.session.losses++;
    if (draw)       appState.session.draws++;
    UI.updateSessionScore(appState.session.wins, appState.session.draws, appState.session.losses);

    // Обновляем рейтинг локально (оптимистично)
    if (appState.opponent !== 'local') {
      const scoreA = draw ? 0.5 : (playerWon ? 1 : 0);
      const oppProfile = appState.opponent === 'bot' ? appState.botProfile : _getOpponentProfile();
      const { newA, newB, deltaA, deltaB } = RATING.applyMatch(appState.profile, oppProfile, scoreA, appState.mode);

      const ratingKey = appState.mode === 'classic' ? 'ratingClassic' : 'ratingReverse';
      const gamesKey  = appState.mode === 'classic' ? 'gamesClassic'  : 'gamesReverse';
      appState.profile[ratingKey] = newA;
      appState.profile[gamesKey]++;
      STORAGE.saveProfile(appState.profile);
      UI.updateProfileRatings(appState.profile);
      UI.showRatingDelta(deltaA, deltaB);

      // Отправить результат в репо (только для игр не против локального игрока)
      if (appState.opponent !== 'bot') {
        _submitToRepo({ playerWon, playerLost, draw, oppProfile, scoreA });
      }
    }

    UI.showRematch(true);
  }

  function _getOpponentProfile() {
    return appState._opponentProfile || { id: 'unknown', name: 'Соперник', ratingClassic: 1000, ratingReverse: 1000, gamesClassic: 0, gamesReverse: 0 };
  }

  function _submitToRepo({ playerWon, playerLost, draw, oppProfile, scoreA }) {
    const payload = {
      winnerId:      playerWon  ? appState.profile.id : oppProfile.id,
      loserId:       playerLost ? appState.profile.id : oppProfile.id,
      winnerName:    playerWon  ? appState.profile.name : oppProfile.name,
      loserName:     playerLost ? appState.profile.name : oppProfile.name,
      winnerRating:  playerWon  ? appState.profile.ratingClassic : oppProfile.ratingClassic,
      loserRating:   playerLost ? appState.profile.ratingClassic : oppProfile.ratingClassic,
      mode:          appState.mode,
      draw,
    };
    STORAGE.submitResult(payload).catch(e => {
      console.warn('[main] submitResult failed:', e.message);
      UI.toast('Результат не сохранён в репо (проверьте токен)', 'warn');
    });
  }

  // ---- Онлайн-игра --------------------------------------------------------

  async function _startOnlineSearch() {
    UI.showScreen('waiting');
    UI.setStatus('Ищем соперника...', '');

    const MAX_WAIT = 120;
    let elapsed = 0;
    let windowSize = 50;

    UI.startTimer(MAX_WAIT,
      sec => { UI.setWaitingTimer(MAX_WAIT - elapsed); elapsed++; if (elapsed % 10 === 0) windowSize += 50; },
      () => { MATCHMAKING.leaveQueue(); UI.toast('Соперник не найден', 'warn'); UI.showScreen('menu'); }
    );

    try {
      if (CONFIG.FIREBASE.databaseURL) {
        // Firebase-путь
        const match = await MATCHMAKING.findMatchFirebase(appState.profile, appState.mode);
        UI.stopTimer();
        appState._opponentProfile = { id: match.opponentId, name: match.opponentName || 'Соперник', ratingClassic: match.opponentRating || 1000, ratingReverse: match.opponentRating || 1000, gamesClassic: 0, gamesReverse: 0 };
        appState.opponent = 'online';
        _connectToRoom(match.roomCode, false); // false = гость (хост создал комнату)
      } else {
        UI.toast('Firebase не настроен. Создайте комнату вручную.', 'warn');
        UI.showScreen('menu');
      }
    } catch (e) {
      UI.stopTimer();
      UI.toast(`Ошибка поиска: ${e.message}`, 'error');
      UI.showScreen('menu');
    }
  }

  async function _connectToRoom(roomCode, isHost) {
    appState.online.roomCode = roomCode;
    appState.online.isHost   = isHost;
    appState.mySymbol        = isHost ? 'X' : 'O';

    UI.showRoomCode(roomCode);
    UI.setStatus('Подключаемся...', '');

    ONLINE.onReady(() => {
      appState.online.connected = true;
      UI.toast('Соперник подключился!', 'success');
      _startGame();
    });

    ONLINE.onRemoteMove(idx => {
      if (appState.current !== appState.mySymbol) {
        _applyMove(idx, appState.current);
      }
    });

    ONLINE.onDisconnect(() => {
      UI.toast('Соперник отключился', 'warn');
      appState.online.connected = false;
    });

    try {
      if (isHost) {
        const code = await ONLINE.createRoom();
        UI.showRoomCode(code);
      } else {
        await ONLINE.joinRoom(roomCode);
      }
    } catch (e) {
      UI.toast(`Ошибка P2P: ${e.message}`, 'error');
      UI.showScreen('menu');
    }
  }

  async function _joinOnlineRoom(code) {
    appState.opponent = 'online';
    await _connectToRoom(code, false);
  }

  // ---- Correspondence (URL-hash) ------------------------------------------

  function _startCorrespondenceGame(urlState) {
    appState.board      = urlState.board;
    appState.current    = urlState.current;
    appState.mode       = urlState.mode;
    appState.opponent   = 'online';
    appState.mySymbol   = urlState.current; // я хожу сейчас
    appState.result     = null;
    appState.busy       = false;
    appState.online.connected = false;

    UI.buildBoard();
    UI.setModeTheme(appState.mode);
    UI.showRematch(false);
    UI.showScreen('game');
    _renderCurrentState();
    UI.toast('Ваш ход! После хода поделитесь ссылкой.', 'info');

    document.getElementById('btn-share-move')?.style && (document.getElementById('btn-share-move').style.display = '');
    ONLINE.clearUrlState();
  }

  // ---- Лидерборд и история ------------------------------------------------

  async function _loadLeaderboard() {
    const container = document.getElementById('leaderboard-table');
    if (container) container.innerHTML = '<p>Загрузка...</p>';
    try {
      const [classic, reverse] = await Promise.all([
        STORAGE.readJSON('data/leaderboard_classic.json'),
        STORAGE.readJSON('data/leaderboard_reverse.json'),
      ]);
      RATING.renderLeaderboard(classic, reverse);
    } catch (e) {
      if (container) container.innerHTML = '<p class="error">Не удалось загрузить (репо не настроен)</p>';
    }
  }

  async function _loadHistory() {
    const el = document.getElementById('history-list');
    if (el) el.innerHTML = '<p>Загрузка...</p>';
    try {
      const history = await STORAGE.readJSON('data/history.json');
      const entries = history[appState.profile.id] || [];
      RATING.renderHistory(entries);
    } catch (e) {
      if (el) el.innerHTML = '<p class="error">Не удалось загрузить (репо не настроен)</p>';
    }
  }

  return { init };
})();

// Старт приложения
document.addEventListener('DOMContentLoaded', APP.init);
