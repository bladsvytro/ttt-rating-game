// Конфигурация проекта. Замените OWNER и REPO на свои значения.
// ⚠️  PAT в клиентском JS виден всем пользователям (исходники открыты).
//     Для продакшна используйте прокси (Cloudflare Worker) — см. README.

const CONFIG = {
  OWNER: 'bladsvytro',
  REPO:  'ttt-rating-game',

  // Cloudflare Worker — прокси для GitHub API.
  // PAT хранится зашифрованным в Worker-секрете, в браузер не попадает.
  PROXY_URL: 'https://ttt-game-proxy.blads-vytro.workers.dev',

  // GH_TOKEN не нужен в браузере — Worker держит его на стороне Cloudflare.
  GH_TOKEN: '',

  // URL для чтения актуальных JSON из репо (обновляется Action после партий).
  RAW_BASE: 'https://raw.githubusercontent.com/bladsvytro/ttt-rating-game/main',

  // Ключ localStorage для профиля игрока
  STORAGE_KEY: 'ttt_profile',

  // Параметры Elo
  ELO_START:   1000,
  ELO_K_HIGH:  40,   // первые 10 игр
  ELO_K_LOW:   20,   // далее
  ELO_K_THRESHOLD: 10,

  // Задержка хода бота (мс) — имитация раздумий
  BOT_DELAY_MS: 400,

  // Firebase (для онлайн-подбора по рейтингу). Оставьте пустым, если не нужен.
  FIREBASE: {
    apiKey:            '',
    authDomain:        '',
    databaseURL:       '',
    projectId:         '',
    storageBucket:     '',
    messagingSenderId: '',
    appId:             '',
  },

  // PeerJS — публичный сигналинг-сервер (можно оставить дефолтный peerjs.com)
  PEER_HOST: '0.peerjs.com',
  PEER_PORT: 443,
  PEER_PATH: '/',
  PEER_SECURE: true,

  // STUN + бесплатный TURN (Open Relay / Metered)
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Раскомментируйте и заполните, если нужен TURN (симметричный NAT):
    // { urls: 'turn:openrelay.metered.ca:80',   username: 'openrelayproject', credential: 'openrelayproject' },
    // { urls: 'turn:openrelay.metered.ca:443',  username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};
