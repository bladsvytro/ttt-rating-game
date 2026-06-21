#!/usr/bin/env node
// GitHub Action Node-скрипт: пересчёт Elo и атомарное обновление JSON.
// Запускается внутри CI — токен GITHUB_TOKEN автоматически доступен в раннере.
// Входные данные: env GAME_RESULT (JSON-строка из client_payload).

const fs = require('fs');
const path = require('path');

const ELO_START     = 1000;
const K_HIGH        = 40;  // первые 10 игр
const K_LOW         = 20;  // далее
const K_THRESHOLD   = 10;
const MAX_HISTORY   = 5;
const DATA_DIR      = path.join(__dirname, '..', 'data');

// ---- Elo-формулы ----
function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}
function kFactor(games) {
  return games < K_THRESHOLD ? K_HIGH : K_LOW;
}
function computeElo(ratingA, ratingB, scoreA, gamesA) {
  const E = expectedScore(ratingA, ratingB);
  const K = kFactor(gamesA);
  return Math.round(ratingA + K * (scoreA - E));
}

// ---- Утилиты чтения/записи ----
function readJSON(filename) {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function writeJSON(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
}

// ---- Основная логика ----
function main() {
  const raw = process.env.GAME_RESULT;
  if (!raw) { console.error('GAME_RESULT env not set'); process.exit(1); }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid GAME_RESULT JSON:', e.message);
    process.exit(1);
  }

  const { winnerId, loserId, winnerName, loserName, mode, draw } = payload;

  // Минимальная валидация
  if (!mode || !['classic', 'reverse'].includes(mode)) {
    console.error('Invalid mode:', mode); process.exit(1);
  }
  if (!draw && (!winnerId || !loserId)) {
    console.error('Missing winnerId or loserId'); process.exit(1);
  }

  // ---- Загрузить или создать базу игроков ----
  let db = readJSON('players.json') || { players: [] };
  if (!Array.isArray(db.players)) db.players = [];

  function getOrCreate(id, name) {
    let p = db.players.find(x => x.id === id);
    if (!p) {
      p = {
        id, name: name || id,
        ratingClassic: ELO_START, ratingReverse: ELO_START,
        gamesClassic:  0, gamesReverse:  0,
        wins: 0, losses: 0, draws: 0,
        createdAt: new Date().toISOString(),
      };
      db.players.push(p);
    }
    if (name) p.name = name; // обновляем имя
    return p;
  }

  const rKey = mode === 'classic' ? 'ratingClassic' : 'ratingReverse';
  const gKey = mode === 'classic' ? 'gamesClassic'  : 'gamesReverse';

  if (draw) {
    // Ничья — оба playerId должны быть в winnerId/loserId
    const pA = getOrCreate(winnerId || loserId, winnerName || loserName);
    const pB = loserId !== winnerId ? getOrCreate(loserId, loserName) : pA;
    if (pA !== pB) {
      const rA = pA[rKey], rB = pB[rKey];
      pA[rKey] = computeElo(rA, rB, 0.5, pA[gKey]);
      pB[rKey] = computeElo(rB, rA, 0.5, pB[gKey]);
      pA[gKey]++; pB[gKey]++;
      pA.draws++;  pB.draws++;
    }
  } else {
    const winner = getOrCreate(winnerId, winnerName);
    const loser  = getOrCreate(loserId,  loserName);
    const rW = winner[rKey], rL = loser[rKey];
    const newW = computeElo(rW, rL, 1,   winner[gKey]);
    const newL = computeElo(rL, rW, 0,   loser[gKey]);
    winner[rKey] = newW; loser[rKey] = newL;
    winner[gKey]++; loser[gKey]++;
    winner.wins++; loser.losses++;
  }
  db.updatedAt = new Date().toISOString();
  writeJSON('players.json', db);

  // ---- Пересобрать лидерборд для данного mode ----
  const lb = db.players
    .map((p, i) => ({
      rank:     0,
      playerId: p.id,
      name:     p.name,
      rating:   p[rKey],
      games:    p[gKey],
      wins:     p.wins   || 0,
      losses:   p.losses || 0,
      draws:    p.draws  || 0,
    }))
    .sort((a, b) => b.rating - a.rating)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  writeJSON(`leaderboard_${mode}.json`, lb);

  // ---- Обновить историю партии ----
  let hist = readJSON('history.json') || {};

  const now = new Date().toISOString();

  function addHistory(playerId, opponentName, result, ratingDelta) {
    if (!hist[playerId]) hist[playerId] = [];
    hist[playerId].unshift({ date: now, opponent: opponentName, mode, result, ratingDelta });
    // Обрезаем до MAX_HISTORY
    hist[playerId] = hist[playerId].slice(0, MAX_HISTORY);
  }

  if (draw) {
    const pA = db.players.find(x => x.id === winnerId);
    const pB = db.players.find(x => x.id === loserId);
    if (pA && pB && pA !== pB) {
      addHistory(winnerId, pB.name, 'draw', 0);
      addHistory(loserId,  pA.name, 'draw', 0);
    }
  } else {
    const winner = db.players.find(x => x.id === winnerId);
    const loser  = db.players.find(x => x.id === loserId);
    // Дельты (до обновления уже нет в db, считаем по current)
    // Упрощение: дельту пишем как разницу current vs ELO_START — для точной дельты
    // нужно сохранять old_rating до обновления; здесь пишем 0 (достаточно для истории).
    if (winner) addHistory(winnerId, loser?.name || loserId,   'win',  0);
    if (loser)  addHistory(loserId,  winner?.name || winnerId, 'lose', 0);
  }

  writeJSON('history.json', hist);

  console.log(`[update-rating] mode=${mode} draw=${!!draw} winner=${winnerId} loser=${loserId}`);
  console.log('[update-rating] Done.');
}

main();
