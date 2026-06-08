let gameId = null;
let pollTimer = null;
let socket = null;
let submitted = false;

let playMode = "solo";
let onlineMode = "normal";
let target = 200;
let duration = 30;
let rounds = [];
let problemStates = [];
let activeProblem = 0;
let isHost = false;
let lastSoloSettings = null;
let retryAction = null;

const screens = [
  "titleScreen", "soloSettingsScreen", "onlineSelectScreen", "matchScreen",
  "friendPasswordScreen", "friendHostRulesScreen", "friendReviewScreen",
  "readyScreen", "gameScreen", "resultScreen",
];

function $(id) { return document.getElementById(id); }

function showScreen(id) {
  screens.forEach((s) => $(s).classList.toggle("hidden", s !== id));
}

function showTitle() {
  stopAll();
  showScreen("titleScreen");
}

function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  gameId = null;
}

function stopSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}

function stopAll() {
  stopPoll();
  stopSocket();
  submitted = false;
}

function rulesText(rules) {
  return `問題数: ${rules.problems}\n制限時間: ${rules.duration}秒\n目標値: ${rules.target}`;
}

function initProblemStates() {
  problemStates = rounds.map(() => ({
    expression: "",
    chosenCount: 0,
    usedIdx: [],
  }));
  activeProblem = 0;
}

function renderProblems() {
  const box = $("problemsContainer");
  box.innerHTML = "";
  rounds.forEach((nums, qi) => {
    const panel = document.createElement("div");
    panel.className = "problem-panel" + (qi === activeProblem ? " active" : "");
    panel.dataset.qi = qi;

    const h = document.createElement("h4");
    h.textContent = `問題 ${qi + 1}`;
    panel.appendChild(h);

    const numsRow = document.createElement("div");
    numsRow.className = "nums";
    nums.forEach((n, ni) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "num-btn";
      btn.textContent = n;
      btn.disabled = problemStates[qi].usedIdx.includes(ni);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        pickNumber(qi, ni, n, btn);
      });
      numsRow.appendChild(btn);
    });
    panel.appendChild(numsRow);

    const expr = document.createElement("div");
    expr.className = "expr-box";
    expr.id = `expr-${qi}`;
    expr.textContent = problemStates[qi].expression;
    panel.appendChild(expr);

    panel.addEventListener("click", () => {
      activeProblem = qi;
      renderProblems();
    });
    box.appendChild(panel);
  });
}

function pickNumber(qi, ni, n, btn) {
  if (submitted) return;
  const st = problemStates[qi];
  if (st.chosenCount >= 5) return;
  st.expression += String(n);
  st.chosenCount++;
  st.usedIdx.push(ni);
  btn.disabled = true;
  $(`expr-${qi}`).textContent = st.expression;
}

function appendOp(op) {
  if (submitted) return;
  problemStates[activeProblem].expression += op;
  $(`expr-${activeProblem}`).textContent = problemStates[activeProblem].expression;
}

function undoActive() {
  if (submitted) return;
  const st = problemStates[activeProblem];
  const expr = st.expression;
  if (!expr) return;

  const ops = ["+", "-", "*", "/", "(", ")"];
  const last = expr.slice(-1);
  if (ops.includes(last)) {
    st.expression = expr.slice(0, -1);
  } else {
    let numStr = "";
    while (st.expression.length && /[0-9]/.test(st.expression.slice(-1))) {
      numStr = st.expression.slice(-1) + numStr;
      st.expression = st.expression.slice(0, -1);
    }
    if (numStr && st.usedIdx.length) {
      st.usedIdx.pop();
      st.chosenCount--;
    }
  }
  $(`expr-${activeProblem}`).textContent = st.expression;
  renderProblems();
}

function clearActive() {
  if (submitted) return;
  problemStates[activeProblem] = { expression: "", chosenCount: 0, usedIdx: [] };
  renderProblems();
}

function getExpressions() {
  return problemStates.map((s) => s.expression);
}

function setupGameUI(title, hint) {
  $("gameTitle").textContent = title;
  $("gameTargetBadge").textContent = String(target);
  $("timeLeft").textContent = String(duration);
  $("gameHint").textContent = hint || "";
  $("gameMessage").textContent = "";
  submitted = false;
  $("submitBtn").disabled = false;
  initProblemStates();
  renderProblems();
}

function showResultMessage(msg) {
  $("resultMessage").textContent = msg;
  showScreen("resultScreen");
}

function formatResults(label, results, total) {
  let s = `${label} 合計差: ${total ?? "—"}\n`;
  (results || []).forEach((r, i) => {
    if (!r || r.expr === "") s += `  問${i + 1}: 未提出\n`;
    else s += `  問${i + 1}: ${r.expr} = ${r.value}（差 ${r.diff}）\n`;
  });
  return s;
}

function showSoloResult(data, timedOut) {
  let msg = `目標 ${data.target}\n\n`;
  msg += formatResults("あなた", data.player_results, data.player_total_diff);
  msg += "\n" + formatResults("CPU", data.cpu_results, data.cpu_total_diff);
  if (timedOut) msg += "\n時間切れ（未提出あり）\n";
  if (data.winner === "player") msg += "\n勝ち！";
  else if (data.winner === "cpu") msg += "\n負け…";
  else msg += "\n引き分け！";
  showResultMessage(msg);
}

function showVersusResult(data) {
  const role = data.role || "A";
  let msg = `目標 ${data.target}\n\n`;
  msg += formatResults("あなた", data.my_results, data.my_total_diff);
  msg += "\n" + formatResults("相手", data.op_results, data.op_total_diff);
  if (data.winner === role) msg += "\n勝ち！";
  else if (data.winner === "引き分け") msg += "\n引き分け！";
  else msg += "\n負け…";
  showResultMessage(msg);
}

async function startSoloGame() {
  stopAll();
  const settings = {
    problems: Number($("soloProblems").value),
    duration: Number($("soloDuration").value),
    target: Number($("soloTarget").value),
    cpu_level: $("soloCpu").value,
  };
  lastSoloSettings = settings;

  try {
    const res = await fetch("/start_game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    gameId = data.game_id;
    rounds = data.rounds;
    target = data.target;
    duration = data.duration;
    playMode = "solo";
    retryAction = () => { showScreen("soloSettingsScreen"); startSoloGame(); };

    setupGameUI("1人 vs CPU", `${data.problems}問・${data.duration}秒・CPU:${$("soloCpu").selectedOptions[0].text}`);
    showScreen("gameScreen");
    pollTimer = setInterval(pollSolo, 250);
  } catch (e) {
    alert("開始に失敗しました");
  }
}

async function pollSolo() {
  if (!gameId || submitted) return;
  try {
    const res = await fetch(`/get_time_left?game_id=${encodeURIComponent(gameId)}`);
    const data = await res.json();
    $("timeLeft").textContent = String(data.time_left);
    if (data.is_over) await soloTimeout();
  } catch (e) { console.error(e); }
}

async function soloTimeout() {
  if (submitted) return;
  submitted = true;
  $("submitBtn").disabled = true;
  stopPoll();
  const res = await fetch("/timeout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId }),
  });
  showSoloResult(await res.json(), true);
}

async function submitSolo() {
  if (submitted || !gameId) return;
  try {
    const res = await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId, expressions: getExpressions() }),
    });
    const data = await res.json();
    if (data.error) {
      $("gameMessage").textContent = data.error;
      return;
    }
    submitted = true;
    $("submitBtn").disabled = true;
    stopPoll();
    showSoloResult(data, false);
  } catch (e) {
    $("gameMessage").textContent = "通信エラー";
  }
}

function startOnlineMatch(mode) {
  stopAll();
  onlineMode = mode;
  playMode = "online";
  retryAction = () => { showScreen("onlineSelectScreen"); startOnlineMatch(mode); };

  const labels = { quick: "すぱっと", normal: "ふつう", slow: "じっくり" };
  $("matchModeLabel").textContent = labels[mode];
  $("matchMessage").textContent = "対戦相手を探しています…";
  $("matchCountdown").textContent = "12";
  showScreen("matchScreen");

  socket = io();
  socket.on("connect", () => socket.emit("join_online", { mode }));
  socket.on("waiting", (d) => { $("matchMessage").textContent = d.message; });
  socket.on("matched", (d) => { $("matchMessage").textContent = `あなたは ${d.role} です`; });
  socket.on("countdown", (d) => { $("matchCountdown").textContent = d.count; });
  socket.on("game_start", (d) => {
    rounds = d.rounds;
    target = d.target;
    duration = d.duration;
    setupGameUI(`オンライン ${d.mode_label}`, "200固定・3問・まとめて提出");
    showScreen("gameScreen");
  });
  socket.on("update", (d) => { if (d.time_left !== undefined) $("timeLeft").textContent = d.time_left; });
  socket.on("submit_ok", () => {
    submitted = true;
    $("submitBtn").disabled = true;
    $("gameMessage").textContent = "提出しました。相手を待っています…";
  });
  socket.on("submit_error", (d) => { $("gameMessage").textContent = d.message; });
  socket.on("opponent_submitted", (d) => { $("gameMessage").textContent = d.message; });
  socket.on("game_over", (d) => { submitted = true; stopSocket(); showVersusResult(d); });
  socket.on("opponent_left", (d) => { $("gameMessage").textContent = d.message; $("submitBtn").disabled = true; });
  socket.on("error_msg", (d) => { $("matchMessage").textContent = d.message; });
}

function bindFriendSocket() {
  socket.on("exhibition_joined", (d) => {
    isHost = d.is_host;
    if (isHost) {
      if (d.message && d.message.includes("相手")) {
        showScreen("friendHostRulesScreen");
      } else {
        $("friendPasswordMsg").textContent = d.message;
        showScreen("friendPasswordScreen");
      }
    } else {
      $("friendPasswordMsg").textContent = "参加しました。ホストのルール設定を待っています…";
      showScreen("friendPasswordScreen");
    }
  });
  socket.on("host_set_rules", () => showScreen("friendHostRulesScreen"));
  socket.on("guest_waiting_rules", (d) => {
    $("friendPasswordMsg").textContent = d.message;
    showScreen("friendPasswordScreen");
  });
  socket.on("rules_proposed", (d) => {
    $("reviewRulesBox").textContent = rulesText(d.rules);
    showScreen("friendReviewScreen");
  });
  socket.on("rules_sent", (d) => { $("hostRulesMsg").textContent = d.message; });
  socket.on("ready_phase", (d) => {
    $("readyRulesBox").textContent = rulesText(d.rules);
    $("readyStatus").textContent = "開始ボタンを押してください";
    showScreen("readyScreen");
  });
  socket.on("ready_status", (d) => {
    $("readyStatus").textContent = `準備 ${d.ready_count}/${d.need}`;
  });
  socket.on("waiting_opponent", (d) => { $("readyStatus").textContent = d.message; });
  socket.on("opponent_waiting", (d) => { $("readyStatus").textContent = d.message; });
  socket.on("all_ready", (d) => { $("readyStatus").textContent = d.message; });
  socket.on("start_countdown", (d) => {
    $("readyStatus").textContent = `スタートまで ${d.count}…`;
  });
  socket.on("game_start", (d) => {
    rounds = d.rounds;
    target = d.target;
    duration = d.duration;
    playMode = "friend";
    retryAction = () => showScreen("friendPasswordScreen");
    setupGameUI("フレンド対戦", `${d.problems}問・${d.duration}秒`);
    showScreen("gameScreen");
  });
  socket.on("update", (d) => { if (d.time_left !== undefined) $("timeLeft").textContent = d.time_left; });
  socket.on("submit_ok", () => {
    submitted = true;
    $("submitBtn").disabled = true;
    $("gameMessage").textContent = "提出しました。相手を待っています…";
  });
  socket.on("submit_error", (d) => { $("gameMessage").textContent = d.message; });
  socket.on("opponent_submitted", (d) => { $("gameMessage").textContent = d.message; });
  socket.on("game_over", (d) => { submitted = true; stopSocket(); showVersusResult(d); });
  socket.on("opponent_left", (d) => {
    $("gameMessage").textContent = d.message;
    $("readyStatus").textContent = d.message;
    $("submitBtn").disabled = true;
  });
  socket.on("error_msg", (d) => { $("friendPasswordMsg").textContent = d.message; });
}

function joinFriend() {
  const pwd = $("friendPassword").value.trim();
  if (!/^\d{4}$/.test(pwd)) {
    $("friendPasswordMsg").textContent = "4桁の数字を入力してください";
    return;
  }
  stopAll();
  playMode = "friend";
  retryAction = () => showScreen("friendPasswordScreen");
  socket = io();
  bindFriendSocket();
  socket.on("connect", () => socket.emit("join_exhibition", { password: pwd }));
}

function submitMultiplayer() {
  if (submitted || !socket) return;
  socket.emit("submit_multi", { expressions: getExpressions() });
}

function submitCurrent() {
  if (playMode === "solo") submitSolo();
  else submitMultiplayer();
}

$("goSoloBtn").addEventListener("click", () => showScreen("soloSettingsScreen"));
$("goOnlineBtn").addEventListener("click", () => showScreen("onlineSelectScreen"));
$("goFriendBtn").addEventListener("click", () => {
  $("friendPassword").value = "";
  $("friendPasswordMsg").textContent = "";
  showScreen("friendPasswordScreen");
});

$("soloStartBtn").addEventListener("click", startSoloGame);
$("soloSettingsBackBtn").addEventListener("click", showTitle);
$("onlineSelectBackBtn").addEventListener("click", showTitle);

document.querySelectorAll("#onlineSelectScreen [data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => startOnlineMatch(btn.dataset.mode));
});

$("matchBackBtn").addEventListener("click", showTitle);
$("friendPasswordBackBtn").addEventListener("click", showTitle);
$("friendJoinBtn").addEventListener("click", joinFriend);

$("hostSendRulesBtn").addEventListener("click", () => {
  if (!socket) return;
  socket.emit("set_exhibition_rules", {
    problems: Number($("hostProblems").value),
    duration: Number($("hostDuration").value),
    target: Number($("hostTarget").value),
  });
});

$("guestApproveBtn").addEventListener("click", () => {
  if (socket) socket.emit("approve_exhibition_rules");
});

$("readyStartBtn").addEventListener("click", () => {
  if (socket) socket.emit("ready_start");
});

document.querySelectorAll(".op-btn").forEach((btn) => {
  btn.addEventListener("click", () => appendOp(btn.dataset.op));
});

$("undoBtn").addEventListener("click", undoActive);
$("clearBtn").addEventListener("click", clearActive);
$("submitBtn").addEventListener("click", submitCurrent);
$("quitBtn").addEventListener("click", () => {
  if (playMode === "friend" && socket) socket.emit("leave_exhibition");
  showTitle();
});

$("retryBtn").addEventListener("click", () => {
  if (retryAction) retryAction();
});
$("backToTitleBtn").addEventListener("click", showTitle);

showTitle();
