// Общее для всех страниц: печать текста, запросы к серверу, вход и регистрация.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Адрес сервера (пусто, если сайт открыт с самого сервера). См. config.js.
  const BASE = (window.HT_API_BASE || '').replace(/\/$/, '');
  // Фото и скины с сервера открываем по полному адресу; data: и внешние ссылки не меняем.
  const asset = (src) => (typeof src === 'string' && src.startsWith('/uploads/') ? BASE + src : src);

  // ---------- Эффект печатания ----------

  // Запоминаем текст элемента и очищаем его, чтобы потом напечатать.
  function stash(el) {
    if (el.dataset.text === undefined) el.dataset.text = el.textContent;
    el.textContent = '';
  }

  async function typeText(el, text, speed = 28) {
    if (reduceMotion) {
      el.textContent = text;
      return;
    }
    el.classList.add('typing');
    let out = '';
    for (const ch of text) {
      out += ch;
      el.textContent = out;
      let pause = speed;
      if (/[.!?…]/.test(ch)) pause = 280;
      else if (/[,;:—]/.test(ch)) pause = speed * 4;
      await sleep(pause * (0.6 + Math.random() * 0.8)); // «живой» ритм печати
    }
    el.classList.remove('typing');
  }

  // Печатает по очереди все элементы [data-type] внутри узла.
  async function typeAll(root) {
    for (const el of root.querySelectorAll('[data-type]')) {
      if (el.dataset.done) continue;
      el.dataset.done = '1';
      await typeText(el, el.dataset.text ?? '', Number(el.dataset.speed) || 28);
    }
  }

  // Печать начинается, когда блок появляется в окне прокрутки.
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          typeAll(entry.target);
        }
      }, { threshold: 0.15 })
    : null;

  function watch(el) {
    if (io) io.observe(el);
    else typeAll(el);
  }

  document.querySelectorAll('[data-type]').forEach(stash);
  document.querySelectorAll('[data-typewriter]').forEach(watch);

  // ---------- Помощники ----------

  async function api(url, options = {}) {
    const init = { method: options.method || 'GET', credentials: 'include', headers: {} };
    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(BASE + url, init);
    let data = {};
    try {
      data = await res.json();
    } catch {
      // ответ без JSON — оставляем пустой объект
    }
    if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
  }

  function setMsg(el, text = '', ok = false) {
    el.textContent = text;
    el.classList.toggle('is-ok', ok && !!text);
    el.classList.toggle('is-error', !ok && !!text);
  }

  function makeButton(label, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  const dateFmt = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const fmtDate = (iso) => dateFmt.format(new Date(iso));

  // Голова игрока из скина: лицо и шлем вырезаются из PNG и увеличиваются в 9 раз.
  function skinHead(src) {
    const head = document.createElement('div');
    head.className = 'skin-head';
    head.style.backgroundImage = `url("${asset(src)}")`;
    const hat = document.createElement('div');
    hat.className = 'skin-hat';
    head.append(hat);
    return head;
  }

  // ---------- Фото ----------

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось открыть фото. Попробуйте JPG или PNG.'));
      };
      img.src = url;
    });
  }

  // Уменьшаем фото до 1600 px и сохраняем как JPEG: так оно быстро уйдёт на сервер.
  async function shrinkImage(file) {
    const img = await loadImage(file);
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  // ---------- Аккаунт: вход и регистрация ----------

  let me = null;
  let authMode = 'login';
  const accountEl = $('#account');
  const authModal = $('#authModal');
  const authForm = $('#authForm');
  const authMsg = $('#authMsg');
  const authSubmit = $('#authSubmit');
  const authTitle = $('#authTitle');
  const onlyRegister = authForm.querySelector('.only-register');

  // Меняет состояние входа на всех страницах и сообщает о нём событием ht:auth.
  function applyUser(user) {
    me = user;
    document.body.classList.toggle('is-logged', !!user);
    document.body.classList.toggle('is-owner', user?.role === 'owner');
    renderAccount();
    document.dispatchEvent(new CustomEvent('ht:auth', { detail: user }));
  }

  function renderAccount() {
    accountEl.textContent = '';
    if (me) {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = me.role === 'owner' ? `${me.login} · владелец` : me.login;
      accountEl.append(who, makeButton('Выйти', 'btn btn-small', logout));
    } else {
      accountEl.append(makeButton('Войти', 'btn btn-small btn-primary', () => openAuth('login')));
    }
  }

  function setAuthMode(next) {
    authMode = next;
    const reg = next === 'register';
    document.querySelectorAll('.tab').forEach((tab) => {
      const active = tab.dataset.mode === next;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    onlyRegister.hidden = !reg;
    authForm.elements.password2.required = reg;
    authForm.elements.password.autocomplete = reg ? 'new-password' : 'current-password';
    authTitle.textContent = reg ? 'Регистрация' : 'Вход в Империю';
    authSubmit.textContent = reg ? 'Зарегистрироваться' : 'Войти';
    setMsg(authMsg);
  }

  function openAuth(mode = 'login') {
    authForm.reset();
    setAuthMode(mode);
    authModal.hidden = false;
    authForm.elements.login.focus();
  }

  function closeAuth() {
    authModal.hidden = true;
  }

  async function logout() {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      // даже при ошибке сбрасываем вход на клиенте
    }
    applyUser(null);
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
  });
  $('#closeAuth').addEventListener('click', closeAuth);
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeAuth();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !authModal.hidden) closeAuth();
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = authForm.elements.login.value.trim();
    const password = authForm.elements.password.value;

    if (authMode === 'register' && password !== authForm.elements.password2.value) {
      setMsg(authMsg, 'Пароли не совпадают');
      return;
    }

    authSubmit.disabled = true;
    try {
      const url = authMode === 'login' ? '/api/login' : '/api/register';
      const data = await api(url, { method: 'POST', body: { login, password } });
      applyUser(data.user);
      closeAuth();
    } catch (err) {
      setMsg(authMsg, err.message);
    } finally {
      authSubmit.disabled = false;
    }
  });

  // Узнаём, вошёл ли посетитель, при загрузке страницы.
  const ready = api('/api/me').then(
    (data) => applyUser(data.user),
    () => applyUser(null),
  );

  window.HT = {
    $,
    api,
    setMsg,
    makeButton,
    stash,
    typeText,
    typeAll,
    watch,
    fmtDate,
    shrinkImage,
    skinHead,
    asset,
    openAuth,
    getMe: () => me,
    ready,
  };
})();
