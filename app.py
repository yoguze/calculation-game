"""
マルチプレイ用 API サーバー。

ソロモードはフロントエンド完結のため、本サーバーの主役は Socket.IO による対戦である。
REST エンドポイント（/start_game 等）は後方互換のため残している。
"""

import os
import re
import secrets
import time

from flask import Flask, jsonify, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room

from calc_engine import (
    DEFAULT_NUM_HI,
    DEFAULT_NUM_LO,
    DEFAULT_TARGET,
    cpu_grade_rounds,
    default_rules,
    generate_rounds,
    grade_expressions,
    normalize_rules,
    preview_expression,
)

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True

_allowed_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
socketio = SocketIO(
    app,
    async_mode="threading",
    cors_allowed_origins=[o.strip() for o in _allowed_origins.split(",") if o.strip()] or "*",
)

games = {}
online_rooms = {}
online_waiting = []
exhibition_passwords = {}
exhibition_rooms = {}

ONLINE_TARGET = 200
ONLINE_PROBLEMS = 3
ONLINE_MATCH_COUNTDOWN = 12
EXHIBITION_START_COUNTDOWN = 3

ONLINE_MODES = {
    "quick": {"label": "すぱっと", "duration": 10},
    "normal": {"label": "ふつう", "duration": 30},
    "slow": {"label": "じっくり", "duration": 60},
}

TARGET_MIN = 10
TARGET_MAX = 2000
PROBLEM_MIN = 1
PROBLEM_MAX = 5
DURATION_MIN = 5
DURATION_MAX = 300

NUM_LO_MIN = 1
NUM_HI_MAX = 99
POOL_MIN = 6
POOL_MAX = 20
NUMBERS_TO_USE_MIN = 1
NUMBERS_TO_USE_MAX = 10

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")
ONLINE_RULES = default_rules()


def parse_target(value):
    try:
        target = int(value)
    except (TypeError, ValueError):
        return DEFAULT_TARGET
    return max(TARGET_MIN, min(TARGET_MAX, target))


def parse_problems(value):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 1
    return max(PROBLEM_MIN, min(PROBLEM_MAX, n))


def parse_duration(value):
    try:
        d = int(value)
    except (TypeError, ValueError):
        return 30
    return max(DURATION_MIN, min(DURATION_MAX, d))


def parse_cpu_level(value):
    if value in ("weak", "medium", "strong"):
        return value
    return "medium"


def parse_password(value):
    text = str(value or "").strip()
    if re.fullmatch(r"\d{4}", text):
        return text
    return None


def parse_num_lo(value):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return DEFAULT_NUM_LO
    return max(NUM_LO_MIN, n)


def parse_num_hi(value, lo):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return DEFAULT_NUM_HI
    return max(lo, min(NUM_HI_MAX, n))


def parse_pool_size(value):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return ONLINE_RULES["pool_size"]
    return max(POOL_MIN, min(POOL_MAX, n))


def parse_numbers_to_use(value, pool_size):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return ONLINE_RULES["numbers_to_use"]
    return max(NUMBERS_TO_USE_MIN, min(pool_size, n))


def parse_bool(value, default=True):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ("1", "true", "yes", "on")
    if value is None:
        return default
    return bool(value)


def parse_game_rules(data):
    lo = parse_num_lo(data.get("num_lo"))
    hi = parse_num_hi(data.get("num_hi"), lo)
    pool_size = parse_pool_size(data.get("pool_size"))
    numbers_to_use = parse_numbers_to_use(data.get("numbers_to_use"), pool_size)
    return normalize_rules({
        "num_lo": lo,
        "num_hi": hi,
        "pool_size": pool_size,
        "numbers_to_use": numbers_to_use,
        "allow_mul": parse_bool(data.get("allow_mul"), True),
        "allow_div": parse_bool(data.get("allow_div"), True),
    })


def rules_payload(rules):
    return {
        "num_lo": rules["num_lo"],
        "num_hi": rules["num_hi"],
        "pool_size": rules["pool_size"],
        "numbers_to_use": rules["numbers_to_use"],
        "allow_mul": rules["allow_mul"],
        "allow_div": rules["allow_div"],
    }


def get_time_left(start, duration):
    return max(0, duration - int(time.time() - start))


def judge_total(sub_a, sub_b):
    a = sub_a or {"total_diff": float("inf"), "submitted_at": float("inf")}
    b = sub_b or {"total_diff": float("inf"), "submitted_at": float("inf")}

    if a["total_diff"] < b["total_diff"]:
        return "A"
    if b["total_diff"] < a["total_diff"]:
        return "B"
    if a["submitted_at"] < b["submitted_at"]:
        return "A"
    if b["submitted_at"] < a["submitted_at"]:
        return "B"
    return "引き分け"


def dissolve_exhibition(room_id):
    room = exhibition_rooms.pop(room_id, None)
    if not room:
        return
    pwd = room.get("password")
    if pwd and exhibition_passwords.get(pwd) == room_id:
        del exhibition_passwords[pwd]


def notify_exhibition(room, event, payload, exclude_sid=None):
    for sid in room.get("players", []):
        if sid != exclude_sid:
            socketio.emit(event, payload, to=sid)


@app.route("/start_game", methods=["POST"])
def start_game():
    data = request.get_json(silent=True) or {}
    problems = parse_problems(data.get("problems"))
    duration = parse_duration(data.get("duration"))
    target = parse_target(data.get("target"))
    cpu_level = parse_cpu_level(data.get("cpu_level"))
    rules = parse_game_rules(data)
    rounds = generate_rounds(problems, rules)

    game_id = secrets.token_urlsafe(16)
    games[game_id] = {
        "start": time.time(),
        "duration": duration,
        "target": target,
        "cpu_level": cpu_level,
        "rules": rules,
        "rounds": rounds,
        "finished": False,
    }
    return jsonify({
        "game_id": game_id,
        "rounds": rounds,
        "duration": duration,
        "target": target,
        "problems": problems,
        "cpu_level": cpu_level,
        "rules": rules_payload(rules),
    })


@app.route("/preview", methods=["POST"])
def preview_route():
    data = request.get_json(silent=True) or {}
    expr = data.get("expression", "")
    numbers = data.get("numbers") or []
    used_indices = data.get("used_indices") or []
    target = parse_target(data.get("target"))
    rules = parse_game_rules(data)
    return jsonify(preview_expression(expr, numbers, used_indices, target, rules))


@app.route("/submit", methods=["POST"])
def submit_solo():
    data = request.get_json(silent=True) or {}
    game_id = data.get("game_id")
    expressions = data.get("expressions") or []
    game = games.get(game_id)

    if not game or game.get("finished"):
        return jsonify({"error": "Invalid game"}), 400
    if get_time_left(game["start"], game["duration"]) <= 0:
        return jsonify({"error": "Time up"}), 400

    game["finished"] = True
    target = game["target"]
    rounds = game["rounds"]
    rules = game["rules"]
    used_indices_list = data.get("used_indices") or []
    player_total, player_results = grade_expressions(
        expressions, used_indices_list, rounds, target, rules
    )
    cpu_total, cpu_results = cpu_grade_rounds(
        rounds, target, game["cpu_level"], rules, started_at=game["start"]
    )

    if player_total < cpu_total:
        winner = "player"
    elif player_total > cpu_total:
        winner = "cpu"
    else:
        winner = "draw"

    return jsonify({
        "target": target,
        "winner": winner,
        "player_total_diff": player_total,
        "cpu_total_diff": cpu_total,
        "player_results": player_results,
        "cpu_results": cpu_results,
        "rules": rules_payload(rules),
    })


@app.route("/timeout", methods=["POST"])
def timeout_solo():
    data = request.get_json(silent=True) or {}
    game_id = data.get("game_id")
    game = games.get(game_id)
    if not game or game.get("finished"):
        return jsonify({"error": "Invalid game"}), 400

    game["finished"] = True
    target = game["target"]
    rounds = game["rounds"]
    rules = game["rules"]
    player_total, player_results = grade_expressions([], [], rounds, target, rules)
    cpu_total, cpu_results = cpu_grade_rounds(
        rounds, target, game["cpu_level"], rules, started_at=game["start"]
    )

    return jsonify({
        "target": target,
        "winner": "cpu",
        "player_total_diff": player_total,
        "cpu_total_diff": cpu_total,
        "player_results": player_results,
        "cpu_results": cpu_results,
        "timed_out": True,
        "rules": rules_payload(rules),
    })


@app.route("/get_time_left", methods=["GET"])
def get_time_left_route():
    game_id = request.args.get("game_id")
    game = games.get(game_id)
    if not game:
        return jsonify({"error": "Invalid game_id"}), 400
    time_left = get_time_left(game["start"], game["duration"])
    return jsonify({"time_left": time_left, "is_over": time_left <= 0})


def remove_online_waiting(sid):
    online_waiting[:] = [p for p in online_waiting if p["sid"] != sid]


def finish_online(room_id):
    room = online_rooms.get(room_id)
    if not room or room.get("finished"):
        return

    room["finished"] = True
    subs = room["submissions"]
    p1, p2 = room["players"]
    winner = judge_total(subs.get(p1), subs.get(p2))

    for i, sid in enumerate(room["players"]):
        role = "A" if i == 0 else "B"
        mine = subs.get(sid)
        theirs = subs.get(p2 if sid == p1 else p1)
        socketio.emit(
            "game_over",
            {
                "role": role,
                "winner": winner,
                "target": room["target"],
                "my_total_diff": mine["total_diff"] if mine else None,
                "op_total_diff": theirs["total_diff"] if theirs else None,
                "my_results": mine["results"] if mine else [],
                "op_results": theirs["results"] if theirs else [],
            },
            to=sid,
        )
    del online_rooms[room_id]


def online_countdown_and_start(room_id):
    for i in range(ONLINE_MATCH_COUNTDOWN, 0, -1):
        if room_id not in online_rooms:
            return
        socketio.emit("countdown", {"count": i}, to=room_id)
        socketio.sleep(1)

    if room_id not in online_rooms:
        return

    room = online_rooms[room_id]
    room["rules"] = ONLINE_RULES
    room["rounds"] = generate_rounds(ONLINE_PROBLEMS, ONLINE_RULES)
    room["start_time"] = time.time()
    socketio.emit(
        "game_start",
        {
            "target": room["target"],
            "duration": room["duration"],
            "problems": ONLINE_PROBLEMS,
            "rounds": room["rounds"],
            "mode_label": room["mode_label"],
            "rules": rules_payload(ONLINE_RULES),
        },
        to=room_id,
    )
    socketio.start_background_task(online_timer, room_id)


def online_timer(room_id):
    while True:
        room = online_rooms.get(room_id)
        if not room or room.get("finished"):
            return

        time_left = get_time_left(room["start_time"], room["duration"])
        socketio.emit("update", {"time_left": time_left}, to=room_id)

        if len(room["submissions"]) >= 2:
            finish_online(room_id)
            return
        if time_left <= 0:
            finish_online(room_id)
            return
        socketio.sleep(0.25)


def exhibition_start_countdown(room_id):
    for i in range(EXHIBITION_START_COUNTDOWN, 0, -1):
        room = exhibition_rooms.get(room_id)
        if not room or room.get("state") != "countdown":
            return
        notify_exhibition(room, "start_countdown", {"count": i})
        socketio.sleep(1)

    room = exhibition_rooms.get(room_id)
    if not room or room.get("state") != "countdown":
        return

    rules = room["rules"]
    room["state"] = "playing"
    room["rounds"] = generate_rounds(rules["problems"], rules)
    room["start_time"] = time.time()
    room["submissions"] = {}

    notify_exhibition(
        room,
        "game_start",
        {
            "target": rules["target"],
            "duration": rules["duration"],
            "problems": rules["problems"],
            "rounds": room["rounds"],
            "rules": rules_payload(rules),
        },
    )
    socketio.start_background_task(exhibition_timer, room_id)


def exhibition_timer(room_id):
    while True:
        room = exhibition_rooms.get(room_id)
        if not room or room.get("state") != "playing":
            return

        rules = room["rules"]
        time_left = get_time_left(room["start_time"], rules["duration"])
        notify_exhibition(room, "update", {"time_left": time_left})

        if len(room.get("submissions", {})) >= 2:
            finish_exhibition(room_id)
            return
        if time_left <= 0:
            finish_exhibition(room_id)
            return
        socketio.sleep(0.25)


def finish_exhibition(room_id):
    room = exhibition_rooms.get(room_id)
    if not room or room.get("finished"):
        return

    room["finished"] = True
    subs = room.get("submissions", {})
    p1, p2 = room["players"]
    winner = judge_total(subs.get(p1), subs.get(p2))
    target = room["rules"]["target"]

    for i, sid in enumerate(room["players"]):
        role = "A" if i == 0 else "B"
        mine = subs.get(sid)
        theirs = subs.get(p2 if sid == p1 else p1)
        socketio.emit(
            "game_over",
            {
                "role": role,
                "winner": winner,
                "target": target,
                "my_total_diff": mine["total_diff"] if mine else None,
                "op_total_diff": theirs["total_diff"] if theirs else None,
                "my_results": mine["results"] if mine else [],
                "op_results": theirs["results"] if theirs else [],
            },
            to=sid,
        )
    dissolve_exhibition(room_id)


@socketio.on("join_online")
def on_join_online(data):
    sid = request.sid
    mode = data.get("mode")
    if mode not in ONLINE_MODES:
        emit("error_msg", {"message": "モードが不正です"})
        return

    remove_online_waiting(sid)
    cfg = ONLINE_MODES[mode]
    partner = None
    for p in online_waiting:
        if p["mode"] == mode:
            partner = p
            break

    if partner:
        online_waiting.remove(partner)
        p1, p2 = partner["sid"], sid
        room_id = f"online_{p1}_{p2}"
        join_room(room_id, sid=p1)
        join_room(room_id, sid=p2)
        online_rooms[room_id] = {
            "players": [p1, p2],
            "mode": mode,
            "mode_label": cfg["label"],
            "duration": cfg["duration"],
            "target": ONLINE_TARGET,
            "submissions": {},
            "finished": False,
        }
        socketio.emit("matched", {"role": "A", "mode_label": cfg["label"]}, to=p1)
        socketio.emit("matched", {"role": "B", "mode_label": cfg["label"]}, to=p2)
        socketio.start_background_task(online_countdown_and_start, room_id)
    else:
        online_waiting.append({"sid": sid, "mode": mode})
        emit("waiting", {"message": "対戦相手を探しています…", "mode_label": cfg["label"]})


@socketio.on("join_exhibition")
def on_join_exhibition(data):
    sid = request.sid
    pwd = parse_password(data.get("password"))
    if not pwd:
        emit("error_msg", {"message": "4桁の数字を入力してください"})
        return

    existing_id = exhibition_passwords.get(pwd)
    if existing_id and existing_id in exhibition_rooms:
        room = exhibition_rooms[existing_id]
        if len(room["players"]) >= 2:
            emit("error_msg", {"message": "このパスワードのルームは満員です"})
            return
        if sid in room["players"]:
            emit("error_msg", {"message": "すでに参加しています"})
            return

        room["players"].append(sid)
        join_room(room["id"], sid=sid)
        guest = sid
        host = room["host"]
        emit("exhibition_joined", {"role": "guest", "is_host": False, "password": pwd})
        socketio.emit(
            "exhibition_joined",
            {"role": "host", "is_host": True, "password": pwd, "message": "相手が参加しました"},
            to=host,
        )
        socketio.emit("guest_waiting_rules", {"message": "ホストのルール設定を待っています…"}, to=guest)
        socketio.emit("host_set_rules", {"message": "ルールを設定してください"}, to=host)
        room["state"] = "host_setting"
        return

    room_id = f"ex_{pwd}_{secrets.token_hex(4)}"
    exhibition_passwords[pwd] = room_id
    exhibition_rooms[room_id] = {
        "id": room_id,
        "password": pwd,
        "host": sid,
        "players": [sid],
        "state": "waiting_partner",
        "rules": None,
        "ready": set(),
    }
    join_room(room_id, sid=sid)
    emit("exhibition_joined", {
        "role": "host",
        "is_host": True,
        "password": pwd,
        "message": "相手の参加を待っています…",
    })


@socketio.on("set_exhibition_rules")
def on_set_exhibition_rules(data):
    sid = request.sid
    for room in exhibition_rooms.values():
        if room.get("host") != sid or room.get("state") not in ("host_setting", "waiting_partner"):
            continue
        if len(room["players"]) < 2:
            emit("error_msg", {"message": "相手がまだ参加していません"})
            return

        game_rules = parse_game_rules(data)
        rules = {
            "problems": parse_problems(data.get("problems")),
            "duration": parse_duration(data.get("duration")),
            "target": parse_target(data.get("target")),
            **game_rules,
        }
        room["rules"] = rules
        room["state"] = "guest_review"
        guest = [p for p in room["players"] if p != sid][0]
        socketio.emit("rules_proposed", {"rules": {**rules, **rules_payload(rules)}}, to=guest)
        emit("rules_sent", {"message": "ルールを送りました。相手の承認を待っています…"})
        return


@socketio.on("approve_exhibition_rules")
def on_approve_exhibition_rules(data):
    sid = request.sid
    for room in exhibition_rooms.values():
        if sid not in room["players"] or room.get("state") != "guest_review":
            continue
        if room.get("host") == sid:
            emit("error_msg", {"message": "ホストは承認できません"})
            return

        room["state"] = "ready_check"
        room["ready"] = set()
        notify_exhibition(room, "ready_phase", {
            "rules": room["rules"],
            "message": "プレイ開始！",
        })
        return


@socketio.on("ready_start")
def on_ready_start():
    sid = request.sid
    for room_id, room in list(exhibition_rooms.items()):
        if sid not in room["players"] or room.get("state") != "ready_check":
            continue

        room["ready"].add(sid)
        notify_exhibition(room, "ready_status", {
            "ready_count": len(room["ready"]),
            "need": 2,
        })

        if len(room["ready"]) < 2:
            other = [p for p in room["players"] if p != sid][0]
            socketio.emit("opponent_waiting", {"message": "相手待ち…"}, to=other)
            emit("waiting_opponent", {"message": "相手の開始を待っています…"})
            return

        room["state"] = "countdown"
        notify_exhibition(room, "all_ready", {"message": "両者準備OK！"})
        socketio.start_background_task(exhibition_start_countdown, room_id)
        return


@socketio.on("submit_multi")
def on_submit_multi(data):
    sid = request.sid
    expressions = data.get("expressions") or []
    used_indices_list = data.get("used_indices") or []

    for room_id, room in list(online_rooms.items()):
        if sid not in room["players"] or room.get("finished"):
            continue
        if sid in room["submissions"]:
            emit("submit_error", {"message": "すでに提出済みです"})
            return
        if get_time_left(room["start_time"], room["duration"]) <= 0:
            emit("submit_error", {"message": "時間切れです"})
            return

        rules = room.get("rules", ONLINE_RULES)
        total, results = grade_expressions(
            expressions, used_indices_list, room["rounds"], room["target"], rules
        )
        room["submissions"][sid] = {
            "total_diff": total,
            "results": results,
            "submitted_at": time.time(),
        }
        emit("submit_ok", {"total_diff": total})
        other = [p for p in room["players"] if p != sid][0]
        socketio.emit("opponent_submitted", {"message": "相手が提出しました"}, to=other)
        if len(room["submissions"]) >= 2:
            finish_online(room_id)
        return

    for room_id, room in list(exhibition_rooms.items()):
        if room.get("state") != "playing" or sid not in room["players"]:
            continue
        if room.get("finished"):
            continue
        if sid in room.get("submissions", {}):
            emit("submit_error", {"message": "すでに提出済みです"})
            return
        rules = room["rules"]
        if get_time_left(room["start_time"], rules["duration"]) <= 0:
            emit("submit_error", {"message": "時間切れです"})
            return

        total, results = grade_expressions(
            expressions, used_indices_list, room["rounds"], rules["target"], rules
        )
        room.setdefault("submissions", {})[sid] = {
            "total_diff": total,
            "results": results,
            "submitted_at": time.time(),
        }
        emit("submit_ok", {"total_diff": total})
        other = [p for p in room["players"] if p != sid][0]
        socketio.emit("opponent_submitted", {"message": "相手が提出しました"}, to=other)
        if len(room["submissions"]) >= 2:
            finish_exhibition(room_id)
        return


@socketio.on("leave_exhibition")
def on_leave_exhibition():
    sid = request.sid
    cleanup_player(sid)


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    cleanup_player(sid)


def cleanup_player(sid):
    remove_online_waiting(sid)

    for room_id, room in list(online_rooms.items()):
        if sid in room["players"]:
            other = [p for p in room["players"] if p != sid][0]
            socketio.emit("opponent_left", {"message": "相手が切断しました"}, to=other)
            del online_rooms[room_id]

    for room_id, room in list(exhibition_rooms.items()):
        if sid not in room.get("players", []):
            continue
        notify_exhibition(room, "opponent_left", {"message": "相手が切断しました"}, exclude_sid=sid)
        dissolve_exhibition(room_id)
        for p in room.get("players", []):
            if p != sid:
                leave_room(room["id"], sid=p)


@app.route("/assets/<path:filename>")
def serve_frontend_assets(filename):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isfile(os.path.join(assets_dir, filename)):
        return send_from_directory(assets_dir, filename)
    return jsonify({"error": "Not found"}), 404


@app.route("/")
def serve_frontend_index():
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({
        "error": "Frontend not built",
        "hint": "Run: cd frontend && npm install && npm run build",
    }), 503


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        allow_unsafe_werkzeug=True,
    )
