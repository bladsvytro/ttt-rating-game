// Чистый движок правил. Без DOM, без сети — только логика поля.

const GAME = (() => {
  // Все возможные тройки
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8], // строки
    [0,3,6],[1,4,7],[2,5,8], // столбцы
    [0,4,8],[2,4,6],         // диагонали
  ];

  function createBoard() {
    return Array(9).fill(null);
  }

  function getLines() {
    return LINES;
  }

  // Вернуть символ, у которого есть тройка, или null
  function checkWinner(board) {
    for (const [a,b,c] of LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a]; // 'X' или 'O'
      }
    }
    return null;
  }

  // Вернуть линию-победу (индексы) или null
  function getWinLine(board) {
    for (const line of LINES) {
      const [a,b,c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return line;
      }
    }
    return null;
  }

  function isFull(board) {
    return board.every(c => c !== null);
  }

  function getEmptyCells(board) {
    return board.map((v,i) => v === null ? i : -1).filter(i => i !== -1);
  }

  /**
   * Основная функция результата партии.
   * mode: 'classic' | 'reverse'
   *
   * Классика:  у кого тройка → тот ПОБЕДИЛ (state:'win', winner: symbol)
   * Реверс:    у кого тройка → тот ПРОИГРАЛ (state:'lose', loser: symbol)
   *            Цель — вынудить СОПЕРНИКА собрать тройку.
   *
   * Возвращает:
   *   { state: 'playing' }
   *   { state: 'win',  winner: 'X'|'O', line: [i,j,k] }
   *   { state: 'lose', loser:  'X'|'O', line: [i,j,k] }   (только реверс)
   *   { state: 'draw' }
   */
  function getResult(board, mode) {
    const winner = checkWinner(board);
    if (winner) {
      const line = getWinLine(board);
      if (mode === 'classic') {
        return { state: 'win', winner, line };
      } else {
        // Реверс: собрал тройку = проиграл
        return { state: 'lose', loser: winner, line };
      }
    }
    if (isFull(board)) {
      return { state: 'draw' };
    }
    return { state: 'playing' };
  }

  // Применить ход. Возвращает НОВУЮ доску (immutable).
  function applyMove(board, index, symbol) {
    const next = [...board];
    next[index] = symbol;
    return next;
  }

  // Следующий символ
  function nextSymbol(sym) {
    return sym === 'X' ? 'O' : 'X';
  }

  return { createBoard, getLines, checkWinner, getWinLine, isFull, getEmptyCells, getResult, applyMove, nextSymbol };
})();
