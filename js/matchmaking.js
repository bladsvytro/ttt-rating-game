// Подбор соперников по рейтингу.
//
// ВАРИАНТ A (рекомендован): Firebase Realtime Database.
//   Атомарные транзакции — нет гонок, мгновенная очередь.
//   Требует заполнить CONFIG.FIREBASE.
//
// ВАРИАНТ B (только GitHub, медленный): очередь в data/matchmaking_queue.json
//   через Contents API + оптимистичная блокировка по sha.
//   Скорость — секунды-минуты. Подходит для correspondence-режима.

const MATCHMAKING = (() => {
  let _firebaseApp = null;
  let _db          = null;
  let _queueRef    = null;
  let _myRef       = null;
  let _watcher     = null;
  let _resolveMatch = null;

  // Инициализация Firebase (вызывается при первом обращении)
  function _initFirebase() {
    if (_db) return true;
    if (!CONFIG.FIREBASE.databaseURL) return false;

    // Firebase SDK загружается через CDN (см. index.html)
    if (typeof firebase === 'undefined') {
      console.warn('[matchmaking] Firebase SDK не загружен. Добавьте CDN в index.html.');
      return false;
    }
    if (!_firebaseApp) {
      _firebaseApp = firebase.initializeApp(CONFIG.FIREBASE, 'matchmaking');
    }
    _db = firebase.database(_firebaseApp);
    return true;
  }

  /**
   * ВАРИАНТ A: Firebase.
   * Встать в очередь и найти соперника с близким рейтингом.
   * Возвращает Promise<{opponentId, opponentName, opponentRating, roomCode}>.
   */
  function findMatchFirebase(profile, mode) {
    return new Promise((resolve, reject) => {
      if (!_initFirebase()) return reject(new Error('Firebase не настроен'));

      const ratingKey = mode === 'classic' ? 'ratingClassic' : 'ratingReverse';
      const myRating  = profile[ratingKey];

      _queueRef = _db.ref(`queue/${mode}`);
      _myRef    = _queueRef.child(profile.id);

      // Встаём в очередь; onDisconnect авто-удаляет запись при закрытии вкладки
      const entry = {
        id:      profile.id,
        name:    profile.name,
        rating:  myRating,
        mode,
        ts:      firebase.database.ServerValue.TIMESTAMP,
        status:  'waiting',
      };
      _myRef.set(entry);
      _myRef.onDisconnect().remove();

      let window_size = 50;
      const MAX_WINDOW = 500;
      const EXPAND_MS  = 5000;

      _resolveMatch = resolve;

      function search() {
        _queueRef.once('value', snapshot => {
          const all = [];
          snapshot.forEach(child => {
            const v = child.val();
            if (v && v.id !== profile.id && v.status === 'waiting') all.push(v);
          });

          // Фильтруем по рейтинговому окну
          const candidates = all.filter(v => Math.abs(v.rating - myRating) <= window_size);

          if (candidates.length > 0) {
            // Берём ближайшего по рейтингу
            candidates.sort((a,b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating));
            const opp = candidates[0];

            // Атомарная транзакция: захватываем соперника
            _queueRef.child(opp.id).transaction(current => {
              if (!current || current.status !== 'waiting') return; // отказ → повтор
              return { ...current, status: 'matched', matchedWith: profile.id };
            }, (err, committed, snap) => {
              if (!committed) {
                // Кто-то другой уже захватил — ищем снова
                setTimeout(search, 1000);
                return;
              }
              // Успех: помечаем себя, создаём код комнаты
              const roomCode = Math.random().toString(36).slice(2,8).toUpperCase();
              _myRef.update({ status: 'matched', matchedWith: opp.id, roomCode });
              _cleanup();
              resolve({ opponentId: opp.id, opponentName: opp.name, opponentRating: opp.rating, roomCode });
            });
          } else {
            // Расширяем окно и повторяем через EXPAND_MS
            if (window_size < MAX_WINDOW) window_size += 50;
            setTimeout(search, EXPAND_MS);
          }
        });
      }

      // Слушаем, не нашёл ли нас кто-то другой
      _myRef.on('value', snap => {
        const v = snap.val();
        if (v && v.status === 'matched' && v.matchedWith !== undefined) {
          // Нас захватили
          _cleanup();
          // Сообщаем о матче
          _queueRef.child(v.matchedWith).once('value', s => {
            const opp = s.val();
            if (_resolveMatch) {
              _resolveMatch({ opponentId: v.matchedWith, opponentName: opp?.name, opponentRating: opp?.rating, roomCode: v.roomCode });
              _resolveMatch = null;
            }
          });
        }
      });

      search();
    });
  }

  function _cleanup() {
    if (_myRef)    { _myRef.off(); _myRef.onDisconnect().cancel(); _myRef = null; }
    if (_watcher)  { _watcher(); _watcher = null; }
  }

  function leaveQueue() {
    if (_myRef)  _myRef.remove();
    _cleanup();
    _resolveMatch = null;
  }

  // -------------------------------------------------------------------------
  // ВАРИАНТ B: JSON в репо (медленный, correspondence-скорость)
  // -------------------------------------------------------------------------

  /**
   * Прочитать очередь из репозитория.
   * Возвращает { data, sha } для оптимистичной блокировки.
   */
  async function _readQueueB() {
    const url = `https://api.github.com/repos/${CONFIG.OWNER}/${CONFIG.REPO}/contents/data/matchmaking_queue.json`;
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (CONFIG.GH_TOKEN) headers['Authorization'] = `Bearer ${CONFIG.GH_TOKEN}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`readQueue: ${res.status}`);
    const meta = await res.json();
    const data = JSON.parse(atob(meta.content.replace(/\n/g,'')));
    return { data, sha: meta.sha };
  }

  async function _writeQueueB(data, sha) {
    const url = `https://api.github.com/repos/${CONFIG.OWNER}/${CONFIG.REPO}/contents/data/matchmaking_queue.json`;
    const headers = {
      'Accept':               'application/vnd.github+json',
      'Content-Type':         'application/json',
    };
    if (CONFIG.GH_TOKEN) headers['Authorization'] = `Bearer ${CONFIG.GH_TOKEN}`;
    const res = await fetch(url, {
      method:  'PUT',
      headers,
      body: JSON.stringify({
        message: 'chore: update matchmaking queue',
        content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
        sha,
      }),
    });
    if (res.status === 409) throw Object.assign(new Error('conflict'), { isConflict: true });
    if (!res.ok) throw new Error(`writeQueue: ${res.status}`);
  }

  /**
   * Встать в очередь (вариант B).
   * Несколько попыток при конфликтах (другой игрок писал одновременно).
   */
  async function enqueuePlayerB(profile, mode) {
    const ratingKey = mode === 'classic' ? 'ratingClassic' : 'ratingReverse';
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, sha } = await _readQueueB();
      if (!data.queue) data.queue = [];
      // Убираем устаревшие записи (старше 10 мин)
      const now = Date.now();
      data.queue = data.queue.filter(e => now - e.ts < 600_000);
      // Убираем себя (перезаписываем)
      data.queue = data.queue.filter(e => e.id !== profile.id);
      data.queue.push({ id: profile.id, name: profile.name, rating: profile[ratingKey], mode, ts: now, status: 'waiting' });
      try {
        await _writeQueueB(data, sha);
        return;
      } catch (e) {
        if (e.isConflict) { await _sleep(300 + Math.random()*200); continue; }
        throw e;
      }
    }
    throw new Error('enqueue: max retries exceeded');
  }

  /**
   * Найти соперника и захватить его (вариант B, оптимистичная блокировка).
   * Возвращает запись соперника или null (нет подходящих).
   */
  async function findOpponentB(profile, mode, windowSize = 100) {
    const ratingKey = mode === 'classic' ? 'ratingClassic' : 'ratingReverse';
    const myRating  = profile[ratingKey];

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, sha } = await _readQueueB();
      if (!data.queue) return null;
      const now = Date.now();
      data.queue = data.queue.filter(e => now - e.ts < 600_000);

      const candidates = data.queue.filter(e =>
        e.id !== profile.id && e.mode === mode && e.status === 'waiting' &&
        Math.abs(e.rating - myRating) <= windowSize
      );
      if (candidates.length === 0) return null;

      candidates.sort((a,b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating));
      const opp = candidates[0];

      // Двухфазный захват: ставим lockToken
      const lockToken = `${profile.id}_${Date.now()}`;
      opp.status = 'matched';
      opp.matchedWith = profile.id;
      opp.lockToken   = lockToken;

      try {
        await _writeQueueB(data, sha);
        return opp;
      } catch (e) {
        if (e.isConflict) { await _sleep(300 + Math.random()*300); continue; }
        throw e;
      }
    }
    return null;
  }

  async function leaveQueueB(profileId) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, sha } = await _readQueueB();
      data.queue = (data.queue || []).filter(e => e.id !== profileId);
      try { await _writeQueueB(data, sha); return; }
      catch (e) { if (e.isConflict) { await _sleep(300); continue; } throw e; }
    }
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  return {
    // Firebase (A)
    findMatchFirebase, leaveQueue,
    // JSON/repo (B)
    enqueuePlayerB, findOpponentB, leaveQueueB,
  };
})();
