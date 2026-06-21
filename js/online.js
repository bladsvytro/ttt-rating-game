// P2P-транспорт через PeerJS + correspondence-fallback через URL-hash.
// Требует: <script src="https://unpkg.com/peerjs@1/dist/peerjs.min.js"></script>

const ONLINE = (() => {
  let peer     = null;
  let conn     = null;
  let _onMove  = null;  // callback(index)
  let _onReady = null;  // callback() — соединение установлено
  let _onDisc  = null;  // callback() — соединение разорвано

  // Генерация короткого кода комнаты (6 символов)
  function makeRoomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  // ICE-конфиг из config.js
  function iceConfig() {
    return { iceServers: CONFIG.ICE_SERVERS };
  }

  /**
   * Создать комнату (хост).
   * Хост = исходная сторона, которая валидирует ходы.
   * Возвращает Promise<roomCode>.
   */
  function createRoom() {
    return new Promise((resolve, reject) => {
      const code = makeRoomCode();
      peer = new Peer(code, {
        host:   CONFIG.PEER_HOST,
        port:   CONFIG.PEER_PORT,
        path:   CONFIG.PEER_PATH,
        secure: CONFIG.PEER_SECURE,
        config: iceConfig(),
      });

      peer.on('open', id => {
        resolve(id); // id совпадает с code
      });
      peer.on('error', reject);

      peer.on('connection', c => {
        conn = c;
        _setupConn();
      });
    });
  }

  /**
   * Подключиться к комнате (гость).
   * Возвращает Promise<void> (резолвится при открытии соединения).
   */
  function joinRoom(roomCode) {
    return new Promise((resolve, reject) => {
      peer = new Peer(undefined, {
        host:   CONFIG.PEER_HOST,
        port:   CONFIG.PEER_PORT,
        path:   CONFIG.PEER_PATH,
        secure: CONFIG.PEER_SECURE,
        config: iceConfig(),
      });
      peer.on('open', () => {
        conn = peer.connect(roomCode.trim().toUpperCase(), { reliable: true });
        _setupConn();
        conn.on('open', resolve);
        conn.on('error', reject);
      });
      peer.on('error', reject);
    });
  }

  function _setupConn() {
    conn.on('open', () => {
      if (_onReady) _onReady();
    });
    conn.on('data', msg => {
      if (!msg) return;
      if (msg.type === 'move' && _onMove) {
        _onMove(msg.index);
      }
      // тип 'sync' — для пересинхронизации доски
      if (msg.type === 'sync' && _onMove) {
        _onMove(msg.index); // переиспользуем callback
      }
    });
    conn.on('close', () => { if (_onDisc) _onDisc(); });
    conn.on('error', () => { if (_onDisc) _onDisc(); });
  }

  // Отправить ход сопернику
  function sendMove(index) {
    if (conn && conn.open) {
      conn.send({ type: 'move', index });
    }
  }

  // Зарегистрировать callbacks
  function onRemoteMove(cb) { _onMove  = cb; }
  function onReady(cb)      { _onReady = cb; }
  function onDisconnect(cb) { _onDisc  = cb; }

  function disconnect() {
    if (conn)  { conn.close();  conn  = null; }
    if (peer)  { peer.destroy(); peer = null; }
    _onMove  = null;
    _onReady = null;
    _onDisc  = null;
  }

  // ---------- URL-fallback (correspondence / «игра по ссылке») -------------
  //
  // Состояние игры кодируется в location.hash.
  // Игрок делает ход → обновляет хэш → копирует ссылку → отправляет сопернику.
  // Не реал-тайм, но 100% работает без каких-либо внешних сервисов.

  /**
   * Закодировать состояние игры в строку для URL-hash.
   * state: { board: Array(9), current: 'X'|'O', mode, mySymbol }
   */
  function encodeStateToUrl(state) {
    const compact = {
      b: state.board.map(c => c === 'X' ? 1 : c === 'O' ? 2 : 0).join(''),
      c: state.current,
      m: state.mode === 'reverse' ? 'r' : 'c',
    };
    const json   = JSON.stringify(compact);
    const b64    = btoa(unescape(encodeURIComponent(json)));
    location.hash = '#game=' + b64;
    return location.href;
  }

  /**
   * Декодировать состояние из location.hash.
   * Возвращает { board, current, mode } или null.
   */
  function decodeStateFromUrl() {
    const hash = location.hash;
    if (!hash.startsWith('#game=')) return null;
    try {
      const b64     = hash.slice(6);
      const json    = decodeURIComponent(escape(atob(b64)));
      const compact = JSON.parse(json);
      const board   = compact.b.split('').map(c => c === '1' ? 'X' : c === '2' ? 'O' : null);
      return {
        board,
        current: compact.c,
        mode:    compact.m === 'r' ? 'reverse' : 'classic',
      };
    } catch (e) {
      return null;
    }
  }

  function clearUrlState() {
    history.replaceState(null, '', location.pathname + location.search);
  }

  return {
    createRoom, joinRoom, sendMove, onRemoteMove, onReady, onDisconnect, disconnect,
    encodeStateToUrl, decodeStateFromUrl, clearUrlState,
  };
})();
