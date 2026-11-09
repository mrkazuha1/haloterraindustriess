// Страница подробного лора: показ, фото к разделам и редактор для владельца.
(() => {
  'use strict';

  const { $, api, setMsg, makeButton, watch, shrinkImage } = HT;
  const MAX_PHOTOS = 5;

  const view = $('#loreView');
  const form = $('#loreForm');
  const sectionsBox = $('#loreSections');
  const msgEl = $('#loreMsg');
  let editing = []; // разделы в редакторе: [{ heading, text, images }]

  // Абзацы делятся пустой строкой.
  const paragraphs = (text) =>
    String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // Элемент для печати. Если animate = false, текст выводится сразу.
  function node(tag, cls, text, speed, animate) {
    const el = document.createElement(tag);
    el.className = cls;
    el.dataset.type = '';
    el.dataset.speed = String(speed);
    el.dataset.text = text;
    if (animate) {
      el.textContent = '';
    } else {
      el.textContent = text;
      el.dataset.done = '1';
    }
    return el;
  }

  function block(cls, animate) {
    const el = document.createElement('div');
    el.className = cls;
    if (animate) el.dataset.typewriter = '';
    return el;
  }

  function gallery(images) {
    const wrap = document.createElement('div');
    wrap.className = 'news-photos';
    for (const src of images) {
      const a = document.createElement('a');
      a.href = HT.asset(src);
      a.target = '_blank';
      a.rel = 'noopener';
      const img = document.createElement('img');
      img.src = HT.asset(src);
      img.loading = 'lazy';
      img.alt = 'Фото к разделу лора';
      a.append(img);
      wrap.append(a);
    }
    return wrap;
  }

  function renderView(lore, animate) {
    view.textContent = '';

    const head = block('section-head', animate);
    head.append(node('h1', '', lore.title, 40, animate));
    view.append(head);

    if (lore.intro) {
      const intro = block('lore-block', animate);
      for (const p of paragraphs(lore.intro)) intro.append(node('p', 'text', p, 18, animate));
      view.append(intro);
    }

    for (const s of lore.sections) {
      const sec = block('lore-block', animate);
      sec.append(node('h2', 'lore-h', s.heading, 30, animate));
      for (const p of paragraphs(s.text)) sec.append(node('p', 'text', p, 18, animate));
      if (s.images && s.images.length) sec.append(gallery(s.images));
      view.append(sec);
    }

    if (animate) view.querySelectorAll('[data-typewriter]').forEach(watch);
  }

  // ---------- Редактор (виден только владельцу) ----------

  // Переносит значения из полей в массив editing. Фото остаются в массиве как были.
  function syncFromDom() {
    editing = Array.from(sectionsBox.querySelectorAll('.lore-edit')).map((box, i) => ({
      heading: box.querySelector('.lore-heading').value,
      text: box.querySelector('.lore-text').value,
      images: editing[i]?.images || [],
    }));
  }

  function renderEditor() {
    sectionsBox.textContent = '';
    editing.forEach((s, i) => sectionsBox.append(sectionEditor(s, i)));
  }

  function sectionEditor(s, i) {
    const box = document.createElement('div');
    box.className = 'lore-edit';

    const heading = document.createElement('input');
    heading.className = 'lore-heading';
    heading.placeholder = 'Заголовок раздела';
    heading.maxLength = 150;
    heading.value = s.heading;

    const text = document.createElement('textarea');
    text.className = 'lore-text';
    text.rows = 6;
    text.maxLength = 20000;
    text.placeholder = 'Текст раздела. Пустая строка делит текст на абзацы.';
    text.value = s.text;

    // Фото раздела: превью с кнопкой удаления и выбор новых файлов
    const preview = document.createElement('div');
    preview.className = 'photo-preview';
    (s.images || []).forEach((src, j) => {
      const wrap = document.createElement('div');
      wrap.className = 'photo-thumb';
      const img = document.createElement('img');
      img.src = HT.asset(src);
      img.alt = `Фото ${j + 1}`;
      wrap.append(img, makeButton('×', 'thumb-x', () => {
        syncFromDom();
        editing[i].images.splice(j, 1);
        renderEditor();
      }));
      preview.append(wrap);
    });

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.addEventListener('change', () => addPhotos(i, fileInput));

    const fileLabel = document.createElement('label');
    fileLabel.className = 'file-label';
    fileLabel.textContent = `Фото к разделу (до ${MAX_PHOTOS})`;
    fileLabel.append(fileInput);

    const bar = document.createElement('div');
    bar.className = 'row';
    bar.append(
      makeButton('↑ выше', 'btn btn-small', () => moveSection(i, -1)),
      makeButton('↓ ниже', 'btn btn-small', () => moveSection(i, 1)),
      makeButton('Удалить раздел', 'btn btn-small btn-danger', () => removeSection(i)),
    );

    box.append(heading, text, fileLabel, preview, bar);
    return box;
  }

  async function addPhotos(i, input) {
    syncFromDom();
    const files = Array.from(input.files);
    input.value = '';
    setMsg(msgEl);
    for (const file of files) {
      if (editing[i].images.length >= MAX_PHOTOS) {
        setMsg(msgEl, `В одном разделе не больше ${MAX_PHOTOS} фото`);
        break;
      }
      if (!file.type.startsWith('image/')) {
        setMsg(msgEl, `${file.name}: это не изображение`);
        continue;
      }
      try {
        editing[i].images.push(await shrinkImage(file));
      } catch (err) {
        setMsg(msgEl, err.message);
      }
    }
    syncFromDom();
    renderEditor();
  }

  function moveSection(i, dir) {
    syncFromDom();
    const j = i + dir;
    if (j < 0 || j >= editing.length) return;
    [editing[i], editing[j]] = [editing[j], editing[i]];
    renderEditor();
  }

  function removeSection(i) {
    syncFromDom();
    editing.splice(i, 1);
    renderEditor();
  }

  $('#addSection').addEventListener('click', () => {
    syncFromDom();
    editing.push({ heading: '', text: '', images: [] });
    renderEditor();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncFromDom();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const { lore } = await api('/api/lore', {
        method: 'PUT',
        body: {
          title: form.elements.title.value,
          intro: form.elements.intro.value,
          sections: editing,
        },
      });
      renderView(lore, false);
      // Теперь новые фото — это ссылки на сервер. Перезаписывать их файлами при следующем сохранении не нужно.
      editing = lore.sections.map((s) => ({ heading: s.heading, text: s.text, images: [...(s.images || [])] }));
      renderEditor();
      setMsg(msgEl, 'Лор сохранён', true);
    } catch (err) {
      setMsg(msgEl, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Загрузка ----------

  async function load() {
    try {
      const { lore } = await api('/api/lore');
      renderView(lore, true);
      form.elements.title.value = lore.title;
      form.elements.intro.value = lore.intro;
      editing = lore.sections.map((s) => ({ heading: s.heading, text: s.text, images: [...(s.images || [])] }));
      renderEditor();
    } catch {
      view.textContent = '';
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Не удалось загрузить лор. Обновите страницу.';
      view.append(p);
    }
  }

  load();
})();
