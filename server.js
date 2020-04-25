const BOARD_SIZE = 8;
const BLACK = 'black';
const WHITE = 'white';
const NONE  = 'none';

var connections = new Map();
var waiting = [];

function newBoard() {
  let board = new Array(BOARD_SIZE);
  for(let i=0; i<BOARD_SIZE; i++)
    board[i] = new Array(BOARD_SIZE).fill(NONE);

  board[3][3] = WHITE;
  board[4][4] = WHITE;
  board[4][3] = BLACK;
  board[3][4] = BLACK;

  return board;
}

function sendCloseMsg(conn) {
  let msg = {
    type : 'closed',
  };
  conn.send(JSON.stringify(msg));
}

function sendMatchedMsg(conn, name, color) {
  let msg = {
    type : 'matched',
    name : name,
    color : color,
  };
  conn.send(JSON.stringify(msg));
}

function sendUpdateMsg(battle) {
  let msg = {
    type : 'updated',
    board : battle.board,
    turn : battle.turn,
  };
  battle.blackConn.send(JSON.stringify(msg));
  battle.whiteConn.send(JSON.stringify(msg));
}

function sendGamesetMsg(battle) {
  let cellCount = countCell(battle.board);
  let msg = {
    type : 'gameset',
    black : cellCount[BLACK],
    white : cellCount[WHITE],
  };
  battle.blackConn.send(JSON.stringify(msg));
  battle.whiteConn.send(JSON.stringify(msg));
  battle.blackConn.close();
  battle.whiteConn.close();
}

function reverseColor(color) {
  if (color == BLACK)
    return WHITE;
  else
    return BLACK;
}

function isValidPosition(x, y) {
  return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
}

function countCell(board) {
  let count = {};
  count[BLACK] = 0;
  count[WHITE] = 0;
  count[NONE]  = 0;

  for(let x = 0; x < BOARD_SIZE; x++)
    for(let y = 0; y < BOARD_SIZE; y++)
      count[board[x][y]] += 1;

  return count;
}

function checkReversibleOneDirection(board, putcolor, xinit, yinit, xupd, yupd) {
  let may_reversed = 0;
  let x = xupd(xinit);
  let y = yupd(yinit);
  let revcolor = reverseColor(putcolor);

  for(; isValidPosition(x, y); x=xupd(x), y=yupd(y)) {
    switch (board[x][y]) {
      case putcolor:
        return may_reversed;
      case revcolor:
        may_reversed += 1;
        break;
      default:
        return 0;
    }
  }
  return 0;
}

function reverseOneDirection(board, putcolor, xinit, yinit, xupd, yupd) {
  let count = checkReversibleOneDirection(board, putcolor, xinit, yinit, xupd, yupd);
  let x = xupd(xinit);
  let y = yupd(yinit);

  for(let i=0; i<count; x=xupd(x), y=yupd(y), i++) {
    board[x][y] = putcolor;
  }

  return count;
}

function applyToAllDirections(board, putcolor, x, y, f, reducer) {
  let inc = function(n) { return n + 1; };
  let dec = function(n) { return n - 1; };
  let id = function(n) { return n; };
  let results = [
    f(board, putcolor, x, y, dec, id),
    f(board, putcolor, x, y, inc, id),
    f(board, putcolor, x, y, id, dec),
    f(board, putcolor, x, y, id, inc),
    f(board, putcolor, x, y, dec, dec),
    f(board, putcolor, x, y, dec, inc),
    f(board, putcolor, x, y, inc, dec),
    f(board, putcolor, x, y, inc, inc)
  ];
  return results.reduce(reducer);
}

function putToBoard(board, color, x, y) {
  if (!isValidPosition(x, y) || board[x][y] != NONE)
    return false;

  let add = (x, y) => x + y;
  if (applyToAllDirections(board, color, x, y, reverseOneDirection, add) == 0) {
    return false;
  } else {
    board[x][y] = color;
    return true;
  }
}

function canPutToBoard(board, color) {
  for(let x = 0; x < BOARD_SIZE; x++)
    for(let y = 0; y < BOARD_SIZE; y++)
      if (board[x][y] == NONE) {
        let add = (x, y) => x + y;
        if (applyToAllDirections(board, color, x, y, checkReversibleOneDirection, add) > 0)
          return true;
      }

  return false;
}

function processPutMsg(conn, color, x, y) {
  if (typeof color != 'string' || !isValidPosition(x, y))
    return;

  let battle = connections.get(conn);

  if (battle == undefined)
    return;

  if (color != battle.turn)
    return;

  if (!putToBoard(battle.board, color, x, y)) {
    return;
  }
  battle.turn = reverseColor(battle.turn);

  if (!canPutToBoard(battle.board, battle.turn)) {
    battle.turn = reverseColor(battle.turn);
    if (!canPutToBoard(battle.board, battle.turn)) {
      sendGamesetMsg(battle);
      return;
    }
  }

  sendUpdateMsg(battle);
}

function processJoinMsg(conn, rawname) {
  let name = rawname.slice(0, 32);
  if (typeof name != 'string')
    return;

  console.log('joined: ' + name);

  if (waiting.length > 0) {
    let another = waiting.shift();
    let battle = {
      blackConn: another.conn,
      whiteConn: conn,
      board: newBoard(),
      turn: BLACK,
    };
    connections.set(conn, battle);
    connections.set(another.conn, battle);

    sendMatchedMsg(battle.blackConn, name, BLACK);
    sendMatchedMsg(battle.whiteConn, another.name, WHITE);
    sendUpdateMsg(battle);
  } else {
    waiting.push({ conn: conn, name: name });
  }
}


var WebSocketServer = require('ws').Server
    , http = require('http')
    , express = require('express')
    , app = express();

app.use(express.static(__dirname + '/'));
var server = http.createServer(app);
var wss = new WebSocketServer({server:server});

wss.on('connection', function (conn) {
  conn.on('close', function () {
    let battle = connections.get(conn);
    if (battle == undefined)
      return;

    connections.delete(conn);

    let delConn = (battle.blackConn == conn) ? battle.whiteConn : battle.blackConn;
    connections.delete(delConn);
    sendCloseMsg(delConn);
    delConn.close();
  });

  conn.on('message', function (rawmsg) {
    let msg = JSON.parse(rawmsg);

    switch (msg.type) {
      case 'join':
        processJoinMsg(conn, msg.name);
        break;
      case 'put':
        processPutMsg(conn, msg.color, msg.x, msg.y);
        break;
    }
  });
});

server.listen(80);
