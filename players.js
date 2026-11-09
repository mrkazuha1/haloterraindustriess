// Страница «Игроки сервера»: список игроков, скины и редактор для владельца.
(() => {
  'use strict';

  const { $, api, setMsg, makeButton, watch, skinHead } = HT;
  const SKIN_MAX_BYTES = 200 * 1024;

  const list = $('#playersList');
  const emptyEl = $('#playersEmpty');
  const form = $('#playersForm');
  const editBox = $('#playersEdit');
  const msgEl = $('#playersMsg');
  let editing = []; // [{ id, name, role, description, skin }]

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

  // Копия игрока для редактора (у старых записей скина может не быть)
  const toEditable = ({ id, name, role, description, skin }) => ({
    id,
    name,
    role,
    description,
    skin: skin || '',
  });

  // id игрока используется как якорь: players.html#p-<id>
  function playerCard(p, animate) {
    const art = document.createElement('article');
    art.className = 'player-full';
    art.id = `p-${p.id}`;
    if (animate) art.dataset.typewriter = '';
    if (p.skin) art.append(skinHead(p.skin));
    art.append(node('h2', 'player-full-name', p.name, 30, animate));
    if (p.role) {
      const role = document.createElement('p');
      role.className = 'player-role';
      role.textContent = p.role;
      art.append(role);
    }
    for (const para of paragraphs(p.description)) art.append(node('p', 'text', para, 18, animate));
    return art;
  }

  function renderList(players, animate) {
    list.textContent = '';
    emptyEl.hidden = players.length > 0;
    for (const p of players) {
      const art = playerCard(p, animate);
      list.append(art);
      if (animate) watch(art);
    }
  }

  // ---------- Скины ----------

  // Проверяем скин в браузере: PNG, не больше 200 КБ, 64×64 или 64×32 пикселя.
  function readSkin(file) {
    return new Promise((resolve, reject) => {
      if (file.type !== 'image/png') {
        reject(new Error('Скин должен быть в формате PNG'));
        return;
      }
      if (file.size > SKIN_MAX_BYTES) {
        reject(new Error('Файл скина больше 200 КБ'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const ok = img.naturalWidth === 64 && (img.naturalHeight === 32 || img.naturalHeight === 64);
          if (ok) resolve(reader.result);
          else reject(new Error('Скин должен быть 64×64 или 64×32 пикселя'));
        };
        img.onerror = () => reject(new Error('Не удалось открыть скин'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(file);
    });
  }

  async function addSkin(i, input) {
    syncFromDom();
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    setMsg(msgEl);
    try {
      editing[i].skin = await readSkin(file);
      setMsg(msgEl, 'Скин выбран. Не забудьте сохранить список.', true);
    } catch (err) {
      setMsg(msgEl, err.message);
    }
    syncFromDom();
    renderEditor();
  }

  // ---------- Редактор (виден только владельцу) ----------

  // Переносит значения из полей в editing. id и скин сохраняются, чтобы не потерять их.
  function syncFromDom() {
    editing = Array.from(editBox.querySelectorAll('.lore-edit')).map((box, i) => ({
      id: editing[i]?.id || '',
      name: box.querySelector('.pl-name').value,
      role: box.querySelector('.pl-role').value,
      description: box.querySelector('.pl-desc').value,
      skin: editing[i]?.skin || '',
    }));
  }

  function renderEditor() {
    editBox.textContent = '';
    editing.forEach((p, i) => editBox.append(playerEditor(p, i)));
  }

  function playerEditor(p, i) {
    const box = document.createElement('div');
    box.className = 'lore-edit';

    const name = document.createElement('input');
    name.className = 'pl-name';
    name.placeholder = 'Ник игрока';
    name.maxLength = 40;
    name.value = p.name;

    const role = document.createElement('input');
    role.className = 'pl-role';
    role.placeholder = 'Роль или отрасль (необязательно)';
    role.maxLength = 60;
    role.value = p.role;

    const desc = document.createElement('textarea');
    desc.className = 'pl-desc';
    desc.rows = 4;
    desc.maxLength = 2000;
    desc.placeholder = 'Описание игрока. Это текст, который появляется при наведении курсора.';
    desc.value = p.description;

    const skinInput = document.createElement('input');
    skinInput.type = 'file';
    skinInput.accept = 'image/png';
    skinInput.addEventListener('change', () => addSkin(i, skinInput));

    const skinLabel = document.createElement('label');
    skinLabel.className = 'file-label';
    skinLabel.textContent = 'Скин игрока (PNG 64×64 или 64×32)';
    skinLabel.append(skinInput);

    box.append(name, role, desc, skinLabel);

    if (p.skin) {
      const skinRow = document.createElement('div');
      skinRow.className = 'row';
      skinRow.append(
        skinHead(p.skin),
        makeButton('Убрать скин', 'btn btn-small btn-danger', () => {
          syncFromDom();
          editing[i].skin = '';
          renderEditor();
        }),
      );
      box.append(skinRow);
    }

    const bar = document.createElement('div');
    bar.className = 'row';
    bar.append(
      makeButton('↑ выше', 'btn btn-small', () => movePlayer(i, -1)),
      makeButton('↓ ниже', 'btn btn-small', () => movePlayer(i, 1)),
      makeButton('Удалить игрока', 'btn btn-small btn-danger', () => removePlayer(i)),
    );
    box.append(bar);
    return box;
  }

  function movePlayer(i, dir) {
    syncFromDom();
    const j = i + dir;
    if (j < 0 || j >= editing.length) return;
    [editing[i], editing[j]] = [editing[j], editing[i]];
    renderEditor();
  }

  function removePlayer(i) {
    syncFromDom();
    editing.splice(i, 1);
    renderEditor();
  }

  $('#addPlayer').addEventListener('click', () => {
    syncFromDom();
    editing.push({ id: '', name: '', role: '', description: '', skin: '' });
    renderEditor();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncFromDom();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const { players } = await api('/api/players', { method: 'PUT', body: { players: editing } });
      renderList(players, false);
      editing = players.map(toEditable);
      renderEditor();
      setMsg(msgEl, 'Список игроков сохранён', true);
    } catch (err) {
      setMsg(msgEl, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Загрузка ----------

  async function load() {
    try {
      const { players } = await api('/api/players');
      renderList(players, true);
      editing = players.map(toEditable);
      renderEditor();
      // Переход по ссылке «Подробнее» открывает нужного игрока
      if (location.hash) {
        // :target не срабатывает на элементы, появившиеся после перехода, поэтому ставим класс сами
        const target = document.getElementById(location.hash.slice(1));
        if (target) {
          target.classList.add('is-target');
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    } catch {
      list.textContent = '';
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Не удалось загрузить список игроков. Обновите страницу.';
      list.append(p);
    }
  }

  load();
})();
