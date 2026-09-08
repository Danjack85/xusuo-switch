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
import re
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

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


def fetch(url, timeout=15):
    """对 https://域名/api/xxx 形态的 URL 发起受限请求。"""
    m = re.match(r"^https://([^/]+)/api/[a-z]+$", url)
    if not m:
        raise ValueError("URL 不在允许的白名单形态内: " + url)
    assert_public_domain(m.group(1))
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "Accept-Encoding": "identity",
        },
    )
    opener = urllib.request.build_opener(NoRedirect)
    with opener.open(req, timeout=timeout) as r:
        return r.status, r.read(2_000_000).decode("utf-8-sig", "replace")


def looks_json(body):
    head = body.lstrip()[:1]
    return head == "{" or head == "["


def load_stations():
    """从 data.js 按顺序提取 (name, domain, probeDomain)。

    probeDomain 为可选的备用探测入口（如被防护墙拦截的主站镜像），
    未提供时回退到 domain 本身。
    """
    src = DATA_FILE.read_text(encoding="utf-8")
    pairs = re.findall(
        r'name:\s*"([^"]+)",\s*\n\s*domain:\s*"([^"]+)"'
        r'(?:,\s*\n\s*probeDomain:\s*"([^"]+)")?',
        src,
    )
    if not pairs:
        raise SystemExit("未能从 assets/data.js 解析出站点清单")
    return [
        {"name": n, "domain": d, "probe": p or d}
        for n, d, p in pairs
    ]


def load_previous():
    if not LIVE_FILE.is_file():
        return {}
    try:
        return json.loads(LIVE_FILE.read_text(encoding="utf-8")).get("stations") or {}
    except Exception:
        return {}


def probe(domain):
    """探测单个域名，返回 {status, note, models}。

    /api/status 返回 JSON 即视为 online；HTTP 200 但非 JSON（部分地区返回
    着陆页）时继续尝试 /api/pricing，能取到模型列表也视为 online。
    """
    result = {"status": None, "note": "", "models": None}
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

    try:
        code, body = fetch("https://%s/api/pricing" % domain)
        if code == 200 and looks_json(body):
            data = json.loads(body)
            payload = data.get("data") if isinstance(data, dict) else data
            names = []
            if isinstance(payload, list):
                names = [
                    it.get("model_name")
                    for it in payload
                    if isinstance(it, dict) and it.get("model_name")
                ]
            elif isinstance(payload, dict):
                names = list(payload.keys())
            if names:
                result["models"] = sorted(set(names))
                if status_ok:
                    result["status"] = "online"
                    result["note"] = ""
                else:
                    result["status"] = "online"
                    result["note"] = "经 pricing 接口确认在线"
    except Exception:
        pass

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
        r = probe(st["probe"])
        via = st["probe"]
        # 备用入口不在线时再试主站（不同出口对防护墙的可见性不同）
        if r["status"] != "online" and st["probe"] != st["domain"]:
            r2 = probe(st["domain"])
            if r2["status"] == "online":
                r, via = r2, st["domain"]
        log(
            "%-14s %-12s via=%-18s models=%-4s %s"
            % (st["name"], r["status"], via, len(r["models"] or []), r["note"])
        )
        if seed_only and r["status"] != "online":
            continue
        old = prev.get(st["name"]) or {}
        fails = (old.get("fails") or 0) + 1 if r["status"] != "online" else 0
        out[st["name"]] = {
            "status": r["status"],
            "note": r["note"],
            "fails": fails,
            "models": r["models"] if r["models"] else old.get("models"),
            "checkedAt": now.isoformat(timespec="seconds"),
        }

    live = {"generatedAt": now.isoformat(timespec="seconds"), "stations": out}
    print(json.dumps(live, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
