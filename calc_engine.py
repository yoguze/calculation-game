"""
200計算ゲームのコアロジック（サーバー側）。

責務:
  - 問題生成
  - 四則演算式の安全な評価
  - ルール検証（使用数字・演算子制限）
  - CPU 思考（ビームサーチ + ランダム探索）
  - 採点

フロントの solo/engine と同等のルールをサーバーでも適用し、
マルチプレイ時の公正な採点に使う。
"""

import ast
import operator
import random
from collections import Counter

DEFAULT_TARGET = 200
DEFAULT_NUM_LO = 1
DEFAULT_NUM_HI = 20
DEFAULT_POOL_SIZE = 10
DEFAULT_NUMBERS_TO_USE = 5

OPS = (operator.add, operator.sub, operator.mul)

CPU_LEVELS = {
    "weak": {"beam_width": 40, "random_tries": 60},
    "medium": {"beam_width": 120, "random_tries": 300},
    "strong": {"beam_width": 260, "random_tries": 700},
}


def default_rules():
    return {
        "num_lo": DEFAULT_NUM_LO,
        "num_hi": DEFAULT_NUM_HI,
        "pool_size": DEFAULT_POOL_SIZE,
        "numbers_to_use": DEFAULT_NUMBERS_TO_USE,
        "allow_mul": True,
        "allow_div": True,
    }


def normalize_rules(rules=None):
    base = default_rules()
    if not rules:
        return base
    for key in base:
        if key in rules:
            base[key] = rules[key]
    base["num_lo"] = max(1, int(base["num_lo"]))
    base["num_hi"] = max(base["num_lo"], int(base["num_hi"]))
    base["pool_size"] = max(6, min(20, int(base["pool_size"])))
    base["numbers_to_use"] = max(1, min(base["pool_size"], int(base["numbers_to_use"])))
    base["allow_mul"] = bool(base["allow_mul"])
    base["allow_div"] = bool(base["allow_div"])
    return base


def generate_numbers(count=DEFAULT_POOL_SIZE, lo=DEFAULT_NUM_LO, hi=DEFAULT_NUM_HI):
    return [random.randint(lo, hi) for _ in range(count)]


def generate_rounds(problem_count, rules=None):
    cfg = normalize_rules(rules)
    return [
        generate_numbers(cfg["pool_size"], cfg["num_lo"], cfg["num_hi"])
        for _ in range(problem_count)
    ]


def int_div(a, b):
    if b == 0:
        raise ZeroDivisionError
    return a // b


def _eval_node(n):
    if isinstance(n, ast.Expression):
        return _eval_node(n.body)
    if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
        return int(n.value)
    if isinstance(n, ast.BinOp):
        left = _eval_node(n.left)
        right = _eval_node(n.right)
        if isinstance(n.op, ast.Add):
            return left + right
        if isinstance(n.op, ast.Sub):
            return left - right
        if isinstance(n.op, ast.Mult):
            return left * right
        if isinstance(n.op, ast.Div):
            return int_div(left, right)
    if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
        return -_eval_node(n.operand)
    raise ValueError("式が不正です")


def eval_expression(expr, rules=None):
    expr = expr.strip()
    if not expr:
        raise ValueError("式が空です")

    allowed = set("0123456789+-*/()")
    if not all(c in allowed or c.isspace() for c in expr):
        raise ValueError("使えない文字があります")

    cfg = normalize_rules(rules)
    node = ast.parse(expr, mode="eval")
    _check_allowed_ops(node, cfg)
    return _eval_node(node)


def _check_allowed_ops(node, rules):
    for n in ast.walk(node):
        if isinstance(n, ast.Mult) and not rules["allow_mul"]:
            raise ValueError("掛け算は使えません")
        if isinstance(n, ast.Div) and not rules["allow_div"]:
            raise ValueError("割り算は使えません")


def extract_numbers_from_expr(expr):
    expr = expr.strip()
    if not expr:
        return []
    node = ast.parse(expr, mode="eval")
    nums = []

    def walk(n):
        if isinstance(n, ast.Expression):
            walk(n.body)
        elif isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            nums.append(int(n.value))
        elif isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            if isinstance(n.operand, ast.Constant) and isinstance(n.operand.value, (int, float)):
                nums.append(-int(n.operand.value))
            else:
                raise ValueError("式が不正です")
        elif isinstance(n, ast.BinOp):
            walk(n.left)
            walk(n.right)

    walk(node)
    return nums


def validate_used_indices(used_indices, numbers, rules=None):
    cfg = normalize_rules(rules)
    max_count = cfg["numbers_to_use"]
    errors = []
    indices = used_indices or []

    if len(indices) > max_count:
        errors.append(f"数字は最大{max_count}個まで使えます（現在{len(indices)}個）")

    if len(set(indices)) != len(indices):
        errors.append("同じ数字ボタンは2回使えません")

    for idx in indices:
        if not isinstance(idx, int) or idx < 0 or idx >= len(numbers):
            errors.append("無効な数字の選択です")
            break

    return errors


def validate_expression_rules(expr, numbers, used_indices, rules=None):
    cfg = normalize_rules(rules)
    errors = list(validate_used_indices(used_indices, numbers, cfg))
    expr = (expr or "").strip()

    if not expr:
        if not errors:
            errors.append("式を入力してください")
        return errors

    try:
        expr_nums = extract_numbers_from_expr(expr)
    except (ValueError, SyntaxError):
        errors.append("式の形が不正です")
        return errors

    valid_indices = [
        i for i in (used_indices or [])
        if isinstance(i, int) and 0 <= i < len(numbers)
    ]
    expected_nums = [numbers[i] for i in valid_indices]

    if len(expr_nums) > cfg["numbers_to_use"]:
        errors.append(f"数字は最大{cfg['numbers_to_use']}個まで使えます")

    if Counter(expr_nums) != Counter(expected_nums):
        errors.append("式の数字が選んだ数字と一致しません")

    try:
        eval_expression(expr, cfg)
    except ValueError as exc:
        errors.append(str(exc))
    except ZeroDivisionError:
        errors.append("ゼロで割っています")
    except SyntaxError:
        errors.append("式の形が不正です")

    unused = [numbers[i] for i in range(len(numbers)) if i not in set(valid_indices)]
    if not errors and unused:
        pass

    return errors


def preview_expression(expr, numbers, used_indices, target=DEFAULT_TARGET, rules=None):
    cfg = normalize_rules(rules)
    errors = validate_expression_rules(expr, numbers, used_indices, cfg)
    value = None
    diff = None

    if expr and expr.strip() and not any(
        e in errors
        for e in ("式の形が不正です", "使えない文字があります", "ゼロで割っています")
    ):
        try:
            value = eval_expression(expr, cfg)
            diff = diff_from_target(value, target)
        except (ValueError, ZeroDivisionError, SyntaxError):
            pass

    valid_indices = [
        i for i in (used_indices or [])
        if isinstance(i, int) and 0 <= i < len(numbers)
    ]
    unused_labels = []
    for i in range(len(numbers)):
        if i not in set(valid_indices):
            unused_labels.append(str(numbers[i]))

    return {
        "value": value,
        "diff": diff,
        "errors": errors,
        "valid": len(errors) == 0 and value is not None,
        "unused_numbers": unused_labels,
        "numbers_needed": need,
        "numbers_selected": len(valid_indices),
    }


def diff_from_target(value, target=DEFAULT_TARGET):
    return abs(target - value)


def apply_op(a, op, b):
    if op is operator.add:
        return a + b
    if op is operator.sub:
        return a - b
    if op is operator.mul:
        return a * b
    return int_div(a, b)


def _cpu_op_symbols(rules):
    cfg = normalize_rules(rules)
    symbols = ["+", "-"]
    if cfg["allow_mul"]:
        symbols.append("*")
    if cfg["allow_div"]:
        symbols.append("/")
    return symbols


def _cpu_ops(rules):
    cfg = normalize_rules(rules)
    ops = [operator.add, operator.sub]
    if cfg["allow_mul"]:
        ops.append(operator.mul)
    return ops, cfg["allow_div"]


def beam_search_cpu(numbers, target=DEFAULT_TARGET, cpu_level="medium", rules=None):
    cfg = normalize_rules(rules)
    level = CPU_LEVELS.get(cpu_level, CPU_LEVELS["medium"])
    beam_width = level["beam_width"]
    random_tries = level["random_tries"]
    need = cfg["numbers_to_use"]
    ops, allow_div = _cpu_ops(cfg)
    op_symbols = _cpu_op_symbols(cfg)

    best = {"expr": "", "value": 0, "diff": float("inf"), "used_indices": []}

    def consider(value, expr, used):
        nonlocal best
        d = diff_from_target(value, target)
        if d < best["diff"]:
            best = {
                "expr": expr,
                "value": value,
                "diff": d,
                "used_indices": sorted(used),
            }

    if need < 1 or need > len(numbers):
        best = {"expr": "0", "value": 0, "diff": diff_from_target(0, target), "used_indices": []}
        return best

    beam = []
    for i, n in enumerate(numbers):
        beam.append((n, str(n), frozenset({i})))

    for _ in range(need - 1):
        nxt = []
        for val, expr, used in beam:
            for j, num in enumerate(numbers):
                if j in used:
                    continue
                for op in ops:
                    try:
                        v = apply_op(val, op, num)
                        if op is operator.add:
                            sym = "+"
                        elif op is operator.sub:
                            sym = "-"
                        else:
                            sym = "*"
                        nxt.append((v, f"({expr}){sym}{num}", used | {j}))
                    except ZeroDivisionError:
                        pass
                if allow_div:
                    try:
                        v = int_div(val, num)
                        nxt.append((v, f"({expr})/{num}", used | {j}))
                    except ZeroDivisionError:
                        pass

        if not nxt:
            break
        nxt.sort(key=lambda s: diff_from_target(s[0], target))
        beam = nxt[:beam_width]
        for val, expr, used in beam:
            if len(used) == need:
                consider(val, expr, used)

    if need >= 2:
        for _ in range(random_tries):
            idxs = random.sample(range(len(numbers)), need)
            nums = [numbers[i] for i in idxs]
            symbols = [random.choice(op_symbols) for _ in range(need - 1)]
            expr = str(nums[0])
            val = nums[0]
            ok = True
            for i in range(need - 1):
                sym = symbols[i]
                n = nums[i + 1]
                expr += sym + str(n)
                try:
                    if sym == "+":
                        val = val + n
                    elif sym == "-":
                        val = val - n
                    elif sym == "*":
                        val = val * n
                    else:
                        val = int_div(val, n)
                except ZeroDivisionError:
                    ok = False
                    break
            if ok:
                consider(val, expr, set(idxs))

    if best["diff"] == float("inf"):
        best = {"expr": "0", "value": 0, "diff": diff_from_target(0, target), "used_indices": []}
    return best


def grade_expressions(expressions, used_indices_list, rounds, target, rules=None):
    cfg = normalize_rules(rules)
    results = []
    total_diff = 0

    for i, numbers in enumerate(rounds):
        expr = (expressions[i] if i < len(expressions) else "").strip()
        used = used_indices_list[i] if i < len(used_indices_list) else []
        errors = validate_expression_rules(expr, numbers, used, cfg) if expr else ["式なし"]

        if not expr or errors:
            diff = diff_from_target(0, target)
            results.append({
                "expr": expr,
                "value": None,
                "diff": diff,
                "valid": False,
                "errors": errors if expr else ["式なし"],
            })
            total_diff += diff
            continue

        value = eval_expression(expr, cfg)
        diff = diff_from_target(value, target)
        results.append({
            "expr": expr,
            "value": value,
            "diff": diff,
            "valid": True,
            "errors": [],
        })
        total_diff += diff

    return total_diff, results


def cpu_grade_rounds(rounds, target, cpu_level, rules=None, started_at=None):
    import time

    started = started_at or time.time()
    cpu_results = []
    total = 0
    for i, numbers in enumerate(rounds):
        t0 = time.perf_counter()
        cpu = beam_search_cpu(numbers, target, cpu_level, rules)
        solve_ms = (time.perf_counter() - t0) * 1000
        elapsed_sec = int(time.time() - started)
        cpu_results.append(cpu)
        total += cpu["diff"]
        print(
            f"[CPU] 問{i + 1}: {cpu['expr']} = {cpu['value']}（差 {cpu['diff']}）"
            f" — {solve_ms:.0f} ms @ {elapsed_sec}秒",
            flush=True,
        )
    submitted_at_sec = int(time.time() - started)
    print(f"[CPU] 提出: 開始から {submitted_at_sec} 秒 / 合計差 {total}", flush=True)
    return total, cpu_results
