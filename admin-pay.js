/* Cleano SaaS admin (перенос из ARTEZ) · раздел «💳 Оплаты» + вкладка «🏢 Настройки компании → 💳 Онлайн-оплата (PLUM)» (онлайн-оплата PLUM, тестировщики, возвраты, рассрочка) — Э3, 2026-11-15.
   Отдельный файл (admin.html правят и другие сессии): сам заполняет .pp-host и грузит данные, когда раздел открыт.
   Данные клиентов — только через esc(); в атрибутах обработчиков — только числовые id (правило XSS). */
(function () {
  'use strict';
  var API = (typeof API_BASE !== 'undefined' ? API_BASE : 'https://artez-api-production.up.railway.app/api');
  function tok() { try { return localStorage.getItem('artez_admin_token') || ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function sum(v) { return Number(v || 0).toLocaleString('ru-RU').replace(/,/g, ' '); }
  function dt(v) { if (!v) return ''; var d = new Date(v); return d.toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent'}); }
  async function api(path, opts) {
    opts = opts || {};
    var r = await fetch(API + path, {method: opts.method || 'GET', body: opts.body ? JSON.stringify(opts.body) : undefined,
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok()}});
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) { var det = d.detail; throw new Error(det && typeof det === 'object' ? (det.ru || det.message) : (det || 'Ошибка ' + r.status)); }
    return d;
  }

  var ST = {pending: '⏳ ждёт банк', otp: '✉️ ждёт код', paid: '✅ оплачено', failed: '❌ не прошло', cancelled: '⛔ отменено',
            review: '⚠️ проверить вручную', refunded: '↩️ возвращено', manual: '✋ вернули вручную'};
  var INST = {new: '🆕 новая', in_work: '🔄 в работе', done: '✅ оформлена', rejected: '❌ отказ'};

  var css = '.pp-host{color:var(--text,#e8eaf0)}.pp-host .pp-card{background:var(--surface,#1a1d27);border:1px solid var(--border,#2e3250);border-radius:14px;padding:16px;margin-bottom:14px}' +
    '.pp-host h3{margin:0 0 10px;font-size:16px;color:var(--text,#e8eaf0)}.pp-host table{width:100%;border-collapse:collapse;font-size:13px}' +
    '.pp-host th,.pp-host td{padding:7px 6px;border-bottom:1px solid var(--border,#2e3250);text-align:left;vertical-align:top;color:var(--text,#e8eaf0)}' +
    '.pp-host th{color:var(--text2,#9ca3af);font-weight:600;font-size:12px}' +
    '.pp-host .pp-btn{padding:7px 12px;border-radius:9px;border:1px solid var(--border,#2e3250);background:var(--surface2,#222536);color:var(--text,#e8eaf0);cursor:pointer;font-size:13px}' +
    '.pp-host .pp-btn.pri{background:var(--accent,#f5a623);color:#111;border-color:var(--accent,#f5a623);font-weight:700}.pp-host .pp-btn.red{color:var(--red,#ef4444)}' +
    '.pp-host input,.pp-host select{padding:8px 10px;border:1px solid var(--border,#2e3250);border-radius:9px;font-size:14px;background:var(--surface2,#222536);color:var(--text,#e8eaf0)}' +
    '.pp-host input:disabled,.pp-host select:disabled{background:transparent;border-color:transparent;opacity:1;font-weight:700;-webkit-appearance:none;appearance:none;padding-left:2px;cursor:default}' +
    '.pp-host .pp-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:6px 0}' +
    '.pp-host .pp-mode label{display:flex;gap:6px;align-items:center;padding:8px 12px;border:1px solid var(--border,#2e3250);border-radius:10px;cursor:pointer;color:var(--text,#e8eaf0)}' +
    '.pp-host .pp-note{font-size:12px;color:var(--text2,#9ca3af)}.pp-host .pp-test{display:inline-block;font-size:11px;padding:1px 6px;border-radius:6px;background:#fef3c7;color:#92400e}' +
    '.pp-host .pp-wrap{overflow-x:auto}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function shell(p) {
    p.classList.add('pp-host'); p.innerHTML = '<h2 style="margin:0 0 14px">💳 Онлайн-оплаты</h2>' +
      '<div class="pp-card"><div class="pp-note">⚙️ Ключи PLUM, режим (выкл / тестировщики / все), сумма предоплаты — в «🏢 Настройки компании» → вкладка «💳 Онлайн-оплата (PLUM)».</div></div>' +
      '<div class="pp-card" id="ppRefunds"><h3>↩️ Кому вернуть деньги</h3><div class="pp-note">Загрузка…</div></div>' +
      '<div class="pp-card" id="ppInst"><h3>🧾 Заявки на рассрочку</h3><div class="pp-note">Загрузка…</div></div>' +
      '<div class="pp-card" id="ppTesters"><h3>🧪 Тестировщики</h3><div class="pp-note">Загрузка…</div></div>' +
      '<div class="pp-card" id="ppTx"><h3>📋 Журнал платежей</h3><div class="pp-note">Загрузка…</div></div>' +
      '<div class="pp-card" id="ppLog"><h3>🗂 Действия в разделе</h3><div class="pp-note">Загрузка…</div></div>';
  }

  // ✏️ — правка: по умолчанию только просмотр (перенос ARTEZ, 16.11)
  var editing = {settings: false, testers: false};
  function pencil(key, can) {
    return can ? '<button class="pp-btn pp-pencil" data-pp="edit" data-k="' + key + '">' + (editing[key] ? '✕ Отмена' : '✏️ Изменить') + '</button>' : '';
  }

  async function loadSettings() {
    var el = document.getElementById('cstab-plum');
    if (!el) return;
    el.classList.add('pp-host');
    try {
      var s = await api('/pay/admin/settings'), ed = editing.settings && s.can_edit, dis = ed ? '' : ' disabled';
      el.innerHTML = '<div class="pp-card"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><h3 style="margin:0">💳 Онлайн-оплата картой (PLUM · Uzcard/Humo)</h3>' + pencil('settings', s.can_edit) + '</div>' +
        '<div class="pp-note">Клиенты платят на сайте компании и в приложении: после замера — остаток, до замера — предоплата по желанию. Наличные курьеру остаются. Деньги приходят на счёт по вашему договору с PLUM.</div>' +
        '<div class="pp-row pp-mode">' +
        [['off', '⛔ Выключена'], ['testers', '🧪 Только тестировщики'], ['all', '✅ Для всех клиентов']].map(function (m) {
          return '<label><input type="radio" name="ppMode" value="' + m[0] + '"' + (s.mode === m[0] ? ' checked' : '') + dis + '> ' + m[1] + '</label>';
        }).join('') + '</div>' +
        '<div class="pp-note">' + (s.real_configured ? '🔑 Ключи PLUM заполнены.' : '🔑 Ключи PLUM не заполнены — работает только подставной банк для тестировщиков (раздел «💳 Оплаты» → Тестировщики).') + '</div>' +
        '<h3 style="margin-top:14px">🔑 Договор PLUM</h3>' +
        '<div class="pp-row"><span style="min-width:200px">Адрес API (https)</span><input id="ppBase" value="' + esc(s.base_url) + '" placeholder="https://pay.myuzcard.uz/api/" style="width:340px"' + dis + '></div>' +
        '<div class="pp-row"><span style="min-width:200px">Логин API</span><input id="ppLogin" value="' + esc(s.login) + '" autocomplete="off" style="width:220px"' + dis + '></div>' +
        '<div class="pp-row"><span style="min-width:200px">Пароль API</span><input id="ppPass" type="password" autocomplete="new-password" placeholder="' + (s.password_set ? '•••••• задан — оставьте пустым' : 'не задан') + '" style="width:240px"' + dis + '>' +
          (s.password_set && s.can_edit ? ' <label class="pp-note"><input type="checkbox" id="ppPassClr"> удалить</label>' : '') + '</div>' +
        '<div class="pp-row"><span style="min-width:200px">Ключ посредника (если есть)</span><input id="ppProxy" type="password" autocomplete="new-password" placeholder="' + (s.proxy_key_set ? '•••••• задан — оставьте пустым' : 'не нужен при прямом доступе') + '" style="width:240px"' + dis + '>' +
          (s.proxy_key_set && s.can_edit ? ' <label class="pp-note"><input type="checkbox" id="ppProxyClr"> удалить</label>' : '') + '</div>' +
        '<div class="pp-row"><span style="min-width:200px">Префикс платежей</span><input id="ppPrefix" value="' + esc(s.prefix === s.prefix_default ? '' : s.prefix) + '" placeholder="' + esc(s.prefix_default) + '" style="width:120px"' + dis + '><span class="pp-note">латиница/цифры и «-» в конце; нужен, если договор PLUM общий с другим проектом</span></div>' +
        '<div class="pp-note">Пароль и ключ хранятся зашифрованно и обратно не показываются. PLUM пускает только IP из белого списка — сообщите PLUM исходящий IP сервера (или используйте посредника).</div>' +
        '<h3 style="margin-top:14px">⚙️ Правила</h3>' +
        '<div class="pp-row"><span>Предоплата — предлагаем клиенту:</span><input type="number" id="ppPrepay" min="1000" step="1000" value="' + Number(s.prepay_amount) + '" style="width:140px"' + dis + '> сум</div>' +
        '<div class="pp-row"><span>Клиент может выбрать свою сумму: от</span><input type="number" id="ppPrepayMin" min="1000" step="1000" value="' + Number(s.prepay_min) + '" style="width:130px"' + dis + '>' +
          '<span>до</span><input type="number" id="ppPrepayMax" min="1000" step="1000" value="' + Number(s.prepay_max) + '" style="width:140px"' + dis + '> сум</div>' +
        '<div class="pp-row"><span>Сохранённая карта без кода SMS — до</span><input type="number" id="ppOtpless" min="0" step="10000" value="' + Number(s.otpless_limit) + '" style="width:140px"' + dis + '> сум <span class="pp-note">(и только первая оплата за сутки)</span></div>' +
        '<div class="pp-row"><span>Уведомления об оплатах и рассрочке:</span><select id="ppNotify"' + dis + '>' +
        '<option value="group"' + (s.notify === 'group' ? ' selected' : '') + '>в группу заявок компании</option>' +
        '<option value="off"' + (s.notify === 'off' ? ' selected' : '') + '>не отправлять</option></select></div>' +
        (s.can_edit ? '<div class="pp-row">' + (ed ? '<button class="pp-btn pri" data-pp="save">Сохранить</button>' : '') + '<button class="pp-btn" data-pp="check">Проверить связь с PLUM</button><span class="pp-note" id="ppSaveMsg"></span></div>'
                    : '<div class="pp-note">Менять настройки может только администратор.</div>') + '</div>';
    } catch (e) { el.innerHTML = '<div class="pp-card"><div class="pp-note">' + esc(e.message) + '</div></div>'; }
  }

  async function saveSettings() {
    var mode = (document.querySelector('input[name=ppMode]:checked') || {}).value;
    if (mode === 'all' && !confirm('Включить оплату картой для ВСЕХ клиентов? Будут списываться настоящие деньги.')) return;
    var m = document.getElementById('ppSaveMsg');
    var v = function (id) { return (document.getElementById(id) || {}).value || ''; };
    var ck = function (id) { return !!(document.getElementById(id) || {}).checked; };
    var lo = Number(v('ppPrepayMin')), hi = Number(v('ppPrepayMax')), def = Number(v('ppPrepay'));
    if (lo > hi) { m.textContent = '❌ «от» больше «до»'; return; }
    if (def < lo || def > hi) { m.textContent = '❌ Предлагаемая сумма должна быть между «от» и «до»'; return; }
    var body = {mode: mode, base_url: v('ppBase').trim(), login: v('ppLogin').trim(), prefix: v('ppPrefix').trim(),
      prepay_amount: def, prepay_min: lo, prepay_max: hi, otpless_limit: v('ppOtpless'), notify: v('ppNotify')};
    if (v('ppPass')) body.password = v('ppPass');
    if (v('ppProxy')) body.proxy_key = v('ppProxy');
    if (ck('ppPassClr')) body.clear_password = true;
    if (ck('ppProxyClr')) body.clear_proxy_key = true;
    try {
      await api('/pay/admin/settings', {method: 'PUT', body: body});
      editing.settings = false;
      await loadSettings();
      var m2 = document.getElementById('ppSaveMsg'); if (m2) m2.textContent = '✅ Сохранено';
    } catch (e) { m.textContent = '❌ ' + e.message; }
  }

  async function checkPlum() {
    var m = document.getElementById('ppSaveMsg');
    m.textContent = '⏳ Проверяем…';
    try { var r = await api('/pay/admin/check', {method: 'POST'}); m.textContent = (r.ok ? '✅ ' : '❌ ') + r.message; }
    catch (e) { m.textContent = '❌ ' + e.message; }
  }

  async function loadTesters() {
    var el = document.getElementById('ppTesters');
    try {
      var r = await api('/pay/admin/testers'), ed = editing.testers;
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px"><h3 style="margin:0">🧪 Тестировщики</h3>' + pencil('testers', true) + '</div>' +
        '<div class="pp-note">Платят подставным банком — настоящие деньги не списываются. Тестовая карта 8600 1234 5678 9012, срок 12/30, код из SMS 111111.</div>' +
        (ed ? '<div class="pp-row"><input id="ppTPhone" placeholder="+998 90 123 45 67" style="width:170px"><input id="ppTName" placeholder="Имя" style="width:150px">' +
          '<label class="pp-note"><input type="checkbox" id="ppTReal"> платит настоящей картой</label><button class="pp-btn pri" data-pp="taddadd">Сохранить</button></div>' : '') +
        (r.testers.length ? '<table><tr><th>Телефон</th><th>Имя</th><th>Банк</th><th></th></tr>' + r.testers.map(function (t) {
          return '<tr><td>' + esc(t.phone) + '</td><td>' + esc(t.name) + '</td><td>' + (t.real_card ? '💳 настоящий' : '🧪 подставной') + '</td>' +
            '<td>' + (ed ? '<button class="pp-btn red" data-pp="tdel" data-id="' + Number(t.id) + '">Убрать</button>' : '') + '</td></tr>';
        }).join('') + '</table>' : '<div class="pp-note">Пока никого.</div>');
    } catch (e) { el.innerHTML = '<h3>🧪 Тестировщики</h3><div class="pp-note">' + esc(e.message) + '</div>'; }
  }

  function txWhere(t) { return t.order_num ? 'Заказ ' + esc(t.order_num) : (t.lead_code ? 'Заявка ' + esc(t.lead_code) : '—'); }

  async function loadRefunds() {
    var el = document.getElementById('ppRefunds');
    try {
      var r = await api('/pay/admin/refunds-needed');
      var today = new Date().toDateString();
      el.innerHTML = '<h3>↩️ Кому вернуть деньги</h3><div class="pp-note">Отменённые заказы и заявки с онлайн-оплатой, и заказы, где внесено больше итога (например, итог меньше предоплаты). ' +
        '«Вернуть на карту» — полный возврат через банк, обычно только в день оплаты. Иначе — верните через кассу и нажмите «Вернули вручную».</div>' +
        (r.items.length ? '<div class="pp-wrap"><table><tr><th>Что</th><th>Клиент</th><th>Итог / внесено</th><th>Вернуть</th><th></th></tr>' + r.items.map(function (x) {
          var btns = (x.tx || []).map(function (t) {
            var same = t.created_at && new Date(t.created_at).toDateString() === today;
            return (same && x.to_return >= t.amount ? '<button class="pp-btn" data-pp="rev" data-id="' + Number(t.id) + '">Вернуть на карту ' + sum(t.amount) + '</button> ' : '') +
              '<button class="pp-btn pri" data-pp="man" data-id="' + Number(t.id) + '" data-max="' + Number(Math.min(x.to_return, t.amount)) + '">Вернули вручную</button>' +
              (t.is_test ? ' <span class="pp-test">ТЕСТ</span>' : '');
          }).join('<br>');
          return '<tr><td>' + (x.order_num ? 'Заказ ' + esc(x.order_num) : 'Заявка ' + esc(x.lead_code)) + '<div class="pp-note">' + esc(x.order_status) + '</div></td>' +
            '<td>' + esc(x.client_name) + '<div class="pp-note">' + esc(x.client_phone) + '</div></td>' +
            '<td>' + sum(x.net) + ' / ' + sum(x.paid) + '</td><td><b>' + sum(x.to_return) + '</b></td><td>' + btns + '</td></tr>';
        }).join('') + '</table></div>' : '<div class="pp-note">Возвращать никому не нужно.</div>');
    } catch (e) { el.innerHTML = '<h3>↩️ Кому вернуть деньги</h3><div class="pp-note">' + esc(e.message) + '</div>'; }
  }

  async function loadInst() {
    var el = document.getElementById('ppInst');
    try {
      var r = await api('/pay/admin/installments');
      el.innerHTML = '<h3>🧾 Заявки на рассрочку</h3><div class="pp-note">Клиент нажал «В рассрочку». Оформите рассрочку у вашего партнёра (например, SmartBill) и отметьте здесь.</div>' +
        (r.items.length ? '<div class="pp-wrap"><table><tr><th>Когда</th><th>Заказ</th><th>Клиент</th><th>Сумма</th><th>Комментарий</th><th>Статус</th></tr>' + r.items.map(function (i) {
          return '<tr><td>' + dt(i.created_at) + '</td><td>' + esc(i.order_num) + '</td><td>' + esc(i.client_name) + '<div class="pp-note">' + esc(i.phone) + '</div></td>' +
            '<td>' + (i.amount ? sum(i.amount) : 'после замера') + '</td><td>' + esc(i.client_note) + '<div class="pp-note">' + esc(i.manager_note || '') + '</div></td>' +
            '<td><select data-pp-inst="' + Number(i.id) + '">' + Object.keys(INST).map(function (k) { return '<option value="' + k + '"' + (i.status === k ? ' selected' : '') + '>' + INST[k] + '</option>'; }).join('') + '</select>' +
            '<div class="pp-note">' + esc(i.handled_by || '') + '</div></td></tr>';
        }).join('') + '</table></div>' : '<div class="pp-note">Заявок нет.</div>');
    } catch (e) { el.innerHTML = '<h3>🧾 Заявки на рассрочку</h3><div class="pp-note">' + esc(e.message) + '</div>'; }
  }

  async function loadTx() {
    var el = document.getElementById('ppTx');
    try {
      var r = await api('/pay/admin/tx?limit=200');
      el.innerHTML = '<h3>📋 Журнал платежей</h3>' + (r.tx.length ? '<div class="pp-wrap"><table><tr><th>Когда</th><th>Что</th><th>Клиент</th><th>Сумма</th><th>Карта</th><th>Статус</th><th></th></tr>' + r.tx.map(function (t) {
        var kind = t.kind === 'refund' ? '↩️ возврат' : (t.purpose === 'prepay' ? 'предоплата' : 'оплата');
        return '<tr><td>' + dt(t.created_at) + '</td><td>' + txWhere(t) + '<div class="pp-note">' + kind + (t.is_test ? ' <span class="pp-test">ТЕСТ</span>' : '') + '</div></td>' +
          '<td>' + esc(t.client_name || '') + '<div class="pp-note">' + esc(t.phone || '') + '</div></td><td>' + sum(t.amount) +
          (Number(t.refunded) > 0 ? '<div class="pp-note">возвращено ' + sum(t.refunded) + '</div>' : '') + '</td>' +
          '<td>' + esc(t.card_mask || '') + '</td><td>' + (ST[t.status] || esc(t.status)) + (t.error_code ? '<div class="pp-note">' + esc(t.error_code) + '</div>' : '') +
          (t.done_by ? '<div class="pp-note">' + esc(t.done_by) + (t.note ? ': ' + esc(t.note) : '') + '</div>' : '') + '</td>' +
          '<td>' + (['pending', 'otp', 'review'].indexOf(t.status) >= 0 && t.kind === 'pay' ? '<button class="pp-btn" data-pp="recheck" data-id="' + Number(t.id) + '">Проверить в банке</button>' : '') + '</td></tr>';
      }).join('') + '</table></div>' : '<div class="pp-note">Платежей пока нет.</div>');
    } catch (e) { el.innerHTML = '<h3>📋 Журнал платежей</h3><div class="pp-note">' + esc(e.message) + '</div>'; }
  }

  async function loadLog() {
    var el = document.getElementById('ppLog');
    try {
      var r = await api('/pay/admin/log');
      el.innerHTML = '<h3>🗂 Действия в разделе</h3>' + (r.log.length ? '<table>' + r.log.slice(0, 50).map(function (l) {
        return '<tr><td>' + dt(l.created_at) + '</td><td>' + esc(l.actor) + '</td><td>' + esc(l.action) + '</td><td>' + esc(l.details) + '</td></tr>';
      }).join('') + '</table>' : '<div class="pp-note">Пусто.</div>');
    } catch (e) { el.innerHTML = '<h3>🗂 Действия в разделе</h3><div class="pp-note">' + esc(e.message) + '</div>'; }
  }

  function loadAll() { loadRefunds(); loadInst(); loadTesters(); loadTx(); loadLog(); }

  document.addEventListener('click', async function (e) {
    var b = e.target.closest('.pp-host [data-pp]');
    if (!b) return;
    var k = b.dataset.pp, id = Number(b.dataset.id);
    try {
      if (k === 'edit') { var key = b.dataset.k; editing[key] = !editing[key]; return key === 'settings' ? loadSettings() : loadTesters(); }
      if (k === 'save') return saveSettings();
      if (k === 'check') return checkPlum();
      if (k === 'taddadd') {
        await api('/pay/admin/testers', {method: 'POST', body: {phone: document.getElementById('ppTPhone').value,
          name: document.getElementById('ppTName').value, real_card: document.getElementById('ppTReal').checked}});
        return loadTesters();
      }
      if (k === 'tdel') { if (!confirm('Убрать тестировщика?')) return; await api('/pay/admin/testers/' + id, {method: 'DELETE'}); return loadTesters(); }
      if (k === 'rev') {
        if (!confirm('Вернуть всю сумму на карту клиента через банк?')) return;
        await api('/pay/admin/tx/' + id + '/reverse', {method: 'POST'}); alert('✅ Возврат проведён'); loadRefunds(); loadTx(); return;
      }
      if (k === 'man') {
        var max = Number(b.dataset.max), a = prompt('Сколько вернули клиенту (сум)? Максимум ' + sum(max), String(max));
        if (a === null) return;
        var note = prompt('Как вернули? (например: наличными в офисе, переводом на карту)', '') || '';
        await api('/pay/admin/tx/' + id + '/manual-refund', {method: 'POST', body: {amount: Number(String(a).replace(/\s/g, '')), note: note}});
        loadRefunds(); loadTx(); loadLog(); return;
      }
      if (k === 'recheck') { var r = await api('/pay/admin/tx/' + id + '/recheck', {method: 'POST'}); alert('Статус: ' + (ST[r.status] || r.status)); loadTx(); return; }
    } catch (er) { alert('❌ ' + er.message); }
  });
  document.addEventListener('change', async function (e) {
    var s = e.target.closest('.pp-host [data-pp-inst]');
    if (!s) return;
    var note = s.value === 'done' || s.value === 'rejected' ? (prompt('Заметка (№ договора SmartBill или причина отказа):', '') || undefined) : undefined;
    try { await api('/pay/admin/installments/' + Number(s.dataset.ppInst), {method: 'PATCH', body: note === undefined ? {status: s.value} : {status: s.value, manager_note: note}}); loadInst(); }
    catch (er) { alert('❌ ' + er.message); }
  });

  function hook() {
    var p = document.getElementById('page-pay');
    if (!p) return;
    var was = false;
    new MutationObserver(function () {
      var on = p.classList.contains('active');
      if (on && !was) { if (!p.dataset.ready) { shell(p); p.dataset.ready = '1'; } loadAll(); }
      was = on;
    }).observe(p, {attributes: true, attributeFilter: ['class']});
    if (p.classList.contains('active')) { shell(p); p.dataset.ready = '1'; loadAll(); was = true; }
  }
  function hookSettings() {
    var t = document.getElementById('cstab-plum');
    if (!t) return;
    var shown = false;
    new MutationObserver(function () {
      var on = t.style.display !== 'none';
      if (on && !shown) loadSettings();
      shown = on;
    }).observe(t, {attributes: true, attributeFilter: ['style']});
  }
  function boot() { hook(); hookSettings(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
