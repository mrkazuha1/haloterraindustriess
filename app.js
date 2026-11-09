// Главная страница: гимн и новости с фото.
(() => {
  'use strict';

  const { $, api, setMsg, makeButton, fmtDate, typeAll, watch, shrinkImage, skinHead } = HT;

  // ---------- Гимн ----------

  const audio = $('#anthemAudio');
  const playBtn = $('#playBtn');
  const bar = $('#bar');
  const barFill = $('#barFill');
  const curEl = $('#cur');
  const durEl = $('#dur');

  const fmt = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  playBtn.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  audio.addEventListener('play', () => {
    playBtn.textContent = '❚❚';
    playBtn.setAttribute('aria-label', 'Пауза');
  });
  audio.addEventListener('pause', () => {
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', 'Воспроизвести гимн');
  });
  audio.addEventListener('loadedmetadata', () => {
    durEl.textContent = fmt(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    curEl.textContent = fmt(audio.currentTime);
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    barFill.style.width = `${pct}%`;
  });
  bar.addEventListener('click', (e) => {
    if (!Number.isFinite(audio.duration)) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = pct * audio.duration;
  });

  // ---------- Новости ----------

  const MAX_PHOTOS = 5;
  const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

  const newsList = $('#newsList');
  const newsEmpty = $('#newsEmpty');
  const newsForm = $('#newsForm');
  const newsMsg = $('#newsMsg');
  const photoInput = $('#newsPhotos');
  const photoPreview = $('#photoPreview');
  let photos = []; // фото в виде data URL, уже уменьшенные

  function renderPreview() {
    photoPreview.textContent = '';
    photos.forEach((src, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'photo-thumb';
      const img = document.createElement('img');
      img.src = src;
      img.alt = `Фото ${i + 1}`;
      wrap.append(img, makeButton('×', 'thumb-x', () => {
        photos.splice(i, 1);
        renderPreview();
      }));
      photoPreview.append(wrap);
    });
  }

  photoInput.addEventListener('change', async () => {
    setMsg(newsMsg);
    const files = Array.from(photoInput.files);
    photoInput.value = '';
    const free = MAX_PHOTOS - photos.length;
    if (files.length > free) setMsg(newsMsg, `Можно добавить ещё ${Math.max(free, 0)} фото`);
    for (const file of files.slice(0, Math.max(free, 0))) {
      if (!file.type.startsWith('image/')) {
        setMsg(newsMsg, `${file.name}: это не изображение`);
        continue;
      }
      if (file.size > MAX_SOURCE_BYTES) {
        setMsg(newsMsg, `${file.name}: файл слишком большой`);
        continue;
      }
      try {
        photos.push(await shrinkImage(file));
        renderPreview();
      } catch (err) {
        setMsg(newsMsg, err.message);
      }
    }
  });

  function buildNewsCard(item) {
    const card = document.createElement('article');
    card.className = 'news-card';
    card.dataset.typewriter = '';

    const meta = document.createElement('p');
    meta.className = 'news-meta';
    meta.textContent = `${fmtDate(item.date)} · ${item.author}`;

    // Заголовок и текст печатаются: сам элемент пуст, текст лежит в data-text.
    const title = document.createElement('h3');
    title.className = 'news-title';
    title.dataset.type = '';
    title.dataset.speed = '30';
    title.dataset.text = item.title;

    const body = document.createElement('p');
    body.className = 'news-text';
    body.dataset.type = '';
    body.dataset.speed = '14';
    body.dataset.text = item.text;

    card.append(meta, title, body);

    const images = item.images || [];
    if (images.length) {
      const gallery = document.createElement('div');
      gallery.className = 'news-photos';
      for (const src of images) {
        const a = document.createElement('a');
        a.href = HT.asset(src);
        a.target = '_blank';
        a.rel = 'noopener';
        const img = document.createElement('img');
        img.src = HT.asset(src);
        img.loading = 'lazy';
        img.alt = 'Фото к новости';
        a.append(img);
        gallery.append(a);
      }
      card.append(gallery);
    }

    card.append(makeButton('Удалить', 'news-del', () => deleteNews(item.id, card)));
    return card;
  }

  async function loadNews() {
    try {
      const data = await api('/api/news');
      newsList.textContent = '';
      newsEmpty.hidden = data.news.length > 0;
      for (const item of data.news) {
        const card = buildNewsCard(item);
        newsList.append(card);
        watch(card);
      }
    } catch {
      newsList.textContent = '';
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Не удалось загрузить новости. Обновите страницу.';
      newsList.append(p);
    }
  }

  newsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = newsForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const data = await api('/api/news', {
        method: 'POST',
        body: {
          title: newsForm.elements.title.value,
          text: newsForm.elements.text.value,
          images: photos,
        },
      });
      newsForm.reset();
      photos = [];
      renderPreview();
      newsEmpty.hidden = true;
      const card = buildNewsCard(data.item);
      newsList.prepend(card);
      typeAll(card); // новая новость сразу печатается
      setMsg(newsMsg, 'Новость опубликована', true);
    } catch (err) {
      setMsg(newsMsg, err.message);
    } finally {
      submit.disabled = false;
    }
  });

  async function deleteNews(id, card) {
    if (!confirm('Удалить эту новость вместе с фото?')) return;
    try {
      await api(`/api/news/${encodeURIComponent(id)}`, { method: 'DELETE' });
      card.remove();
      newsEmpty.hidden = newsList.children.length > 0;
    } catch (err) {
      alert(err.message);
    }
  }

  loadNews();

  // ---------- Игроки на главной ----------

  const playersPreview = $('#playersPreview');
  const playersEmpty = $('#playersEmpty');
  const PREVIEW_COUNT = 8;

  // Карточка игрока: описание появляется при наведении (или фокусе) на карточку.
  function playerCard(p) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.tabIndex = 0;
    card.dataset.typewriter = '';

    if (p.skin) card.append(skinHead(p.skin));
    const name = document.createElement('h3');
    name.className = 'player-name';
    name.dataset.type = '';
    name.dataset.speed = '30';
    name.dataset.text = p.name;
    card.append(name);

    if (p.role) {
      const role = document.createElement('p');
      role.className = 'player-role';
      role.textContent = p.role;
      card.append(role);
    }

    if (p.description) {
      const tip = document.createElement('div');
      tip.className = 'player-tip';
      tip.textContent = p.description;
      card.append(tip);
    }

    const more = document.createElement('a');
    more.className = 'btn btn-small';
    more.href = `players.html#p-${p.id}`;
    more.textContent = 'Подробнее';
    card.append(more);
    return card;
  }

  async function loadPlayers() {
    try {
      const { players } = await api('/api/players');
      playersPreview.textContent = '';
      playersEmpty.hidden = players.length > 0;
      for (const p of players.slice(0, PREVIEW_COUNT)) {
        const card = playerCard(p);
        playersPreview.append(card);
        watch(card);
      }
    } catch {
      // раздел останется пустым
    }
  }

  loadPlayers();
})();
