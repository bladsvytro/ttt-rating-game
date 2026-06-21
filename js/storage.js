// Отправка результатов в GitHub и чтение JSON из репо.
// ⚠️  PAT в клиентском JS виден всем. Используйте PROXY_URL для продакшна.

const STORAGE = (() => {

  /**
   * Отправить результат партии в GitHub через repository_dispatch.
   * Триггерит Action, который обновляет JSON в репо.
   *
   * payload: { winnerId, loserId, mode, draw,
   *            winnerName, loserName,
   *            winnerRating, loserRating }   ← для двойной проверки в Action
   */
  async function submitResult(payload) {
    // Вариант A: через прокси (рекомендован — токен на сервере)
    if (CONFIG.PROXY_URL) {
      const res = await fetch(CONFIG.PROXY_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
      return;
    }

    // Вариант B: напрямую через PAT (демо; токен виден в исходниках)
    if (!CONFIG.GH_TOKEN) {
      console.warn('[storage] GH_TOKEN не задан — результат не будет сохранён в репо.');
      return;
    }
    const res = await fetch(
      `https://api.github.com/repos/${CONFIG.OWNER}/${CONFIG.REPO}/dispatches`,
      {
        method:  'POST',
        headers: {
          'Accept':               'application/vnd.github+json',
          'Authorization':        `Bearer ${CONFIG.GH_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type':         'application/json',
        },
        body: JSON.stringify({
          event_type:     'game-result',
          client_payload: payload,
        }),
      }
    );
    // 204 No Content — успех
    if (!res.ok && res.status !== 204) {
      throw new Error(`GitHub API error: ${res.status}`);
    }
  }

  /**
   * Прочитать JSON-файл из репозитория.
   * path: например 'data/leaderboard_classic.json'
   * Добавляем timestamp для обхода кэша CDN.
   */
  async function readJSON(path) {
    const url = `${CONFIG.RAW_BASE}/${path}?t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`readJSON failed: ${res.status} ${url}`);
    return res.json();
  }

  // ---------- localStorage: профиль игрока ----------------------------------

  function loadProfile() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveProfile(profile) {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(profile));
  }

  function generateId(name) {
    const slug    = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 12);
    const suffix  = Math.random().toString(36).slice(2, 6);
    return `${slug}_${suffix}`;
  }

  /**
   * Загрузить или создать профиль.
   * Если профиля нет → создать с дефолтными значениями и сохранить.
   */
  function getOrCreateProfile(defaultName) {
    let profile = loadProfile();
    if (!profile) {
      profile = {
        id:            generateId(defaultName || 'player'),
        name:          defaultName || 'Игрок',
        ratingClassic: CONFIG.ELO_START,
        ratingReverse: CONFIG.ELO_START,
        gamesClassic:  0,
        gamesReverse:  0,
        createdAt:     new Date().toISOString(),
        lastSeen:      new Date().toISOString(),
      };
      saveProfile(profile);
    }
    return profile;
  }

  return { submitResult, readJSON, loadProfile, saveProfile, getOrCreateProfile, generateId };
})();
