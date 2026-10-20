// Mind garden: stacked notes, backlinks, previews, and editing saved to /api/notes.
(() => {
  // ---------------- state ----------------
  let DATA = null;
  let stack = [];
  let editing = null;   // slug being edited (or "__new__" for a new note)
  let draftTitle = "";  // title prefilled for a new note
  let password = "";
  let showSignIn = false;
  let readOnlyCopy = false; // true when the saving service isn't running (e.g. a drag-and-drop upload)
  const app = document.getElementById("app");

  const getKey = () => { try { return localStorage.getItem("garden-password") || ""; } catch { return ""; } };
  const setKey = (v) => { try { v ? localStorage.setItem("garden-password", v) : localStorage.removeItem("garden-password"); } catch {} };
  const canEdit = () => Boolean(password);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => s.trim().toLowerCase().replace(/[\s_]+/g, " ");
  const findSlug = (title) => {
    const k = norm(title.split("#")[0]);
    return Object.keys(DATA.notes).find((s) => norm(DATA.notes[s].title) === k || norm(s) === k);
  };
  const makeSlug = (title) => {
    const base = title.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_.~-]/g, "") || "note";
    let slug = base, n = 2;
    while (DATA.notes[slug]) slug = base + "_" + n++;
    return slug;
  };

  // ---------------- markdown with [[links]] ----------------
  const md = new marked.Marked({ gfm: true, breaks: true });
  md.use({
    extensions: [{
      name: "wikilink", level: "inline",
      start: (src) => src.indexOf("[["),
      tokenizer(src) {
        const m = /^\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/.exec(src);
        if (m) return { type: "wikilink", raw: m[0], target: m[1].trim(), label: (m[2] || m[1]).trim() };
      },
      renderer(t) {
        const slug = findSlug(t.target);
        return slug
          ? `<a class="note" href="?stackedNotes=${encodeURIComponent(slug)}" data-slug="${esc(slug)}">${esc(t.label)}</a>`
          : `<span class="missing" data-title="${esc(t.target)}" title="No note called “${esc(t.target)}” yet">${esc(t.label)}</span>`;
      },
    }],
    renderer: {
      link(href, title, text) { return `<a href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`; },
      html(html) { return esc(typeof html === "object" ? html.text : html); },
    },
  });
  const render = (text) => md.parse(text || "");

  const linksIn = (body) => [...(body || "").replace(/```[\s\S]*?```|`[^`\n]*`/g, "").matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g)].map((m) => m[1]);

  function backlinksOf(slug) {
    return Object.entries(DATA.notes)
      .filter(([s, n]) => s !== slug && linksIn(n.body).some((t) => findSlug(t) === slug))
      .map(([s, n]) => {
        const blocks = n.body.split(/\n\s*\n|\n(?=\s*(?:[-*+]|\d+\.)\s)/)
          .filter((b) => linksIn(b).some((t) => findSlug(t) === slug)).slice(0, 2);
        const ctx = blocks.map((b) => render(b.replace(/^\s*(?:[-*+]|\d+\.)\s+|^#+\s+/gm, "")))
          .join("").replace(/<a\b[^>]*>/g, '<span class="ref">').replace(/<\/a>/g, "</span>")
          .replace(/<span class="missing"[^>]*>/g, '<span class="ref">');
        return { slug: s, title: n.title, ctx };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function noteHtml(slug) {
    const n = DATA.notes[slug];
    const bl = backlinksOf(slug);
    return `<div class="page"><h1>${esc(n.title)}</h1>${n.body.trim() ? render(n.body) : '<p class="empty">This note is empty.</p>'}` +
      (bl.length ? `<section class="backlinks"><h3>Links to this note</h3>${bl.map((b) =>
        `<div class="backlink"><a class="note" href="?stackedNotes=${encodeURIComponent(b.slug)}" data-slug="${esc(b.slug)}">${esc(b.title)}</a><div class="ctx">${b.ctx}</div></div>`).join("")}</section>` : "") +
      `</div>`;
  }

  function editorHtml(slug) {
    const isNew = slug === "__new__";
    const n = isNew ? { title: draftTitle, body: "" } : DATA.notes[slug];
    const others = Object.entries(DATA.notes).filter(([s]) => s !== slug).sort((a, b) => a[1].title.localeCompare(b[1].title));
    const site = slug === DATA.home
      ? `<label for="ed-site">Garden name</label><input id="ed-site" class="title-input" style="font-size:1.1em" value="${esc(DATA.siteTitle)}">`
      : "";
    return `<form class="editor" data-slug="${esc(slug)}">${site}
      <label for="ed-title">Title</label>
      <input id="ed-title" class="title-input" value="${esc(n.title)}" placeholder="What's the idea?" required>
      <label for="ed-body">Note</label>
      <textarea id="ed-body" placeholder="Write your note here.">${esc(n.body)}</textarea>
      <div class="linker"><label for="ed-link" style="text-transform:none;letter-spacing:0;font-size:13.5px">Insert a link to</label>
        <select id="ed-link"><option value="">choose a note&hellip;</option>${others.map(([, o]) => `<option>${esc(o.title)}</option>`).join("")}</select></div>
      <div class="help">Tip: <code>[[Note title]]</code> links to another note. <code>**bold**</code>, <code>*italic*</code>, and <code>- </code> for lists.</div>
      <div class="actions">
        <button type="submit" class="btn primary">Save</button>
        <button type="button" class="btn" data-act="cancel">Cancel</button>
        <span class="spacer"></span>
        ${!isNew && slug !== DATA.home ? '<button type="button" class="btn danger" data-act="delete">Delete note</button>' : ""}
      </div>
      <div class="status" role="status"></div>
    </form>`;
  }

  // ---------------- drawing ----------------
  function drawShell() {
    app.innerHTML = `<header class="bar">
        <button class="name" data-act="home"></button>
        <span class="tip">Click a link to open it beside this note &middot; hover to preview</span>
        <span class="account"></span>
      </header>
      <main id="stack"></main>
      <div class="preview" hidden></div>`;
  }

  function drawBar() {
    app.querySelector(".name").textContent = DATA.siteTitle;
    document.title = stack.length > 1 && DATA.notes[stack.at(-1)] ? `${DATA.notes[stack.at(-1)].title} · ${DATA.siteTitle}` : DATA.siteTitle;
    const account = app.querySelector(".account");
    if (readOnlyCopy) {
      account.innerHTML = `<span class="msg">Read-only copy: saving isn't set up on this site. See the README for the GitHub setup.</span>`;
    } else if (canEdit()) {
      account.innerHTML = `<span class="signin"><button class="btn primary" data-act="new">New note</button>
        <button class="btn" data-act="backup">Download backup</button>
        <button class="btn" data-act="signout">Sign out</button></span>`;
    } else if (showSignIn) {
      account.innerHTML = `<form class="signin" data-form="signin">
        <label for="pw" class="msg" style="color:var(--stem)">Password</label>
        <input id="pw" type="password" autocomplete="current-password" required>
        <button class="btn primary" type="submit">Sign in</button>
        <button class="btn" type="button" data-act="signin-cancel">Cancel</button>
        <span class="msg" role="status"></span></form>`;
      account.querySelector("#pw").focus();
    } else {
      account.innerHTML = `<button class="btn" data-act="signin">Sign in</button>`;
    }
  }

  function draw() {
    const stackEl = app.querySelector("#stack");
    const kept = [...stackEl.children];
    stack.forEach((slug, i) => {
      const key = slug + (editing === slug ? ":edit" : "") + (canEdit() ? ":w" : "") + ":" + DATA.updatedAt;
      if (kept[i] && kept[i].dataset.key === key) return;
      const pane = document.createElement("article");
      pane.className = "pane";
      pane.dataset.slug = slug;
      pane.dataset.key = key;
      const title = slug === "__new__" ? "New note" : DATA.notes[slug].title;
      const tools = editing === slug ? "" :
        (canEdit() ? '<button data-act="edit">Edit</button>' : "") + (i > 0 ? '<button data-act="close" aria-label="Close note">Close</button>' : "");
      pane.innerHTML = `<div class="spine">${esc(title)}</div><div class="tools">${tools}</div>` +
        `<div class="scroll">${editing === slug ? editorHtml(slug) : noteHtml(slug)}</div>`;
      if (kept[i]) stackEl.replaceChild(pane, kept[i]); else stackEl.appendChild(pane);
    });
    [...stackEl.children].slice(stack.length).forEach((p) => p.remove());
    [...stackEl.children].forEach((p, i) => p.style.setProperty("--i", i));
    stackEl.querySelectorAll("a.note").forEach((a) => a.classList.toggle("open", stack.includes(a.dataset.slug)));
    app.classList.toggle("can-edit", canEdit());
    drawBar();
    updateFolds();
  }

  // ---------------- the address bar mirrors the open notes ----------------
  function stackFromUrl() {
    const extra = new URLSearchParams(location.search).getAll("stackedNotes").filter((s) => DATA.notes[s] && s !== DATA.home);
    return [DATA.home, ...extra];
  }
  function pushUrl() {
    const p = new URLSearchParams();
    stack.filter((s) => DATA.notes[s]).slice(1).forEach((s) => p.append("stackedNotes", s));
    const qs = p.toString();
    const url = location.pathname + (qs ? "?" + qs : "");
    if (url !== location.pathname + location.search) history.pushState(null, "", url);
  }

  // ---------------- navigation ----------------
  const stackEl = () => app.querySelector("#stack");
  const spineW = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--spine")) || 0;

  function scrollToPane(i, behavior = "smooth") {
    const el = stackEl(), pane = el.children[i];
    if (!pane) return;
    const w = pane.offsetWidth;
    const min = Math.max(0, (i + 1) * w - el.clientWidth);
    const max = i * (w - spineW());
    el.scrollTo({ left: Math.min(Math.max(el.scrollLeft, min), max), behavior });
  }

  function flash(i) {
    const p = stackEl().children[i];
    p.classList.add("flash");
    setTimeout(() => p.classList.remove("flash"), 500);
  }

  function open(slug, from) {
    const at = stack.indexOf(slug);
    if (at !== -1) { scrollToPane(at); flash(at); return; }
    if (editing && stack.indexOf(editing) > from) editing = null;
    stack = [...stack.slice(0, from + 1), slug];
    draw();
    pushUrl();
    scrollToPane(stack.length - 1);
  }

  function close(i) {
    if (i === 0) return;
    if (stack[i] === editing) editing = null;
    stack.splice(i, 1);
    draw();
    pushUrl();
  }

  function startNew(title, from) {
    draftTitle = title || "";
    editing = "__new__";
    stack = [...stack.filter((s) => s !== "__new__").slice(0, from + 1), "__new__"];
    draw();
    scrollToPane(stack.length - 1);
    setTimeout(() => app.querySelector(draftTitle ? "#ed-body" : "#ed-title")?.focus(), 350);
  }

  let ticking = false;
  function updateFolds() {
    const panes = [...stackEl().children], spine = spineW();
    panes.forEach((p, i) => {
      const r = p.getBoundingClientRect();
      const next = panes[i + 1] ? panes[i + 1].getBoundingClientRect().left : Infinity;
      p.classList.toggle("obscured", next - r.left <= spine + 1);
      p.classList.toggle("overlapped", next < r.right - 1);
    });
    ticking = false;
  }

  // ---------------- talking to the server ----------------
  async function saveGarden(next) {
    let res;
    try {
      res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-garden-password": password, "x-garden-base": DATA.updatedAt || "" },
        body: JSON.stringify(next),
      });
    } catch {
      return "Couldn't reach the site. Check your connection, then press Save again.";
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { password = ""; setKey(""); }
    if (!res.ok) return body.error || "Couldn't save. Try again in a moment.";
    DATA = body;
    return null;
  }

  function renameLinks(notes, oldTitle, newTitle) {
    const pattern = new RegExp("\\[\\[\\s*" + oldTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s_]+/g, "[\\s_]+") + "\\s*(\\|[^\\]]*)?\\]\\]", "gi");
    for (const n of Object.values(notes)) n.body = n.body.replace(pattern, (_, alias) => `[[${newTitle}${alias || ""}]]`);
  }

  async function submit(form) {
    const status = form.querySelector(".status");
    const title = form.querySelector("#ed-title").value.trim();
    const body = form.querySelector("#ed-body").value;
    const slug = form.dataset.slug;
    if (!title) { status.textContent = "Give the note a title first."; return; }
    const clash = findSlug(title);
    if (clash && clash !== slug) { status.textContent = `There's already a note called “${DATA.notes[clash].title}”. Pick a different title.`; return; }

    const next = JSON.parse(JSON.stringify(DATA));
    const site = form.querySelector("#ed-site");
    if (site && site.value.trim()) next.siteTitle = site.value.trim();
    let savedSlug = slug;
    if (slug === "__new__") {
      savedSlug = makeSlug(title);
      next.notes[savedSlug] = { title, body };
    } else {
      if (next.notes[slug].title !== title) renameLinks(next.notes, next.notes[slug].title, title);
      next.notes[slug] = { title, body };
    }

    form.querySelectorAll("button").forEach((b) => (b.disabled = true));
    status.style.color = "var(--stem)";
    status.textContent = "Saving…";
    const error = await saveGarden(next);
    if (error) {
      status.style.color = "";
      status.textContent = error;
      form.querySelectorAll("button").forEach((b) => (b.disabled = false));
      if (!canEdit()) drawBar();
      return;
    }
    editing = null;
    stack = stack.map((s) => (s === "__new__" ? savedSlug : s));
    draw();
    pushUrl();
  }

  async function remove(form, btn) {
    if (!btn.classList.contains("armed")) {
      btn.classList.add("armed");
      btn.textContent = "Click again to delete";
      setTimeout(() => { btn.classList.remove("armed"); btn.textContent = "Delete note"; }, 4000);
      return;
    }
    const slug = form.dataset.slug;
    const next = JSON.parse(JSON.stringify(DATA));
    delete next.notes[slug];
    btn.disabled = true;
    const error = await saveGarden(next);
    if (error) { form.querySelector(".status").textContent = error; btn.disabled = false; return; }
    editing = null;
    stack = stack.filter((s) => s !== slug);
    draw();
    pushUrl();
  }

  async function signIn(form) {
    const msg = form.querySelector(".msg[role=status]");
    const pw = form.querySelector("#pw").value;
    msg.textContent = "";
    let res;
    try {
      res = await fetch("/api/login", { method: "POST", headers: { "x-garden-password": pw } });
    } catch {
      msg.textContent = "Couldn't reach the site.";
      return;
    }
    if (!res.ok) { msg.textContent = (await res.json().catch(() => ({}))).error || "Couldn't sign in."; return; }
    password = pw;
    setKey(pw);
    showSignIn = false;
    draw();
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mind-garden-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------- hover previews ----------------
  let timer = null, lit = null;
  function preview(link) {
    const box = app.querySelector(".preview");
    const at = stack.indexOf(link.dataset.slug);
    if (at !== -1) { lit = stackEl().children[at]; lit.classList.add("flash"); return; }
    box.innerHTML = noteHtml(link.dataset.slug);
    box.hidden = false;
    const r = link.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), innerWidth - box.offsetWidth - 8);
    const top = r.bottom + 8 + box.offsetHeight < innerHeight ? r.bottom + 8 : Math.max(8, r.top - box.offsetHeight - 8);
    box.style.left = left + "px";
    box.style.top = top + "px";
  }
  function unpreview() {
    clearTimeout(timer);
    app.querySelector(".preview").hidden = true;
    if (lit) lit.classList.remove("flash");
    lit = null;
  }

  // ---------------- events ----------------
  function bind() {
    app.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      const pane = e.target.closest(".pane");
      const i = pane ? [...stackEl().children].indexOf(pane) : -1;
      if (act === "home") { editing = null; stack = [DATA.home]; draw(); pushUrl(); scrollToPane(0); return; }
      if (act === "new") { startNew("", stack.length - 1); return; }
      if (act === "signin") { showSignIn = true; drawBar(); return; }
      if (act === "signin-cancel") { showSignIn = false; drawBar(); return; }
      if (act === "signout") { password = ""; setKey(""); editing = null; stack = stack.filter((s) => DATA.notes[s]); draw(); return; }
      if (act === "backup") { downloadBackup(); return; }
      if (act === "close") { close(i); return; }
      if (act === "edit") { editing = stack[i]; draw(); setTimeout(() => app.querySelector("#ed-body")?.focus(), 50); return; }
      if (act === "cancel") {
        if (editing === "__new__") { editing = null; close(i); } else { editing = null; draw(); }
        return;
      }
      if (act === "delete") { remove(e.target.closest("form"), e.target.closest("button")); return; }
      if (e.target.closest(".spine")) { scrollToPane(i); return; }

      const missing = e.target.closest(".missing");
      if (missing && canEdit() && !e.target.closest(".backlinks")) { startNew(missing.dataset.title, i); return; }

      const link = e.target.closest("a.note") || e.target.closest(".backlink")?.querySelector("a.note");
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      unpreview();
      open(link.dataset.slug, i);
    });

    app.addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.target.dataset.form === "signin") signIn(e.target); else submit(e.target);
    });

    app.addEventListener("change", (e) => {
      if (e.target.id !== "ed-link" || !e.target.value) return;
      const ta = app.querySelector("#ed-body");
      const ins = `[[${e.target.value}]]`;
      const at = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, at) + ins + ta.value.slice(ta.selectionEnd ?? at);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = at + ins.length;
      e.target.value = "";
    });

    app.addEventListener("mouseover", (e) => {
      const link = e.target.closest("#stack a.note");
      if (!link || link.contains(e.relatedTarget)) return;
      clearTimeout(timer);
      timer = setTimeout(() => preview(link), 350);
    });
    app.addEventListener("mouseout", (e) => {
      const link = e.target.closest("#stack a.note");
      if (link && !link.contains(e.relatedTarget)) unpreview();
    });
    app.addEventListener("scroll", () => {
      unpreview();
      if (!ticking) requestAnimationFrame(updateFolds);
      ticking = true;
    }, { capture: true, passive: true });
    addEventListener("resize", updateFolds);
    addEventListener("popstate", () => {
      editing = null;
      stack = stackFromUrl();
      draw();
      scrollToPane(stack.length - 1);
    });
    addEventListener("beforeunload", (e) => { if (editing) e.preventDefault(); });
  }

  // ---------------- start ----------------
  async function start() {
    try {
      const res = await fetch("/api/notes", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      DATA = await res.json();
    } catch {
      // No saving service: show the starting notes so the site still works for reading.
      try {
        DATA = (await import("./netlify/functions/seed.mjs")).default;
        readOnlyCopy = true;
      } catch {
        app.innerHTML = '<p class="loading">Couldn\'t load the notes. Check your connection and reload the page.</p>';
        return;
      }
    }
    password = readOnlyCopy ? "" : getKey();
    stack = stackFromUrl();
    drawShell();
    draw();
    bind();
    scrollToPane(stack.length - 1, "instant");
  }

  start();
})();
