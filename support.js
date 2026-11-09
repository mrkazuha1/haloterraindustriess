// Поддержка: игрок пишет обращение, владелец отвечает и закрывает его.
(() => {
  'use strict';

  const { $, api, setMsg, typeText, openAuth, getMe, fmtDate } = HT;
  const POLL_MS = 15000;

  let tickets = [];
  let selectedId = null;
  let filter = 'open';
  let pollTimer = null;
  const rendered = new Map();   // обращение -> id сообщений, уже показанных на экране
  const instantIds = new Set(); // сообщения, которые только что отправил сам посетитель

  const listEl = $('#ticketList');
  const threadEl = $('#thread');
  const emptyEl = $('#threadEmpty');
  const messagesEl = $('#messages');
  const newForm = $('#newTicketForm');
  const newTicketMsg = $('#newTicketMsg');
  const replyForm = $('#replyForm');
  const replyMsg = $('#replyMsg');
  const statusEl = $('#threadStatus');
  const toggleBtn = $('#toggleStatus');

  const isOwner = () => getMe()?.role === 'owner';
  const selected = () => tickets.find((t) => t.id === selectedId) || null;

  function replaceTicket(t) {
    const i = tickets.findIndex((x) => x.id === t.id);
    if (i === -1) tickets.push(t);
    else tickets[i] = t;
    tickets.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  function badge(status) {
    const b = document.createElement('span');
    b.className = 'badge ' + (status === 'open' ? 'badge-open' : 'badge-closed');
    b.textContent = status === 'open' ? 'Открыто' : 'Закрыто';
    return b;
  }

  function renderCounts() {
    const open = tickets.filter((t) => t.status === 'open').length;
    $('#cntOpen').textContent = `(${open})`;
    $('#cntClosed').textContent = `(${tickets.length - open})`;
  }

  function renderList() {
    renderCounts();
    listEl.textContent = '';
    const owner = isOwner();
    const list = owner && filter !== 'all'
      ? tickets.filter((t) => t.status === filter || t.id === selectedId) // выбранное не пропадает из списка
      : tickets;

    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = owner ? 'Обращений в этом списке нет.' : 'Вы ещё не писали в поддержку.';
      listEl.append(p);
      return;
    }

    for (const t of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ticket' + (t.id === selectedId ? ' is-active' : '');

      const top = document.createElement('div');
      top.className = 'ticket-top';
      const subj = document.createElement('span');
      subj.className = 'ticket-subj';
      subj.textContent = t.subject;
      top.append(subj, badge(t.status));

      const meta = document.createElement('div');
      meta.className = 'ticket-meta';
      meta.textContent = (owner ? `${t.author} · ` : '') + fmtDate(t.updated);

      btn.append(top, meta);
      btn.addEventListener('click', () => selectTicket(t.id));
      listEl.append(btn);
    }
  }

  // Показывает переписку. Уже показанные сообщения не трогаем,
  // новые печатаются по буквам (кроме тех, что отправил сам посетитель).
  function renderThread() {
    const t = selected();
    if (!t) {
      threadEl.hidden = true;
      emptyEl.hidden = false;
      selectedId = null;
      return;
    }
    threadEl.hidden = false;
    emptyEl.hidden = true;

    $('#threadTitle').textContent = t.subject;
    statusEl.textContent = t.status === 'open' ? 'Открыто' : 'Закрыто';
    statusEl.className = 'badge ' + (t.status === 'open' ? 'badge-open' : 'badge-closed');
    toggleBtn.textContent = t.status === 'open' ? 'Закрыть обращение' : 'Открыть снова';

    if (!rendered.has(t.id)) rendered.set(t.id, new Set());
    const seen = rendered.get(t.id);
    const animate = seen.size > 0;

    for (const m of t.messages) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);

      const row = document.createElement('div');
      row.className = 'msg ' + (m.role === 'owner' ? 'msg-owner' : 'msg-player');
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.textContent = `${m.role === 'owner' ? 'Администрация' : m.from} · ${fmtDate(m.date)}`;
      const body = document.createElement('div');
      body.className = 'msg-text';
      row.append(meta, body);
      messagesEl.append(row);

      if (animate && !instantIds.has(m.id)) typeText(body, m.text, 14);
      else body.textContent = m.text;
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function selectTicket(id) {
    selectedId = id;
    newForm.hidden = true;
    rendered.delete(id);
    messagesEl.textContent = '';
    renderThread();
    renderList();
  }

  // ---------- Фильтры (для владельца) ----------

  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderList();
    });
  });

  // ---------- Быстрые ответы (для владельца) ----------

  document.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      replyForm.elements.text.value = btn.dataset.quick;
      replyForm.elements.text.focus();
    });
  });

  // ---------- Новое обращение ----------

  $('#newTicketBtn').addEventListener('click', () => {
    newForm.hidden = !newForm.hidden;
  });

  $('#cancelNew').addEventListener('click', () => {
    newForm.hidden = true;
    newForm.reset();
  });

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = newForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const { ticket } = await api('/api/tickets', {
        method: 'POST',
        body: { subject: newForm.elements.subject.value, text: newForm.elements.text.value },
      });
      replaceTicket(ticket);
      newForm.reset();
      setMsg(newTicketMsg);
      selectTicket(ticket.id);
    } catch (err) {
      setMsg(newTicketMsg, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Ответ, статус, удаление ----------

  replyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = selected();
    const text = replyForm.elements.text.value.trim();
    if (!t || !text) return;
    const btn = replyForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const { ticket } = await api(`/api/tickets/${t.id}/messages`, { method: 'POST', body: { text } });
      instantIds.add(ticket.messages[ticket.messages.length - 1].id); // своё сообщение показываем сразу
      replaceTicket(ticket);
      replyForm.reset();
      setMsg(replyMsg);
      renderList();
      renderThread();
    } catch (err) {
      setMsg(replyMsg, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  toggleBtn.addEventListener('click', async () => {
    const t = selected();
    if (!t) return;
    const status = t.status === 'open' ? 'closed' : 'open';
    try {
      const { ticket } = await api(`/api/tickets/${t.id}/status`, { method: 'POST', body: { status } });
      replaceTicket(ticket);
      renderList();
      renderThread();
    } catch (err) {
      alert(err.message);
    }
  });

  $('#deleteTicket').addEventListener('click', async () => {
    const t = selected();
    if (!t || !confirm('Удалить обращение вместе с перепиской?')) return;
    try {
      await api(`/api/tickets/${t.id}`, { method: 'DELETE' });
      tickets = tickets.filter((x) => x.id !== t.id);
      rendered.delete(t.id);
      selectedId = null;
      renderList();
      renderThread();
    } catch (err) {
      alert(err.message);
    }
  });

  // ---------- Загрузка и обновление ----------

  // Обновляем список каждые 15 секунд, чтобы владелец быстро видел новые обращения.
  async function refresh() {
    try {
      const data = await api('/api/tickets');
      tickets = data.tickets;
      renderList();
      renderThread();
    } catch {
      // сеть недоступна — попробуем при следующем обновлении
    }
  }

  // Реагируем на вход и выход: сбрасываем состояние и загружаем обращения.
  function onAuth(user) {
    clearInterval(pollTimer);
    pollTimer = null;
    tickets = [];
    selectedId = null;
    rendered.clear();
    messagesEl.textContent = '';
    threadEl.hidden = true;
    emptyEl.hidden = false;
    newForm.hidden = true;
    renderList();
    if (!user) return;
    refresh();
    pollTimer = setInterval(refresh, POLL_MS);
  }

  document.addEventListener('ht:auth', (e) => onAuth(e.detail));

  $('#supportLogin').addEventListener('click', () => openAuth('login'));
  $('#supportRegister').addEventListener('click', () => openAuth('register'));
})();
