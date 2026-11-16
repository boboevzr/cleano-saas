/* Cleano SaaS staff (перенос из ARTEZ) · «↩️ Вернуть предоплату» (онлайн-предоплата PLUM) — 16.11.2026.
   Кнопка видна админу и сотрудникам с правом «Возврат предоплаты» (admin.html → карточка сотрудника).
   - карточка заявки: кнопка ставится из шаблона (payRefundOpen('lead', id));
   - заказ → оплаты: этот файл сам добавляет кнопку над списком оплат, если там есть онлайн-предоплата.
   Возврат на карту — всю сумму и только в день оплаты (так работает банк); иначе — «Вернули вручную».
   Данные клиента в onclick не подставляются: только числовые id. */
(function () {
  'use strict';
  var BASE = (typeof API_BASE !== 'undefined' ? API_BASE : ((window.APP_API_URL || 'https://web-production-eef2a.up.railway.app') + '/api'));
  function tok() { try { return localStorage.getItem('artez_staff_token') || ''; } catch (e) { return ''; } }
  function me() { try { return (typeof currentStaff !== 'undefined' && currentStaff) || null; } catch (e) { return null; } }
  function allowed() { var s = me(); return !!(s && (s.role === 'admin' || s.can_refund_prepay)); }
  function sum(v) { return Number(v || 0).toLocaleString('ru-RU').replace(/,/g, ' '); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  async function api(path, opts) {
    opts = opts || {};
    var r = await fetch(BASE + path, {method: opts.method || 'GET', body: opts.body ? JSON.stringify(opts.body) : undefined,
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok()}});
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) { var det = d.detail; throw new Error(det && typeof det === 'object' ? (det.ru || det.message) : (det || ('Ошибка ' + r.status))); }
    return d;
  }

  var css = '#spRefund{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;' +
    'background:rgba(8,18,24,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}#spRefund.on{display:flex}' +
    '#spRefund .sp-card{width:100%;max-width:440px;max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;background:var(--card,#fff);color:var(--text,#141E1B);border-radius:20px;padding:18px;box-shadow:0 24px 60px rgba(0,0,0,.28)}' +
    '#spRefund h3{margin:0 0 6px;font-size:18px}#spRefund .sp-x{float:right;background:none;border:0;font-size:22px;cursor:pointer;color:inherit}' +
    '#spRefund .sp-tx{border:1px solid var(--border,#e5e7eb);border-radius:14px;padding:12px;margin-top:10px}' +
    '#spRefund .sp-note{font-size:12px;color:var(--text2,#6b7280);margin-top:4px}' +
    '#spRefund .sp-btn{width:100%;margin-top:8px;padding:12px;border-radius:12px;border:0;font-weight:700;font-size:15px;cursor:pointer;background:#1A5C54;color:#fff}' +
    '#spRefund .sp-btn.alt{background:transparent;color:inherit;border:1px solid var(--border,#d1d5db)}#spRefund .sp-btn:disabled{opacity:.5}' +
    '#spRefund input{width:100%;box-sizing:border-box;margin-top:6px;padding:11px 12px;border-radius:12px;border:2px solid var(--border,#d1d5db);background:transparent;color:inherit;font-size:16px;outline:none}' +
    '#spRefund input:focus{border-color:#2CC6B3;box-shadow:0 0 0 4px rgba(44,198,179,.22)}#spRefund .sp-err{color:#dc2626;font-size:13px;margin-top:8px}' +
    '.sp-open{display:inline-flex;align-items:center;gap:6px;margin:6px 0;padding:8px 14px;border-radius:999px;border:1px solid rgba(44,198,179,.6);background:rgba(44,198,179,.12);color:#0F766E;font-weight:800;font-size:13px;cursor:pointer}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var M = null, ctx = null;
  function modal() {
    if (M) return M;
    M = document.createElement('div'); M.id = 'spRefund';
    M.innerHTML = '<div class="sp-card" role="dialog" aria-modal="true"><button class="sp-x" data-sp="close" aria-label="close">×</button><div class="sp-body"></div></div>';
    document.body.appendChild(M);
    M.addEventListener('click', function (e) { if (e.target === M) close(); });
    return M;
  }
  function body() { return modal().querySelector('.sp-body'); }
  function close() { if (M) M.classList.remove('on'); }

  async function load() {
    body().innerHTML = '<h3>↩️ Вернуть предоплату</h3><div class="sp-note">Загрузка…</div>';
    try {
      var q = ctx.kind === 'lead' ? 'lead_id=' + Number(ctx.id) : 'order_id=' + Number(ctx.id);
      var r = await api('/pay/staff/prepay?' + q);
      var list = (r.tx || []).filter(function (t) { return t.left > 0; });
      if (!list.length) { body().innerHTML = '<h3>↩️ Вернуть предоплату</h3><div class="sp-note">Возвращать нечего — предоплата уже возвращена или её нет.</div>'; return; }
      body().innerHTML = '<h3>↩️ Вернуть предоплату</h3><div class="sp-note">Оплачено картой онлайн. «На карту» — банк вернёт всю сумму (только в день оплаты). Иначе верните через кассу и нажмите «Вернули вручную».</div>' +
        list.map(function (t) {
          var d = new Date(t.created_at).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent'});
          return '<div class="sp-tx"><b>' + sum(t.amount) + ' сум</b> · ' + esc(t.card_mask || '') + (t.is_test ? ' · 🧪 тест' : '') +
            '<div class="sp-note">Оплачено ' + esc(d) + (t.left < t.amount ? ' · осталось вернуть ' + sum(t.left) : '') + '</div>' +
            (t.can_reverse ? '<button class="sp-btn" data-sp="rev" data-id="' + Number(t.id) + '" data-amt="' + Number(t.amount) + '">💳 Вернуть на карту ' + sum(t.amount) + ' сум</button>'
                           : '<div class="sp-note">На карту вернуть нельзя (оплата не сегодня или часть уже возвращена) — только вручную.</div>') +
            '<input type="text" inputmode="numeric" id="spAmt' + Number(t.id) + '" value="' + Number(t.left) + '" placeholder="Сумма, сум">' +
            '<input type="text" id="spNote' + Number(t.id) + '" maxlength="200" placeholder="Как вернули: наличными в офисе, переводом…">' +
            '<button class="sp-btn alt" data-sp="man" data-id="' + Number(t.id) + '" data-max="' + Number(t.left) + '">✋ Вернули вручную</button></div>';
        }).join('') + '<div class="sp-err" id="spErr"></div>';
    } catch (e) { body().innerHTML = '<h3>↩️ Вернуть предоплату</h3><div class="sp-err">' + esc(e.message) + '</div>'; }
  }

  function done(msg) {
    close();
    try { if (typeof showToast === 'function') showToast(msg, 'success'); else alert(msg); } catch (e) { alert(msg); }
    try { if (ctx && ctx.kind === 'order' && typeof sLoadPaymentModal === 'function') sLoadPaymentModal(); } catch (e) {}
    try { if (ctx && ctx.kind === 'lead' && typeof loadLeads === 'function') loadLeads(); } catch (e) {}
  }

  window.payRefundOpen = function (kind, id) {
    if (!allowed()) return;
    ctx = {kind: kind === 'order' ? 'order' : 'lead', id: Number(id)};
    modal().classList.add('on');
    load();
  };

  document.addEventListener('click', async function (e) {
    var b = e.target.closest('#spRefund [data-sp]');
    if (!b) return;
    var k = b.dataset.sp, id = Number(b.dataset.id), err = document.getElementById('spErr');
    if (k === 'close') return close();
    try {
      if (k === 'rev') {
        if (!confirm('Вернуть ' + sum(b.dataset.amt) + ' сум на карту клиента через банк?')) return;
        b.disabled = true;
        await api('/pay/staff/tx/' + id + '/reverse', {method: 'POST'});
        return done('✅ Предоплата возвращена на карту');
      }
      if (k === 'man') {
        var amt = Number(String((document.getElementById('spAmt' + id) || {}).value || '').replace(/\s/g, ''));
        var note = (document.getElementById('spNote' + id) || {}).value || '';
        if (!(amt > 0) || amt > Number(b.dataset.max)) { if (err) err.textContent = 'Сумма от 1 до ' + sum(b.dataset.max); return; }
        if (!note.trim()) { if (err) err.textContent = 'Напишите, как вернули (наличными, переводом…)'; return; }
        if (!confirm('Отметить: клиенту вернули ' + sum(amt) + ' сум вручную?')) return;
        b.disabled = true;
        await api('/pay/staff/tx/' + id + '/manual-refund', {method: 'POST', body: {amount: amt, note: note}});
        return done('✅ Отмечено: вернули вручную');
      }
    } catch (er) { b.disabled = false; if (err) err.textContent = er.message; }
  });

  /* Заказ → оплаты: кнопка над списком, если в оплатах есть онлайн-предоплата */
  function decoratePayments() {
    var list = document.getElementById('s_pm_list');
    if (!list || !allowed()) return;
    var map = window._sPmPaymentsMap || {};
    var has = Object.keys(map).some(function (k) { var p = map[k]; return p && String(p.method || '').indexOf('online') === 0 && p.purpose === 'prepayment' && Number(p.amount) > 0; });
    var old = document.getElementById('spOrderBtn');
    if (!has) { if (old) old.remove(); return; }
    if (old) return;
    var oid = (typeof _sOrderId !== 'undefined') ? Number(_sOrderId) : 0;
    if (!oid) return;
    var btn = document.createElement('button');
    btn.id = 'spOrderBtn'; btn.className = 'sp-open'; btn.type = 'button';
    btn.textContent = '↩️ Вернуть предоплату';
    btn.addEventListener('click', function () { window.payRefundOpen('order', oid); });
    list.parentNode.insertBefore(btn, list);
  }
  function hook() {
    var list = document.getElementById('s_pm_list');
    if (list) new MutationObserver(decoratePayments).observe(list, {childList: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
