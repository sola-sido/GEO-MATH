(function () {
  const SHOW = window.SHOW;
  if (!SHOW) return;

  const LAYOUTS = new Set([
    "span-7", "span-5", "span-6", "span-4", "span-8", "span-12", "center-6", "center-8"
  ]);
  const RATIOS = {
    "4 / 5": [800, 1000],
    "1 / 1": [1000, 1000],
    "5 / 4": [1000, 800],
    "16 / 9": [1280, 720]
  };

  const roomsEl = document.querySelector("#rooms");
  const viewer = document.querySelector("#viewer");
  const viewerArt = document.querySelector("[data-viewer-art]");
  const plaque = document.querySelector("[data-plaque]");
  const topbar = document.querySelector(".topbar");
  const foyer = document.querySelector("#foyer");

  const SHARE_URL = String(window.SHARE_URL || "").trim();

  let index = -1;
  let lastFocus = null;
  let sharedNotes = null;
  let sharedLikes = null;
  let shareChain = Promise.resolve();

  document.title = SHOW.title + " — 온라인 전시";
  setText("[data-title]", SHOW.title);
  setText("[data-lead]", SHOW.lead);

  renderRooms();
  bindLikes();
  bindGuestbook();
  bindViewer();
  bindScroll();
  openFromHash();
  startShare();

  function setText(sel, value) {
    const node = document.querySelector(sel);
    if (node) node.textContent = value;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function renderRooms() {
    const known = new Set(SHOW.rooms.map(function (room) { return room.id; }));
    const groups = SHOW.rooms.map(function (room) {
      return {
        room: room,
        works: SHOW.works.filter(function (work) { return work.room === room.id; })
      };
    });
    const extras = SHOW.works.filter(function (work) { return !known.has(work.room); });
    if (extras.length) {
      groups.push({
        room: {
          id: "other",
          index: "IV",
          name: "그 밖의 작품",
          line: "전시실 이름이 없는 작품입니다. room 값을 sine, cosine, compose 중 하나로 맞추면 해당 방으로 이동합니다."
        },
        works: extras
      });
    }

    const hasSample = SHOW.works.some(function (work) { return work.sample; });
    roomsEl.innerHTML = groups.map(function (group, groupIndex) {
      const note = groupIndex === 0 && hasSample
        ? '<p class="sample-note">지금 걸린 그림은 삼각함수 식으로 그린 예시입니다. 학생 작품 파일을 <code>images</code> 폴더에 넣고 <code>works.js</code>의 image에 경로를 적으면, 이 문장은 사라지고 실제 전시가 됩니다.</p>'
        : "";
      const cards = group.works.map(renderCard).join("");
      return (
        '<section class="room" id="' + esc(group.room.id) + '">' +
          '<div class="room-inner">' +
            note +
            '<header class="room-head">' +
              '<div>' +
                '<p class="room-index">' + esc(group.room.index) + "</p>" +
                "<h2>" + esc(group.room.name) + "</h2>" +
              "</div>" +
              '<p class="room-line">' + esc(group.room.line) + "</p>" +
            "</header>" +
            '<div class="wall catalog">' + cards + "</div>" +
          "</div>" +
        "</section>"
      );
    }).join("");

    roomsEl.querySelectorAll("[data-open]").forEach(function (button) {
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-open");
        const next = SHOW.works.findIndex(function (work) { return work.id === id; });
        if (next >= 0) openAt(next);
      });
    });

    roomsEl.querySelectorAll("img[data-image]").forEach(function (img) {
      img.addEventListener("error", function () {
        const missing = document.createElement("span");
        missing.className = "missing";
        missing.textContent = "이미지를 찾지 못했습니다. 파일 경로를 확인해 주세요.";
        img.replaceWith(missing);
      });
    });
  }

  function renderCard(work) {
    const layout = LAYOUTS.has(work.layout) ? work.layout : "span-6";
    const ratio = RATIOS[work.ratio] ? work.ratio : "4 / 5";
    const tone = work.tone === "dark" ? " dark" : "";
    const who = work.student ? '<span class="cap-who">' + esc(work.student) + "</span>" : "";
    const fn = work.fn ? '<span class="cap-fn">' + esc(work.fn) + "</span>" : "";
    const title = work.title && work.title !== work.no
      ? '<span class="cap-title">' + esc(work.title) + "</span>"
      : "";
    return (
      '<article class="hang ' + layout + '">' +
        '<button type="button" class="piece' + tone + '" data-open="' + esc(work.id) + '">' +
          '<span class="spot" aria-hidden="true"></span>' +
          '<span class="frame">' +
            '<span class="mat">' +
              '<span class="art" style="--r:' + ratio + '">' + artworkHTML(work, true) + "</span>" +
            "</span>" +
          "</span>" +
        "</button>" +
        '<div class="meta">' +
          '<span class="cap">' +
            '<span class="cap-no">' + esc(work.no) + "</span>" +
            title +
            who +
            fn +
          "</span>" +
          likeButton(work.id) +
        "</div>" +
      "</article>"
    );
  }

  function likeButton(id) {
    const data = readLikes();
    const on = !!data.mine[id];
    const count = data.counts[id] || 0;
    return (
      '<button type="button" class="like" data-like="' + esc(id) + '" aria-pressed="' + (on ? "true" : "false") + '" aria-label="하트">' +
        '<span class="like-mark" aria-hidden="true">' + (on ? "♥" : "♡") + "</span>" +
        '<span class="like-count">' + count + "</span>" +
      "</button>"
    );
  }

  function readLikes() {
    let mine = {};
    let counts = {};
    try {
      const data = JSON.parse(localStorage.getItem("wave-gallery-likes") || "");
      if (data && data.mine) mine = data.mine;
      if (data && data.counts) counts = data.counts;
    } catch (error) {}
    if (shareOn()) return { counts: sharedLikes || {}, mine: mine };
    return { counts: counts, mine: mine };
  }

  function writeLikes(data) {
    const stored = shareOn()
      ? { counts: {}, mine: data.mine }
      : { counts: data.counts, mine: data.mine };
    localStorage.setItem("wave-gallery-likes", JSON.stringify(stored));
    if (shareOn()) sharedLikes = data.counts;
  }

  function paintLikes() {
    const data = readLikes();
    document.querySelectorAll("[data-like]").forEach(function (button) {
      const id = button.getAttribute("data-like");
      const on = !!data.mine[id];
      const count = data.counts[id] || 0;
      button.setAttribute("aria-pressed", on ? "true" : "false");
      const mark = button.querySelector(".like-mark");
      const num = button.querySelector(".like-count");
      if (mark) mark.textContent = on ? "♥" : "♡";
      if (num) num.textContent = String(count);
    });
  }

  function toggleLike(id) {
    const data = readLikes();
    const delta = data.mine[id] ? -1 : 1;
    if (data.mine[id]) {
      data.mine[id] = false;
      data.counts[id] = Math.max(0, (data.counts[id] || 1) - 1);
    } else {
      data.mine[id] = true;
      data.counts[id] = (data.counts[id] || 0) + 1;
    }
    writeLikes(data);
    paintLikes();
    if (shareOn()) {
      pushShare({ op: "like", id: id, delta: delta });
    }
  }

  function bindLikes() {
    document.addEventListener("click", function (event) {
      const button = event.target.closest("[data-like]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      toggleLike(button.getAttribute("data-like"));
    });
  }

  function artworkHTML(work, lazy) {
    if (work.image) {
      return '<img data-image ' + (lazy ? 'loading="lazy" decoding="async" ' : '') + 'src="' + esc(work.image) + '" alt="' + esc(work.title) + '">';
    }
    return renderArt(work);
  }

  function renderArt(work) {
    const ratio = RATIOS[work.ratio] ? work.ratio : "4 / 5";
    const size = RATIOS[ratio];
    const w = size[0];
    const h = size[1];
    const art = work.art || { mode: "ink", paper: "#f4efe6", ink: "#1a2744" };
    const body = draw(art, w, h);
    return (
      '<svg viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" overflow="hidden" role="img" aria-label="' + esc(work.title) + '">' +
        '<rect width="' + w + '" height="' + h + '" fill="' + esc(art.paper || "#f4efe6") + '"/>' +
        body +
      "</svg>"
    );
  }

  function draw(art, w, h) {
    switch (art.mode) {
      case "strata": return strata(art, w, h);
      case "tide": return tide(art, w, h);
      case "pair": return pair(art, w, h);
      case "echo": return echo(art, w, h);
      case "breath": return breath(art, w, h);
      case "lissajous": return lissajous(art, w, h);
      case "rings": return rings(art, w, h);
      default: return ink(art, w, h);
    }
  }

  function wavePath(w, yOf) {
    let d = "";
    for (let x = 0; x <= w; x += 8) {
      d += (x === 0 ? "M" : "L") + x.toFixed(1) + " " + yOf(x).toFixed(1) + " ";
    }
    return d;
  }

  function ink(art, w, h) {
    const lines = art.lines || 48;
    const amp = (art.amp || 0.04) * h;
    const freq = art.freq || 2;
    const weight = art.weight || 1.1;
    let body = "";
    for (let i = 0; i < lines; i++) {
      const yBase = h * 0.08 + h * 0.84 * (i / Math.max(1, lines - 1));
      const d = wavePath(w, function (x) {
        const t = (x / w) * Math.PI * 2;
        return yBase
          + Math.sin(t * freq + (art.phase || 0) + i * 0.08) * amp
          + Math.sin(t * freq * 2.5 + i * 0.3) * amp * 0.18;
      });
      const opacity = (0.16 + (i % 5) * 0.08).toFixed(2);
      body += '<path d="' + d + '" fill="none" stroke="' + esc(art.ink || "#1a2744") + '" stroke-width="' + weight + '" opacity="' + opacity + '"/>';
    }
    return body;
  }

  function strata(art, w, h) {
    const colors = art.colors || ["#1c3d52", "#c4784a"];
    const bands = Math.max(colors.length, 6);
    const amp = (art.amp || 0.04) * h;
    const freq = art.freq || 1.2;
    let body = "";
    for (let i = 0; i < bands; i++) {
      const y0 = (h / bands) * i - h * 0.04;
      const y1 = (h / bands) * (i + 1) + h * 0.08;
      let d = "";
      for (let x = 0; x <= w; x += 10) {
        const t = (x / w) * Math.PI * 2 * freq + (art.phase || 0) + i * 0.35;
        const y = y0 + Math.sin(t) * amp;
        d += (x === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
      }
      for (let x = w; x >= 0; x -= 10) {
        const t = (x / w) * Math.PI * 2 * freq + (art.phase || 0) + i * 0.35 + 0.5;
        const y = y1 + Math.sin(t) * amp * 0.75;
        d += "L" + x.toFixed(1) + " " + y.toFixed(1) + " ";
      }
      d += "Z";
      body += '<path d="' + d + '" fill="' + esc(colors[i % colors.length]) + '" opacity="0.92"/>';
    }
    return body;
  }

  function tide(art, w, h) {
    const colors = art.colors || ["#1d4a3e", "#c6a36e"];
    function fill(level, freq, phase, ampScale) {
      let d = "M 0 " + h + " ";
      for (let x = 0; x <= w; x += 8) {
        const t = (x / w) * Math.PI * 2;
        const y = h * level
          + Math.sin(t * freq + phase) * (art.amp || 0.07) * h * ampScale
          + Math.sin(t * freq * 2 + phase) * (art.amp || 0.07) * h * 0.28;
        d += "L " + x.toFixed(1) + " " + y.toFixed(1) + " ";
      }
      return d + "L " + w + " " + h + " Z";
    }
    return (
      '<path d="' + fill(art.level || 0.58, art.freq || 1.2, art.phase || 0, 1) + '" fill="' + esc(colors[0]) + '"/>' +
      '<path d="' + fill((art.level || 0.58) + 0.1, (art.freq || 1.2) * 1.25, (art.phase || 0) + 1.1, 0.72) + '" fill="' + esc(colors[1]) + '" opacity="0.9"/>'
    );
  }

  function brush(art, w, h, phase, color) {
    let body = "";
    const yBase = h * 0.5;
    const amp = (art.amp || 0.12) * h;
    for (let k = 0; k < 14; k++) {
      const d = wavePath(w, function (x) {
        const t = (x / w) * Math.PI * 2 * (art.freq || 1.4);
        return yBase + (k - 7) * 1.3 + Math.sin(t + phase) * amp;
      });
      body += '<path d="' + d + '" fill="none" stroke="' + esc(color) + '" stroke-width="2.2" opacity="0.13"/>';
    }
    return body;
  }

  function pair(art, w, h) {
    const colors = art.colors || ["#8d3d2e", "#1d3557"];
    return brush(art, w, h, art.phase || 0, colors[0]) + brush(art, w, h, (art.phase || 0) + (art.shift || 1), colors[1]);
  }

  function echo(art, w, h) {
    const lines = art.lines || 24;
    const amp = (art.amp || 0.05) * h;
    let body = "";
    for (let i = 0; i < lines; i++) {
      const yBase = h * 0.12 + h * 0.76 * (i / Math.max(1, lines - 1));
      const d1 = wavePath(w, function (x) {
        const t = (x / w) * Math.PI * 2 * (art.freq || 2);
        return yBase + Math.sin(t + (art.phase || 0) + i * 0.05) * amp;
      });
      const d2 = wavePath(w, function (x) {
        const t = (x / w) * Math.PI * 2 * (art.freq || 2);
        return yBase + Math.sin(t + (art.phase || 0) + (art.shift || 1.57) + i * 0.05) * amp;
      });
      body += '<path d="' + d2 + '" fill="none" stroke="' + esc(art.ghost || "#c9844a") + '" stroke-width="' + (art.weight || 1.2) + '" opacity="0.28"/>';
      body += '<path d="' + d1 + '" fill="none" stroke="' + esc(art.ink || "#243044") + '" stroke-width="' + (art.weight || 1.2) + '" opacity="0.72"/>';
    }
    return body;
  }

  function breath(art, w, h) {
    const lines = art.lines || 30;
    let body = "";
    for (let i = 0; i < lines; i++) {
      const yBase = h * 0.1 + h * 0.8 * (i / Math.max(1, lines - 1));
      const d = wavePath(w, function (x) {
        const t = (x / w) * Math.PI * 2;
        return yBase
          + Math.sin(t * (art.freq || 1) + (art.phase || 0) + i * 0.04) * (art.amp || 0.08) * h
          + Math.sin(t * (art.freq2 || 5) + i * 0.2) * (art.amp2 || 0.02) * h;
      });
      const color = i % 4 === 0 ? (art.ink2 || "#b85c38") : (art.ink || "#1d3557");
      body += '<path d="' + d + '" fill="none" stroke="' + esc(color) + '" stroke-width="' + (art.weight || 1.2) + '" opacity="' + (i % 4 === 0 ? "0.55" : "0.78") + '"/>';
    }
    return body;
  }

  function lissajous(art, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w * 0.34;
    const ry = h * 0.34;
    const turns = art.turns || 1;
    let d = "";
    const total = 1100;
    for (let i = 0; i <= total; i++) {
      const t = (i / total) * Math.PI * 2 * turns;
      const x = cx + Math.sin((art.a || 3) * t + (art.phase || 0)) * rx;
      const y = cy + Math.sin((art.b || 2) * t) * ry;
      d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    }
    return (
      '<path d="' + d + '" fill="none" stroke="' + esc(art.ink2 || art.ink || "#f0e2c4") + '" stroke-width="' + ((art.weight || 2) * 6) + '" opacity="0.14" stroke-linecap="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + esc(art.ink || "#f0e2c4") + '" stroke-width="' + (art.weight || 2) + '" opacity="0.95" stroke-linecap="round"/>'
    );
  }

  function rings(art, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const count = art.rings || 24;
    const freq = art.freq || 8;
    const amp = art.amp || 16;
    let body = "";
    const maxR = Math.min(w, h) * 0.46;
    for (let i = 0; i < count; i++) {
      const base = maxR * ((i + 1) / count);
      let d = "";
      for (let deg = 0; deg <= 360; deg += 3) {
        const rad = deg * Math.PI / 180;
        const rr = base + Math.sin(rad * freq + i * 0.35) * amp * (0.35 + i / count);
        const x = cx + Math.cos(rad) * rr;
        const y = cy + Math.sin(rad) * rr;
        d += (deg === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
      }
      d += "Z";
      const opacity = (0.28 + (i % 3) * 0.12).toFixed(2);
      body += '<path d="' + d + '" fill="none" stroke="' + esc(art.ink || "#2a241c") + '" stroke-width="1.15" opacity="' + opacity + '"/>';
    }
    return body;
  }

  function bindViewer() {
    viewer.querySelector("[data-close]").addEventListener("click", closeViewer);
    viewer.querySelector("[data-prev]").addEventListener("click", function () { step(-1); });
    viewer.querySelector("[data-next]").addEventListener("click", function () { step(1); });
    document.querySelectorAll("[data-enlarge]").forEach(function (button) {
      button.addEventListener("click", function () {
        openSingle(button.getAttribute("data-enlarge"), button.getAttribute("data-caption") || "과정");
      });
    });
    document.addEventListener("keydown", function (event) {
      if (viewer.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
        return;
      }
      if (index < 0) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      }
    });
    window.addEventListener("hashchange", openFromHash);
  }

  function openFromHash() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ""));
    const reserved = { foyer: true, note: true, works: true, process: true, guestbook: true };
    SHOW.rooms.forEach(function (room) { reserved[room.id] = true; });
    if (!id || reserved[id]) return;
    const next = SHOW.works.findIndex(function (work) { return work.id === id; });
    if (next >= 0) openAt(next);
  }

  function openSingle(src, title) {
    index = -1;
    lastFocus = document.activeElement;
    viewer.classList.add("single");
    viewerArt.innerHTML = '<div class="art viewer-art"><img src="' + esc(src) + '" alt="' + esc(title) + '"></div>';
    plaque.innerHTML = '<h3 id="viewer-title">' + esc(title) + "</h3>";
    viewer.hidden = false;
    document.body.classList.add("viewing");
    viewer.querySelector("[data-close]").focus();
  }

  function openAt(next) {
    viewer.classList.remove("single");
    index = (next + SHOW.works.length) % SHOW.works.length;
    const work = SHOW.works[index];
    if (!viewer.hasAttribute("hidden") === false) {
      lastFocus = document.activeElement;
    }
    viewerArt.innerHTML = '<div class="art viewer-art" style="--r:' + (RATIOS[work.ratio] ? work.ratio : "4 / 5") + '">' + artworkHTML(work) + "</div>";
    const img = viewerArt.querySelector("img[data-image]");
    if (img) {
      img.addEventListener("error", function () {
        const missing = document.createElement("span");
        missing.className = "missing";
        missing.textContent = "이미지를 찾지 못했습니다.";
        img.replaceWith(missing);
      });
    }
    plaque.innerHTML = plaqueHTML(work);
    viewer.hidden = false;
    document.body.classList.add("viewing");
    if (location.hash !== "#" + work.id) {
      history.replaceState(null, "", "#" + work.id);
    }
    document.title = work.title + " — " + SHOW.title;
    viewer.querySelector("[data-close]").focus();
  }

  function plaqueHTML(work) {
    const who = work.student
      ? '<p class="plaque-who"><span>만든 이</span> ' + esc(work.student) + "</p>"
      : "";
    const fn = work.fn ? '<p class="plaque-fn">' + esc(work.fn) + "</p>" : "";
    const params = work.params ? '<p class="plaque-params">' + esc(work.params) + "</p>" : "";
    const idea = work.idea
      ? '<div class="plaque-block"><p class="plaque-label">추상</p><p>' + esc(work.idea) + "</p></div>"
      : "";
    const prompt = work.prompt
      ? '<div class="plaque-block"><p class="plaque-label">그림으로 옮긴 문장</p><p>' + esc(work.prompt) + "</p></div>"
      : "";
    return (
      '<h3 id="viewer-title">' + esc(work.title || work.no) + "</h3>" +
      who + fn + params + idea + prompt +
      '<p class="plaque-move">' + (index + 1) + " / " + SHOW.works.length + "</p>" +
      likeButton(work.id)
    );
  }

  function step(delta) {
    if (!SHOW.works.length) return;
    openAt(index + delta);
  }

  function closeViewer() {
    if (viewer.hidden) return;
    const wasWork = index >= 0;
    viewer.hidden = true;
    viewer.classList.remove("single");
    document.body.classList.remove("viewing");
    index = -1;
    document.title = SHOW.title + " — 온라인 전시";
    if (wasWork && location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function shareKind() {
    if (SHARE_URL.indexOf("https://script.google.com/macros/") === 0) return "sheet";
    if (SHARE_URL.indexOf("https://crudcrud.com/api/") === 0) return "crud";
    return "";
  }

  function shareOn() {
    return shareKind() !== "";
  }

  function readLikeIds() {
    try {
      const data = JSON.parse(localStorage.getItem("wave-gallery-like-ids") || "{}");
      if (data && typeof data === "object") return data;
    } catch (error) {}
    return {};
  }

  function writeLikeIds(data) {
    localStorage.setItem("wave-gallery-like-ids", JSON.stringify(data));
  }

  function crudList(path) {
    return fetch(SHARE_URL + path, { cache: "no-store" }).then(function (res) {
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("list");
      return res.json();
    });
  }

  function fromCrud(notes, likes) {
    const counts = {};
    (Array.isArray(likes) ? likes : []).forEach(function (like) {
      if (!like || typeof like.work !== "string") return;
      counts[like.work] = (counts[like.work] || 0) + 1;
    });
    const list = (Array.isArray(notes) ? notes : []).map(function (note) {
      return {
        name: typeof note.name === "string" ? note.name : "",
        text: typeof note.text === "string" ? note.text : "",
        at: note.at || ""
      };
    }).filter(function (note) {
      return note.text.trim();
    });
    list.sort(function (a, b) {
      return String(b.at).localeCompare(String(a.at));
    });
    return { notes: list.slice(0, 200), likes: counts };
  }

  function pullCrud() {
    return Promise.all([crudList("/notes"), crudList("/likes")]).then(function (pair) {
      applyShare(fromCrud(pair[0], pair[1]));
    });
  }

  function pushCrud(body) {
    if (body.op === "note") {
      return fetch(SHARE_URL + "/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(body.name || "").slice(0, 20),
          text: String(body.text || "").slice(0, 140),
          at: new Date().toISOString()
        })
      }).then(function (res) {
        if (!res.ok) throw new Error("note");
        return pullCrud();
      });
    }
    if (body.op === "like" && /^w-[a-z0-9-]+$/.test(body.id || "")) {
      const ids = readLikeIds();
      if (body.delta > 0) {
        if (ids[body.id]) return pullCrud();
        return fetch(SHARE_URL + "/likes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work: body.id, at: new Date().toISOString() })
        }).then(function (res) {
          if (!res.ok) throw new Error("like");
          return res.json();
        }).then(function (saved) {
          ids[body.id] = saved._id;
          writeLikeIds(ids);
          return pullCrud();
        });
      }
      const likeId = ids[body.id];
      delete ids[body.id];
      writeLikeIds(ids);
      if (!likeId) return pullCrud();
      return fetch(SHARE_URL + "/likes/" + likeId, { method: "DELETE" }).then(function (res) {
        if (!res.ok && res.status !== 404) throw new Error("unlike");
        return pullCrud();
      });
    }
    return pullCrud();
  }

  function setGuestStatus(message) {
    const node = document.querySelector("#guest-status");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  function applyShare(data) {
    if (!data || !Array.isArray(data.notes) || !data.likes || typeof data.likes !== "object") {
      throw new Error("bad share");
    }
    sharedNotes = data.notes.filter(function (note) {
      return note && typeof note.text === "string" && note.text.trim();
    }).slice(0, 200);
    sharedLikes = data.likes;
    renderNotes();
    paintLikes();
  }

  function enqueueShare(task, report) {
    const next = shareChain.then(task, task);
    shareChain = next.then(function () {}, function () {});
    return next.then(function () {
      return true;
    }, function () {
      if (report) setGuestStatus("지금 저장하지 못했습니다. 잠시 후 다시 눌러 주세요.");
      return false;
    });
  }

  function pullShare() {
    return enqueueShare(function () {
      if (shareKind() === "crud") return pullCrud();
      return fetch(SHARE_URL + "?t=" + Date.now(), { method: "GET", cache: "no-store" })
        .then(function (res) { return res.json(); })
        .then(applyShare);
    }, false);
  }

  function pushShare(body) {
    return enqueueShare(function () {
      if (shareKind() === "crud") {
        return pushCrud(body).then(function () {
          setGuestStatus("");
        });
      }
      return fetch(SHARE_URL, {
        method: "POST",
        redirect: "follow",
        cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      }).then(function (res) { return res.json(); }).then(function (data) {
        applyShare(data);
        setGuestStatus("");
      });
    }, true);
  }

  function startShare() {
    if (!shareOn()) return;
    const lead = document.querySelector(".guest-lead");
    if (lead) lead.textContent = "감상은 남길 수 있습니다. 붙인 글은 모든 기기에서 보이고, 고치거나 떼지 않습니다.";
    pullShare();
    setInterval(function () {
      if (!document.hidden) pullShare();
    }, 20000);
  }

  function readNotes() {
    if (shareOn()) return sharedNotes || [];
    try {
      const notes = JSON.parse(localStorage.getItem("wave-gallery-notes") || "[]");
      return Array.isArray(notes) ? notes : [];
    } catch (error) {
      return [];
    }
  }

  function renderNotes() {
    const wall = document.querySelector("#guest-wall");
    if (!wall) return;
    const notes = readNotes();
    const colors = ["#fff3a3", "#ffd6e7", "#d9f2c8", "#d6ecff", "#ffe3c4"];
    if (!notes.length) {
      wall.innerHTML = '<p class="guest-empty">아직 붙은 포스트잇이 없습니다.</p>';
      return;
    }
    wall.innerHTML = notes.map(function (note, i) {
      const tilt = ((i * 7) % 7) - 3;
      const color = colors[i % colors.length];
      const name = note.name ? esc(note.name) : "익명";
      return (
        '<article class="sticky" style="--tilt:' + tilt + 'deg;background:' + color + '">' +
          '<p class="sticky-text">' + esc(note.text) + "</p>" +
          '<p class="sticky-name">' + name + "</p>" +
        "</article>"
      );
    }).join("");
  }

  function bindGuestbook() {
    const form = document.querySelector("#guest-form");
    renderNotes();
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const name = form.name.value.trim().slice(0, 20);
      const text = form.text.value.trim().slice(0, 140);
      if (!text) return;
      if (shareOn()) {
        const button = form.querySelector("button");
        if (button) button.disabled = true;
        pushShare({ op: "note", name: name, text: text }).then(function (ok) {
          if (button) button.disabled = false;
          if (ok) form.reset();
        });
        return;
      }
      const notes = readNotes();
      notes.unshift({ name: name, text: text, at: Date.now() });
      localStorage.setItem("wave-gallery-notes", JSON.stringify(notes.slice(0, 200)));
      form.reset();
      renderNotes();
    });
  }

  function bindScroll() {
    const links = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));
    const sections = function () {
      return links.map(function (link) {
        return document.querySelector(link.getAttribute("href"));
      }).filter(Boolean);
    };

    function onScroll() {
      if (foyer && topbar) {
        topbar.classList.toggle("solid", foyer.getBoundingClientRect().bottom < 72);
      }
      const list = sections();
      let current = list[0];
      const mark = window.innerHeight * 0.28;
      list.forEach(function (section) {
        if (section.getBoundingClientRect().top <= mark) current = section;
      });
      links.forEach(function (link) {
        const on = current && link.getAttribute("href") === "#" + current.id;
        if (on) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
})();
