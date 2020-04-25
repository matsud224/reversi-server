const SERVER_URI = "ws://" + window.document.location.host + '/';
const CELL_WIDTH = 32;
const BOARD_SIZE = 8;
const BLACK = 'black';
const WHITE = 'white';
const NONE  = 'none';

var board = undefined;
var animation_working = [];
var is_my_turn;
var my_color;
var is_playing = false;

function drawBoard() {
  let board_canvas = document.getElementById("board");
  let ctx = board_canvas.getContext("2d");

  ctx.strokeStyle = 'rgb(0,0,0)';
  ctx.fillStyle = 'rgb(0,255,0)';
  ctx.fillRect(0,0,CELL_WIDTH*BOARD_SIZE,CELL_WIDTH*BOARD_SIZE);
  for(let x=0; x<BOARD_SIZE; x++)
    for(let y=0; y<BOARD_SIZE; y++)
      ctx.strokeRect(CELL_WIDTH*x,CELL_WIDTH*y,CELL_WIDTH,CELL_WIDTH);

  return;
  if (board == undefined)
    return;

  for(let x=0; x<BOARD_SIZE; x++)
    for(let y=0; y<BOARD_SIZE; y++) {
      if (board[x][y] != "none") {
        ctx.beginPath();
        ctx.arc(CELL_WIDTH*x+CELL_WIDTH/2,CELL_WIDTH*y+CELL_WIDTH/2,CELL_WIDTH/2,0,360*Math.PI/180,false);
        ctx.fillStyle = board[x][y];
        ctx.fill();
        ctx.stroke();
      }
    }
}

function animationLoop(timestamp) {
  let board_canvas = document.getElementById("board");
  let ctx = board_canvas.getContext("2d");

  if (board != undefined) {
    for(const c of animation_working) {
      if (c.radius < CELL_WIDTH/2) {
        c.radius += 1;
        ctx.beginPath();
        ctx.arc(CELL_WIDTH*c.x+CELL_WIDTH/2,CELL_WIDTH*c.y+CELL_WIDTH/2,c.radius,0,360*Math.PI/180,false);
        ctx.fillStyle = board[c.x][c.y];
        ctx.fill();
        ctx.stroke();
      }
    }

    animation_working = animation_working.filter((e, i) => e.radius < CELL_WIDTH/2);
  }

  window.requestAnimationFrame((ts) => animationLoop(ts));
}

function boardClicked(e, sock) {
  let board_canvas = document.getElementById("board");
  let x = e.clientX - board_canvas.offsetLeft;
  let y = e.clientY - board_canvas.offsetTop;
  let bx = Math.floor(x / CELL_WIDTH);
  let by = Math.floor(y / CELL_WIDTH);
  if (bx < 0 || by < 0 || bx >= BOARD_SIZE || by >= BOARD_SIZE)
    return;

  let msg = {
    type : "put",
    color : my_color,
    x : bx,
    y : by,
  };
  sock.send(JSON.stringify(msg));
}

function hideAllBlock() {
  document.getElementById("nameinput-block").style.display = "none";
  document.getElementById("board-block").style.display = "none";
}

function startNameInput() {
  hideAllBlock();
  document.getElementById("nameinput-block").style.display = "block";
  noticeStatus("Input your name.");
}

function updateTurn() {
  if (is_my_turn) {
    noticeStatus("Your turn (" + my_color + ")");
  } else {
    noticeStatus("Opponent's turn...");
  }
}

function newBoard() {
  let board = new Array(BOARD_SIZE);
  for(let i=0; i<BOARD_SIZE; i++)
    board[i] = new Array(BOARD_SIZE).fill(NONE);
  return board;
}

function startPlay() {
  hideAllBlock();
  document.getElementById("board-block").style.display = "block";
  is_playing = true;
  board = newBoard();
  drawBoard();
}

function noticeStatus(msg) {
  document.getElementById("play-status").innerText = msg;
}

function noticeAndReset(msg) {
  board = undefined;
  startNameInput();
  noticeStatus(msg);
  is_playing = false;
}

function startButtonClicked() {
  player_name = document.getElementById("player-name").value;
  if (player_name == '')
    player_name = "anonymous";
  noticeStatus("Finding player...");
  hideAllBlock();

  let sock = new WebSocket(SERVER_URI);

  document.getElementById("board").addEventListener('click', (e) => boardClicked(e, sock), false);

  sock.onerror = function(e) {
    noticeAndReset("Server error");
  };

  sock.onclose = function(e) {
    if (is_playing)
      noticeAndReset("Server error");
  };

  sock.onopen = function(e) {
    let msg = {
      type : "join",
      name : player_name,
    };
    sock.send(JSON.stringify(msg));
  };

  sock.onmessage = function(e) {
    let msg = JSON.parse(e.data);

    switch(msg.type) {
      case "rejected":
        sock.close();
        noticeAndReset("Please wait and try again.");
        break;

      case "closed":
        sock.close();
        noticeAndReset("Connection closed:(");
        break;

      case "matched":
        document.getElementById("opponent-name").innerText = "Battle with " + msg.name;
        if (msg.color == "black") {
          is_my_turn = true;
          my_color = "black";
        } else {
          is_my_turn = false;
          my_color = "white";
        }
        startPlay();
        break;

      case "updated":
        if (board != undefined) {
          for(let x=0; x<BOARD_SIZE; x++)
            for(let y=0; y<BOARD_SIZE; y++)
              if (msg.board[x][y] != board[x][y]) {
                animation_working.push({ radius: 0, x: x, y: y });
              }
        }

        board = msg.board;
        is_my_turn = (msg.turn  == my_color);
        updateTurn();
        break;

      case "gameset":
        sock.close();
        if (msg.black == msg.white)
          won = 'draw';
        else if (msg.black > msg.white)
          won = BLACK;
        else
          won = WHITE;

        ratio = '(' + msg.black + ':' + msg.white + ')';

        if (won == 'draw')
          noticeAndReset("Game set. Draw.");
        else if (won == my_color)
          noticeAndReset("Game set. You win! " + ratio);
        else
          noticeAndReset("Game set. You lose. " + ratio);

        break;
    }
  };
}

window.onload = function() {
  let board_canvas = document.getElementById("board");
  board_canvas.width  = CELL_WIDTH * BOARD_SIZE;
  board_canvas.height = CELL_WIDTH * BOARD_SIZE;
  window.requestAnimationFrame((ts) => animationLoop(ts));

  document.getElementById("start-button").addEventListener('click', startButtonClicked, false);
  startNameInput();
};


