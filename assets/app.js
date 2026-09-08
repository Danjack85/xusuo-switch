/* XUSUO交换机 · 页面逻辑 */
(function () {
  "use strict";

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  /* ---------- 主题切换 ---------- */
  var themeBtn = document.getElementById("themeToggle");
  themeBtn.addEventListener("click", function () {
    var dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("xusuo-theme", dark ? "dark" : "light");
    } catch (e) {}
  });

  /* ---------- 提示条（知道了后记住） ---------- */
  var notice = document.getElementById("notice");
  try {
    if (localStorage.getItem("xusuo-notice-dismissed") === "1") notice.style.display = "none";
  } catch (e) {}
  document.getElementById("noticeClose").addEventListener("click", function () {
    notice.style.display = "none";
    try {
      localStorage.setItem("xusuo-notice-dismissed", "1");
    } catch (e) {}
  });

  /* ---------- 触摸 / 点击涟漪反馈 ---------- */
  document.addEventListener("pointerdown", function (e) {
    if (reduceMotion) return;
    var host = e.target.closest(".btn, .chip, .btn-copy, .notice-btn, .theme-toggle, .back-top");
    if (!host) return;
    var rect = host.getBoundingClientRect();
    var d = Math.max(rect.width, rect.height) * 2.2;
    var cx = typeof e.clientX === "number" && (e.clientX || e.clientY) ? e.clientX : rect.left + rect.width / 2;
    var cy = typeof e.clientY === "number" && (e.clientX || e.clientY) ? e.clientY : rect.top + rect.height / 2;
    var old = host.querySelector(".ripple");
    if (old) old.remove();
    var s = document.createElement("span");
    s.className = "ripple";
    s.style.width = s.style.height = d + "px";
    s.style.left = cx - rect.left - d / 2 + "px";
    s.style.top = cy - rect.top - d / 2 + "px";
    host.appendChild(s);
    setTimeout(function () { s.remove(); }, 700);
  }, { passive: true });

  /* ---------- Toast ---------- */
  var toast = document.getElementById("toast");
  var toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 1600);
  }

  /* ---------- 筛选器 ---------- */
  var FILTERS = [
    { key: "all", label: "全部", test: function () { return true; } },
    { key: "claude", label: "Claude", test: hasModel(/claude/i) },
    { key: "gpt", label: "GPT", test: hasModel(/gpt/i) },
    { key: "deepseek", label: "DeepSeek", test: hasModel(/deepseek/i) },
    { key: "glm", label: "GLM", test: hasModel(/glm/i) },
    { key: "gh-any", label: "GitHub 无年限", test: function (s) { return /没有时间/.test(s.signupReq); } },
    { key: "email", label: "邮箱注册", test: function (s) { return !/github/i.test(s.signupReq); } },
  ];

  function hasModel(re) {
    return function (s) {
      return s.models.some(function (m) { return re.test(m); });
    };
  }

  var state = { filter: "all", q: "", sort: "default" };

  var chipsBox = document.getElementById("chips");
  FILTERS.forEach(function (f) {
    var n = STATIONS.filter(f.test).length;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (f.key === "all" ? " active" : "");
    b.innerHTML = f.label + ' <span class="n">' + n + "</span>";
    b.dataset.key = f.key;
    b.addEventListener("click", function () {
      state.filter = f.key;
      chipsBox.querySelectorAll(".chip").forEach(function (c) {
        c.classList.toggle("active", c.dataset.key === f.key);
      });
      render();
    });
    chipsBox.appendChild(b);
  });

  var searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", function (e) {
    state.q = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById("sortSelect").addEventListener("change", function (e) {
    state.sort = e.target.value;
    render();
  });

  /* ---------- 渲染站点卡片 ---------- */
  var cardsBox = document.getElementById("cards");
  var emptyBox = document.getElementById("empty");
  var countBox = document.getElementById("stationCount");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function tagClass(m) {
    if (/claude/i.test(m)) return "tag-claude";
    if (/gpt/i.test(m)) return "tag-gpt";
    if (/deepseek/i.test(m)) return "tag-deepseek";
    if (/glm/i.test(m)) return "tag-glm";
    if (/grok|kimi|mimo|minimax/i.test(m)) return "tag-other";
    return "tag-misc";
  }

  function avatarClass(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h += name.charCodeAt(i);
    return "av-" + (h % 7);
  }

  function cardHTML(s, i) {
    var tags = s.models.map(function (m) {
      return '<span class="tag ' + tagClass(m) + '">' + esc(m) + "</span>";
    }).join("");
    var first = esc(s.name.charAt(0).toUpperCase());
    var n = Math.max(0, Math.min(5, s.stars || 0));
    var stars = '<span class="stars" title="推荐指数 ' + n + " / 5" +
      '" aria-label="推荐指数 ' + n + " / 5" + '"><b>' + "★".repeat(n) + "</b>" +
      '<i>' + "☆".repeat(5 - n) + "</i></span>";
    return (
      '<article class="card" style="animation-delay:' + (i * 45) + 'ms">' +
        '<div class="card-head">' +
          '<div class="card-id">' +
            '<span class="avatar ' + avatarClass(s.name) + '" aria-hidden="true">' + first + "</span>" +
            "<div>" +
              '<h3 class="card-name">' + esc(s.name) + "</h3>" +
              '<span class="card-domain">' + esc(s.domain) + "</span>" +
            "</div>" +
          "</div>" +
          '<div class="card-badges">' +
            stars +
            (s.half ? '<span class="badge half">半公益</span>' : "") +
            '<span class="badge aff">含邀请参数</span>' +
          "</div>" +
        "</div>" +
        '<div class="bonus-row">' +
          '<div class="bonus"><span class="bonus-label">' + esc(s.signupLabel) + "</span>" +
            '<span class="bonus-value">' + esc(s.signupBonus) + "</span>" +
            (s.bonusNote ? '<span class="bonus-note">' + esc(s.bonusNote) + "</span>" : "") +
          "</div>" +
          '<div class="bonus"><span class="bonus-label">每日签到</span>' +
            '<span class="bonus-value">' + esc(s.dailyBonus) + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="tags">' + tags + "</div>" +
        '<dl class="facts">' +
          (s.warning ? '<div class="warn-row' + (s.down ? " danger" : "") + '"><dt>' + (s.down ? "警告" : "注意") + "</dt><dd>" + esc(s.warning) + "</dd></div>" : "") +
          "<div><dt>注册要求</dt><dd>" + esc(s.signupReq) + "</dd></div>" +
          "<div><dt>使用反馈</dt><dd>" + esc(s.note) + "</dd></div>" +
        "</dl>" +
        '<div class="card-foot">' +
          '<a class="btn" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">通过邀请链接注册 ↗</a>' +
          '<button class="btn-copy" type="button" data-url="' + esc(s.url) + '" aria-label="复制链接" title="复制链接">' +
            '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 9V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H15M5.5 9h8A1.5 1.5 0 0 1 15 10.5v8A1.5 1.5 0 0 1 13.5 20h-8A1.5 1.5 0 0 1 4 18.5v-8A1.5 1.5 0 0 1 5.5 9Z"/></svg>' +
          "</button>" +
        "</div>" +
      "</article>"
    );
  }

  function currentList() {
    var f = FILTERS.find(function (x) { return x.key === state.filter; }) || FILTERS[0];
    var list = STATIONS.filter(f.test);
    if (state.q) {
      list = list.filter(function (s) {
        var hay = (s.name + " " + s.domain + " " + s.models.join(" ")).toLowerCase();
        return hay.indexOf(state.q) !== -1;
      });
    }
    if (state.sort === "signup") {
      list = list.slice().sort(function (a, b) { return (b.signupNum || 0) - (a.signupNum || 0); });
    } else if (state.sort === "daily") {
      list = list.slice().sort(function (a, b) { return (b.dailyNum || 0) - (a.dailyNum || 0); });
    }
    return list;
  }

  function render() {
    var list = currentList();
    cardsBox.innerHTML = list.map(cardHTML).join("");
    countBox.textContent = "共 " + list.length + " 个";
    emptyBox.hidden = list.length !== 0;
  }

  cardsBox.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn-copy");
    if (!btn) return;
    var url = btn.dataset.url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () { markCopied(btn); showToast("已复制链接"); },
        function () { fallbackCopy(url, btn); }
      );
    } else {
      fallbackCopy(url, btn);
    }
  });

  function markCopied(btn) {
    if (btn.dataset.origHtml) return;
    btn.dataset.origHtml = btn.innerHTML;
    btn.classList.add("ok");
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
    setTimeout(function () {
      btn.classList.remove("ok");
      btn.innerHTML = btn.dataset.origHtml;
      delete btn.dataset.origHtml;
    }, 1400);
  }

  function fallbackCopy(text, btn) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      if (btn) markCopied(btn);
      showToast("已复制链接");
    } catch (err) {
      showToast("复制失败，请手动复制");
    }
    document.body.removeChild(ta);
  }

  /* ---------- 清除筛选 ---------- */
  document.getElementById("clearFilters").addEventListener("click", function () {
    state = { filter: "all", q: "", sort: state.sort };
    searchInput.value = "";
    chipsBox.querySelectorAll(".chip").forEach(function (c) {
      c.classList.toggle("active", c.dataset.key === "all");
    });
    render();
  });

  /* ---------- 渲染工具卡片 ---------- */
  var toolBox = document.getElementById("toolCards");
  toolBox.innerHTML = TOOLS.map(function (t, i) {
    var link = t.url
      ? '<a class="tool-link" href="' + esc(t.url) + '" target="_blank" rel="noopener noreferrer">前往查看 ↗</a>'
      : '<span class="tool-link disabled">🚧 开发中，敬请期待</span>';
    return (
      '<div class="tool-card" style="animation-delay:' + (i * 45) + 'ms">' +
        '<div class="tool-head"><h3>' + esc(t.name) + '</h3><span class="badge">' + esc(t.tag) + "</span></div>" +
        "<p>" + esc(t.desc) + "</p>" + link +
      "</div>"
    );
  }).join("");

  /* ---------- 回到顶部 + 导航滚动阴影 + 滚动高亮 ---------- */
  var nav = document.getElementById("nav");
  var backTop = document.getElementById("backTop");
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      nav.classList.toggle("scrolled", window.scrollY > 8);
      backTop.classList.toggle("show", window.scrollY > 600);
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  backTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  var spyLinks = document.querySelectorAll("#navLinks a[data-spy]");
  if ("IntersectionObserver" in window) {
    var spyMap = {};
    spyLinks.forEach(function (a) { spyMap[a.dataset.spy] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var link = spyMap[en.target.id];
        if (!link) return;
        if (en.isIntersecting) {
          spyLinks.forEach(function (a) { a.classList.remove("active"); });
          link.classList.add("active");
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    ["stations", "tools", "risks"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  /* ---------- 统计数字滚动 ---------- */
  function countUp(el) {
    var target = parseInt(el.dataset.count, 10);
    var prefix = el.dataset.prefix || "";
    var suffix = el.dataset.suffix || "";
    if (reduceMotion || !isFinite(target)) {
      el.textContent = prefix + target + suffix;
      return;
    }
    var start = null;
    var dur = 900;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    el.textContent = prefix + "0" + suffix;
    requestAnimationFrame(step);
  }
  document.querySelectorAll(".stat-num[data-count]").forEach(countUp);

  /* ---------- 其它 ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();
  if (typeof SITE_UPDATED_AT === "string" && SITE_UPDATED_AT) {
    var up = document.getElementById("updatedAt");
    up.textContent = "数据更新于 " + SITE_UPDATED_AT;
    up.hidden = false;
    document.getElementById("footDate").textContent = SITE_UPDATED_AT;
  }

  /* ---------- 实时状态叠加（assets/live.json 由 GitHub Actions 定时抓取） ---------- */
  function applyLive(live) {
    if (!live || !live.stations) return;
    var stamp = document.getElementById("liveStamp");
    if (stamp && live.generatedAt) {
      stamp.textContent = "状态抓取于 " + live.generatedAt.replace("T", " ").slice(0, 16);
      stamp.hidden = false;
    }
    document.querySelectorAll("#cards article").forEach(function (cardEl) {
      var name = cardEl.querySelector(".card-name").textContent;
      var e = live.stations[name];
      var badges = cardEl.querySelector(".card-badges");
      if (!e || !badges || cardEl.querySelector(".badge.live")) return;

      var map;
      if (e.status === "online") map = ["live-on", "在线", "接口正常响应"];
      else if (e.status === "blocked") map = ["live-unknown", "拦截", "被防护墙拦截，无法验证真实状态"];
      else if ((e.fails || 0) >= 4) map = ["live-off", "多次不可达", "连续 " + e.fails + " 次抓取失败"];
      else map = ["live-weak", "暂不可达", "最近一次抓取失败"];

      var b = document.createElement("span");
      b.className = "badge live " + map[0];
      b.textContent = "● " + map[1];
      b.title = map[2] + "（抓取于 " + (e.checkedAt || "?").replace("T", " ").slice(0, 16) +
        (e.note ? "，" + e.note : "") + "）";
      badges.insertBefore(b, badges.firstChild);

      // 实时模型列表（抓取到公开报价时替换静态标签）
      if (Array.isArray(e.models) && e.models.length) {
        var tags = cardEl.querySelector(".tags");
        if (!tags) return;
        var cap = 24;
        var html = e.models.slice(0, cap).map(function (m) {
          return '<span class="tag ' + tagClass(m) + '" title="实时抓取">' + esc(m) + "</span>";
        }).join("");
        if (e.models.length > cap) {
          html += '<span class="tag tag-misc">…共 ' + e.models.length + " 个</span>";
        }
        tags.innerHTML = html + '<span class="live-src">⚡ 实时抓取</span>';
      }
    });
  }

  fetch("assets/live.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(applyLive)
    .catch(function () { /* live.json 缺失或解析失败时保持静态展示 */ });

  render();
})();
