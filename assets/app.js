/* XUSUO交换机 · 页面逻辑 */
(function () {
  "use strict";

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

  var state = { filter: "all", q: "" };

  var chipsBox = document.getElementById("chips");
  FILTERS.forEach(function (f) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (f.key === "all" ? " active" : "");
    b.textContent = f.label;
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

  document.getElementById("searchInput").addEventListener("input", function (e) {
    state.q = e.target.value.trim().toLowerCase();
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

  function cardHTML(s) {
    var tags = s.models.map(function (m) {
      return '<span class="tag">' + esc(m) + "</span>";
    }).join("");
    return (
      '<article class="card">' +
        '<div class="card-head">' +
          "<div>" +
            '<h3 class="card-name">' + esc(s.name) + "</h3>" +
            '<span class="card-domain">' + esc(s.domain) + "</span>" +
          "</div>" +
          '<div class="card-badges">' +
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

  function render() {
    var f = FILTERS.find(function (x) { return x.key === state.filter; }) || FILTERS[0];
    var list = STATIONS.filter(function (s) { return f.test(s); });
    if (state.q) {
      list = list.filter(function (s) {
        var hay = (s.name + " " + s.domain + " " + s.models.join(" ")).toLowerCase();
        return hay.indexOf(state.q) !== -1;
      });
    }
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
        function () { showToast("已复制链接"); },
        function () { fallbackCopy(url); }
      );
    } else {
      fallbackCopy(url);
    }
  });

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("已复制链接");
    } catch (err) {
      showToast("复制失败，请手动复制");
    }
    document.body.removeChild(ta);
  }

  /* ---------- 渲染工具卡片 ---------- */
  var toolBox = document.getElementById("toolCards");
  toolBox.innerHTML = TOOLS.map(function (t) {
    var link = t.url
      ? '<a class="tool-link" href="' + esc(t.url) + '" target="_blank" rel="noopener noreferrer">前往查看 ↗</a>'
      : '<span class="tool-link disabled">🚧 开发中，敬请期待</span>';
    return (
      '<div class="tool-card">' +
        '<div class="tool-head"><h3>' + esc(t.name) + '</h3><span class="badge">' + esc(t.tag) + "</span></div>" +
        "<p>" + esc(t.desc) + "</p>" + link +
      "</div>"
    );
  }).join("");

  /* ---------- 其它 ---------- */
  document.getElementById("statCount").textContent = STATIONS.length;
  document.getElementById("year").textContent = new Date().getFullYear();

  render();
})();
