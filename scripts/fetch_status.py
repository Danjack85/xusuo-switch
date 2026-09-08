#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取各公益站的公开状态与模型列表，结果以 JSON 打印到标准输出。

用法：
    python scripts/fetch_status.py            # 全量抓取（CI 用）
    python scripts/fetch_status.py --seed     # 只输出成功项（本地播种用）

- 站点清单从 assets/data.js 解析（单一数据源，新增站点无需改本脚本）。
- 每站探测 /api/status（new-api 系公开接口）与 /api/pricing（部分站点公开）。
- 状态分三档：online / blocked（防护墙拦截，无法验证）/ unreachable。
- 连续失败次数与上次已知模型列表会从既有的 assets/live.json 续算，
  因此调用方应把本脚本的标准输出重定向覆盖写入 assets/live.json。
- 安全边界：仅允许 https + 公网域名（解析后 IP 必须全为公网地址），禁止重定向。
"""
import datetime
import ipaddress
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

ONLINE_CARRY_HOURS = 12  # 在线状态的延续窗口：任一探测网络见过在线即保留

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
TZ = datetime.timezone(datetime.timedelta(hours=8))  # 北京时间
ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "assets" / "data.js"
LIVE_FILE = ROOT / "assets" / "live.json"
DOMAIN_RE = re.compile(
    r"^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$"
)


def log(msg):
    print(msg, file=sys.stderr)


def assert_public_domain(domain):
    """仅允许公网域名：非 IP 字面量、可解析且解析结果全为公网地址。"""
    if not DOMAIN_RE.match(domain) or "." not in domain:
        raise ValueError("非法域名: " + domain)
    try:
        infos = socket.getaddrinfo(domain, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ValueError("域名解析失败: " + domain)
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ValueError("解析到非公网地址: %s -> %s" % (domain, ip))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # 一律不跟随重定向


def fetch(url, timeout=15, token=None):
    """对 https://域名/api/xxx 或 /v1/models 形态的 URL 发起受限请求。"""
    m = re.match(r"^https://([^/]+)/(api/[a-z]+|v1/models)$", url)
    if not m:
        raise ValueError("URL 不在允许的白名单形态内: " + url)
    assert_public_domain(m.group(1))
    headers = {
        "User-Agent": UA,
        "Accept": "application/json",
        "Accept-Encoding": "identity",
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, headers=headers)
    opener = urllib.request.build_opener(NoRedirect)
    with opener.open(req, timeout=timeout) as r:
        return r.status, r.read(2_000_000).decode("utf-8-sig", "replace")


def looks_json(body):
    head = body.lstrip()[:1]
    return head == "{" or head == "["


def extract_model_names(body):
    """从报价 / v1/models 响应中提取模型名集合。"""
    data = json.loads(body)
    payload = data.get("data") if isinstance(data, dict) else data
    names = []
    if isinstance(payload, list):
        for it in payload:
            if isinstance(it, dict):
                nm = it.get("model_name") or it.get("id") or it.get("name")
                if nm:
                    names.append(nm)
            elif isinstance(it, str):
                names.append(it)
    elif isinstance(payload, dict):
        names = list(payload.keys())
    return sorted(set(names)) if names else None


def fetch_models(domain, token=None):
    """依次尝试多个模型来源，返回 (模型列表, 来源说明) 或 (None, "")。

    1) 公开报价 /api/pricing（new-api 系）
    2) 配置了令牌时：带鉴权的 /api/pricing，再退到 OpenAI 兼容 /v1/models
    """
    attempts = [("public-pricing", "/api/pricing", None)]
    if token:
        attempts += [("pricing+token", "/api/pricing", token), ("v1/models", "/v1/models", token)]
    for label, path, tok in attempts:
        try:
            code, body = fetch("https://%s%s" % (domain, path), token=tok)
            if code == 200 and looks_json(body):
                models = extract_model_names(body)
                log("    models %-14s -> %s 个" % (label, len(models) if models else 0))
                if models:
                    return models, label
            else:
                log("    models %-14s -> HTTP %s" % (label, code))
        except urllib.error.HTTPError as e:
            log("    models %-14s -> HTTP %s" % (label, e.code))
        except ValueError as e:
            log("    models %-14s -> %s" % (label, str(e)[:50]))
        except Exception as e:
            log("    models %-14s -> %s" % (label, type(e).__name__))
    return None, ""


def load_stations():
    """从 data.js 解析站点清单：name / domain / probeDomain / tokenEnv。

    按花括号块逐块提取字段，与字段书写顺序无关；可选字段缺省时：
    probeDomain 回退到 domain 本身，tokenEnv 为空表示不使用令牌。
    """
    src = DATA_FILE.read_text(encoding="utf-8")
    stations = []
    for block in re.split(r"\}\s*,", src):
        nm = re.search(r'\bname:\s*"([^"]+)"', block)
        dm = re.search(r'\bdomain:\s*"([^"]+)"', block)
        if not nm or not dm:
            continue  # TOOLS 等没有 domain 字段的块自然跳过
        pm = re.search(r'\bprobeDomain:\s*"([^"]+)"', block)
        tm = re.search(r'\btokenEnv:\s*"([^"]+)"', block)
        stations.append(
            {
                "name": nm.group(1),
                "domain": dm.group(1),
                "probe": pm.group(1) if pm else dm.group(1),
                "tokenEnv": tm.group(1) if tm else "",
            }
        )
    if not stations:
        raise SystemExit("未能从 assets/data.js 解析出站点清单")
    return stations


def load_previous():
    if not LIVE_FILE.is_file():
        return {}
    try:
        return json.loads(LIVE_FILE.read_text(encoding="utf-8")).get("stations") or {}
    except Exception:
        return {}


def probe(domain, token=None):
    """探测单个域名，返回 {status, note, models, modelsSrc}。

    /api/status 返回 JSON 即视为 online；HTTP 200 但非 JSON（部分地区返回
    着陆页）时继续尝试 /api/pricing，能取到模型列表也视为 online。
    """
    result = {"status": None, "note": "", "models": None, "modelsSrc": ""}
    status_ok = False
    try:
        code, body = fetch("https://%s/api/status" % domain)
        if code == 200 and looks_json(body):
            status_ok = True
        elif code == 200:
            result["status"] = "blocked"
            result["note"] = "status 200 非JSON: " + body.lstrip()[:40].replace("\n", " ")
        else:
            result["status"] = "blocked"
            result["note"] = "status HTTP %s" % code
    except urllib.error.HTTPError as e:
        if e.code in (403, 503, 429):
            result["status"] = "blocked"
            result["note"] = "HTTP %s（防护墙）" % e.code
        else:
            result["status"] = "unreachable"
            result["note"] = "HTTP %s" % e.code
    except ValueError as e:
        result["status"] = "unreachable"
        result["note"] = str(e)[:60]
    except Exception as e:  # 超时 / DNS / 连接重置
        result["status"] = "unreachable"
        result["note"] = type(e).__name__

    models, src = fetch_models(domain, token)
    if models:
        result["models"] = models
        result["modelsSrc"] = src
        if not status_ok:
            # 报价/模型接口可达即可确认站点在线
            result["status"] = "online"
            result["note"] = "经模型接口确认在线"
    if result["status"] != "online" and status_ok:
        result["status"] = "online"
        result["note"] = ""
    return result


def main():
    seed_only = "--seed" in sys.argv
    prev = load_previous()
    now = datetime.datetime.now(TZ)
    out = {}
    for st in load_stations():
        token = (os.environ.get(st.get("tokenEnv") or "", "") or "").strip() or None
        r = probe(st["probe"], token)
        via = st["probe"]
        # 备用入口不在线时再试主站（不同出口对防护墙的可见性不同）
        if r["status"] != "online" and st["probe"] != st["domain"]:
            r2 = probe(st["domain"], token)
            if r2["status"] == "online":
                r, via = r2, st["domain"]
        log(
            "%-12s %-12s via=%-18s models=%-4s %s"
            % (st["name"], r["status"], via, len(r["models"] or []), r["note"])
        )
        if seed_only and r["status"] != "online":
            continue

        old = prev.get(st["name"]) or {}
        last_online = old.get("lastOnlineAt") or (
            old.get("checkedAt") if old.get("status") == "online" else None
        )
        models = r["models"] if r["models"] else old.get("models")

        entry = {
            "status": r["status"],
            "note": r["note"],
            "fails": (old.get("fails") or 0) + 1 if r["status"] != "online" else 0,
            "models": models,
            "modelsSrc": r["modelsSrc"] or (old.get("modelsSrc") or "" if r["models"] else ""),
            "checkedAt": now.isoformat(timespec="seconds"),
            "lastOnlineAt": last_online,
        }

        # 本次探测不在线，但另一网络在窗口内见过它在线 → 沿用在线结论
        if r["status"] != "online" and last_online:
            try:
                age = now - datetime.datetime.fromisoformat(last_online)
            except ValueError:
                age = None
            if age is not None and datetime.timedelta(0) <= age < datetime.timedelta(hours=ONLINE_CARRY_HOURS):
                entry["status"] = "online"
                entry["fails"] = 0
                entry["note"] = "沿用 " + last_online + " 的在线记录"
        if entry["status"] == "online" and r["status"] == "online":
            entry["lastOnlineAt"] = entry["checkedAt"]

        out[st["name"]] = entry

    live = {"generatedAt": now.isoformat(timespec="seconds"), "stations": out}
    print(json.dumps(live, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
