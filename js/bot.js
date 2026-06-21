// ИИ-противник. Зависит только от GAME.

const BOT = (() => {

  /**
   * Терминальная оценка позиции для minimax.
   *
   * Классика:
   *   botSymbol выиграл  → +(10 - depth)  (чем быстрее, тем лучше)
   *   opponent  выиграл  → -(10 - depth)
   *
   * Реверс (мизер):
   *   botSymbol собрал тройку → ПРОИГРАЛ → -(10 - depth)
   *   opponent  собрал тройку → ПРОИГРАЛ → +(10 - depth) (бот выиграл!)
   *
   * Ключевой момент: в реверсе «плохо» собрать СВОЮ тройку и «хорошо»
   * вынудить соперника собрать его тройку.
   */
  function evaluate(board, mode, botSymbol, depth) {
    const winner = GAME.checkWinner(board);
    if (!winner) return 0;

    const opponentSymbol = GAME.nextSymbol(botSymbol);

    if (mode === 'classic') {
      return winner === botSymbol ? (10 - depth) : -(10 - depth);
    } else {
      // Реверс: тот, у кого тройка, — ПРОИГРАЛ
      return winner === botSymbol ? -(10 - depth) : (10 - depth);
    }
  }

  /**
   * Minimax с alpha-beta pruning.
   * currentSymbol — чей сейчас ход (меняется при каждом рекурсивном вызове).
   * isMaximizing  — максимизируем мы (бот) или минимизируем (соперник).
   */
  function minimax(board, mode, currentSymbol, botSymbol, depth, alpha, beta, isMaximizing) {
    const score = evaluate(board, mode, botSymbol, depth);
    if (score !== 0) return score;
    if (GAME.isFull(board)) return 0;

    const empty = GAME.getEmptyCells(board);

    if (isMaximizing) {
      let best = -Infinity;
      for (const idx of empty) {
        const next = GAME.applyMove(board, idx, currentSymbol);
        const val  = minimax(next, mode, GAME.nextSymbol(currentSymbol), botSymbol, depth + 1, alpha, beta, false);
        best  = Math.max(best, val);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const idx of empty) {
        const next = GAME.applyMove(board, idx, currentSymbol);
        const val  = minimax(next, mode, GAME.nextSymbol(currentSymbol), botSymbol, depth + 1, alpha, beta, true);
        best = Math.min(best, val);
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  // Найти лучший ход по minimax
  function bestMove(board, mode, botSymbol) {
    const empty = GAME.getEmptyCells(board);
    if (empty.length === 0) return -1;

    let bestVal  = -Infinity;
    let bestIdx  = empty[0];
    const opponentSymbol = GAME.nextSymbol(botSymbol);

    for (const idx of empty) {
      const next = GAME.applyMove(board, idx, botSymbol);
      // После хода бота ход переходит сопернику → isMaximizing = false
      const val  = minimax(next, mode, opponentSymbol, botSymbol, 0, -Infinity, Infinity, false);
      if (val > bestVal) {
        bestVal = val;
        bestIdx = idx;
      }
    }
    return bestIdx;
  }

  // Случайный ход из доступных
  function randomMove(board) {
    const empty = GAME.getEmptyCells(board);
    return empty[Math.floor(Math.random() * empty.length)];
  }

  /**
   * Основная функция выбора хода бота.
   * difficulty: 'easy' | 'medium' | 'hard'
   */
  function botMove(board, mode, difficulty, botSymbol) {
    const empty = GAME.getEmptyCells(board);
    if (empty.length === 0) return -1;

    switch (difficulty) {
      case 'easy':
        // 20% шанс оптимального хода, 80% — случайный
        return Math.random() < 0.2 ? bestMove(board, mode, botSymbol) : randomMove(board);

      case 'medium':
        // Minimax с ограниченной глубиной (2), или случайный с вероятностью 30%
        if (Math.random() < 0.3) return randomMove(board);
        return bestMoveDepthLimited(board, mode, botSymbol, 2);

      case 'hard':
      default:
        return bestMove(board, mode, botSymbol);
    }
  }

  // Minimax с ограничением глубины
  function bestMoveDepthLimited(board, mode, botSymbol, maxDepth) {
    const empty = GAME.getEmptyCells(board);
    if (empty.length === 0) return -1;

    let bestVal = -Infinity;
    let bestIdx = empty[0];
    const opponentSymbol = GAME.nextSymbol(botSymbol);

    for (const idx of empty) {
      const next = GAME.applyMove(board, idx, botSymbol);
      const val  = minimaxLimited(next, mode, opponentSymbol, botSymbol, 0, maxDepth, -Infinity, Infinity, false);
      if (val > bestVal) {
        bestVal = val;
        bestIdx = idx;
      }
    }
    return bestIdx;
  }

  function minimaxLimited(board, mode, currentSymbol, botSymbol, depth, maxDepth, alpha, beta, isMaximizing) {
    const score = evaluate(board, mode, botSymbol, depth);
    if (score !== 0) return score;
    if (GAME.isFull(board) || depth >= maxDepth) return 0;

    const empty = GAME.getEmptyCells(board);

    if (isMaximizing) {
      let best = -Infinity;
      for (const idx of empty) {
        const next = GAME.applyMove(board, idx, currentSymbol);
        const val  = minimaxLimited(next, mode, GAME.nextSymbol(currentSymbol), botSymbol, depth+1, maxDepth, alpha, beta, false);
        best  = Math.max(best, val);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const idx of empty) {
        const next = GAME.applyMove(board, idx, currentSymbol);
        const val  = minimaxLimited(next, mode, GAME.nextSymbol(currentSymbol), botSymbol, depth+1, maxDepth, alpha, beta, true);
        best = Math.min(best, val);
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  /**
   * Вернуть индексы клеток, куда player НЕ должен ходить в режиме реверс
   * (ход туда создаст тройку → проигрыш).
   * Для классики возвращает пустой массив.
   */
  function getDangerousCells(board, player, mode) {
    if (mode === 'classic') return [];
    const result = [];
    for (const idx of GAME.getEmptyCells(board)) {
      const next = GAME.applyMove(board, idx, player);
      if (GAME.checkWinner(next) === player) {
        result.push(idx);
      }
    }
    return result;
  }

  return { botMove, getDangerousCells, bestMove, randomMove };
})();
