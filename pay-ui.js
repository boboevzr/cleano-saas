/* Cleano SaaS (перенос из ARTEZ) · онлайн-оплата картой (PLUM, Uzcard/Humo) и рассрочка в кабинете сайта — Э3, 2026-11-15.
   Отдельный файл, чтобы не пересекаться с правками index.html из других сессий: сам находит карточки
   заказов (#drOrdersList .oc-full) и экран «Заявка принята» (#successOrderNum) и добавляет блок оплаты.
   Номер карты никуда не сохраняется — уходит только на сервер Cleano (дальше в банк), в поле — маска ввода.
   Данные клиента в onclick не подставляем (правило XSS): обработчики через делегирование, в атрибутах — только номер заказа. */
(function () {
  'use strict';
  var API = (window.ARTEZ_API_BASE || ((window.APP_API_URL || 'https://web-production-eef2a.up.railway.app') + '/api'));  // SaaS: API из config.js
  var cfg = null, cfgFor = null, infoCache = {};

  function token() { try { return localStorage.getItem('artez_token') || ''; } catch (e) { return ''; } }
  function lang() { var l = 'uz'; try { l = localStorage.getItem('artez_lang') || 'uz'; } catch (e) {} return l === 'ru' ? 'ru' : 'uz'; }
  function L(ru, uz) {
    if (lang() === 'ru') return ru;
    // «ЎЗ» (узбекская кириллица): тот же узбекский текст через _toCyrl сайта (index.html), если она доступна
    var raw = ''; try { raw = localStorage.getItem('artez_lang') || ''; } catch (e) {}
    if (raw === 'uz_cyrl' && typeof _toCyrl === 'function') { try { return _toCyrl(uz); } catch (e) {} }
    return uz;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function sum(v) { return Number(v || 0).toLocaleString('ru-RU').replace(/,/g, ' '); }
  function safeNum(n) { return /^[\w#-]{1,40}$/.test(n || '') ? n : null; }

  async function api(path, opts) {
    opts = opts || {};
    var r = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: Object.assign({'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token()}, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      var det = d.detail, msg;
      if (det && typeof det === 'object') msg = lang() === 'ru' ? (det.ru || det.message) : (det.uz || det.message);
      else msg = typeof det === 'string' ? det : L('Ошибка сервера', 'Server xatosi');
      var e = new Error(msg); e.code = det && det.code; e.status = r.status; throw e;
    }
    return d;
  }

  async function getCfg() {
    var t = token();
    if (!t) return null;
    if (cfg && cfgFor === t) return cfg;
    try { cfg = await api('/pay/config'); cfgFor = t; } catch (e) { cfg = null; }
    return cfg;
  }

  /* ── стили (цвета — переменные темы сайта, сами переключаются в тёмной теме) ── */
  var css = '' +
    '.pay-box{margin-top:10px;padding:12px;border-radius:14px;background:var(--sand-card,#fff);border:1px solid var(--line,#e5e7eb)}' +
    '.pay-box .pay-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}' +
    '.pay-btn{flex:1;min-width:150px;padding:12px 14px;border-radius:12px;border:0;font-weight:700;font-size:15px;cursor:pointer;background:var(--teal,#1A5C54);color:#fff}' +
    '.pay-btn.alt{background:transparent;color:var(--ink,#141E1B);border:1px solid var(--line,#e5e7eb)}' +
    '.pay-btn:disabled{opacity:.55;cursor:default}' +
    '.pay-due{font-weight:800;font-size:17px;color:var(--ink,#141E1B)}' +
    '.pay-sub{font-size:12px;color:var(--text2,#6b7280);margin-top:3px}' +
    '.pay-test{font-size:11px;margin-top:8px;padding:6px 8px;border-radius:8px;background:rgba(232,168,60,.15);color:var(--ink,#141E1B)}' +
    '.pay-ok{color:#15803d;font-weight:700}' +
    /* окно — по центру экрана, фон размыт (16.11: просьба владельца) */
    '#payModal{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;' +
      'background:rgba(8,18,24,.42);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}' +
    '#payModal.on{display:flex}' +
    '#payModal .pm-card{width:100%;max-width:440px;max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;background:var(--sand-card,#fff);color:var(--ink,#141E1B);' +
      'border-radius:22px;padding:20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.28);animation:pmIn .18s ease-out}' +
    '@keyframes pmIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}' +
    /* поле с курсором — бирюзовая рамка с мягким свечением; ошибка — красная рамка */
    '#payModal input[type=text],#payModal input[type=tel]{transition:border-color .15s,box-shadow .15s;outline:none;border-width:2px!important}' +
    '#payModal input[type=text]:focus,#payModal input[type=tel]:focus{border-color:#2CC6B3!important;box-shadow:0 0 0 4px rgba(44,198,179,.22),0 0 18px rgba(44,198,179,.25)}' +
    '#payModal input.pm-bad,#payModal input.pm-bad:focus{border-color:#E5484D!important;box-shadow:0 0 0 4px rgba(229,72,77,.18)}' +
    '#payModal #pmOtp{font-size:26px;letter-spacing:10px;text-align:center;font-weight:700}' +
    '#payModal h3{margin:0 0 4px;font-size:18px}' +
    '#payModal .pm-amt{font-size:26px;font-weight:800;margin:6px 0 14px}' +
    '#payModal label{display:block;font-size:12px;color:var(--text2,#6b7280);margin:10px 0 4px}' +
    '#payModal input[type=text],#payModal input[type=tel]{width:100%;box-sizing:border-box;padding:13px 12px;border-radius:12px;border:1px solid var(--line,#e5e7eb);background:transparent;color:inherit;font-size:17px;letter-spacing:.5px}' +
    '#payModal .pm-cards{display:flex;flex-direction:column;gap:8px}' +
    '#payModal .pm-cardrow{display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;border:1px solid var(--line,#e5e7eb);cursor:pointer}' +
    '#payModal .pm-cardrow.sel{border-color:var(--teal,#1A5C54);box-shadow:0 0 0 2px var(--teal,#1A5C54) inset}' +
    '#payModal .pm-del{margin-left:auto;background:none;border:0;color:var(--text2,#6b7280);font-size:18px;cursor:pointer}' +
    '#payModal .pm-err{color:#dc2626;font-size:13px;margin-top:10px;min-height:16px}' +
    '#payModal .pm-x{float:right;background:none;border:0;font-size:22px;color:inherit;cursor:pointer}' +
    '#payModal .pm-chk{display:flex;align-items:center;gap:8px;font-size:14px;margin-top:12px;color:inherit}' +
    '#payModal .pm-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}' +
    '#payModal .pm-chip{padding:8px 12px;border-radius:999px;border:1px solid var(--line,#e5e7eb);background:transparent;color:inherit;font-weight:700;font-size:14px;cursor:pointer}' +
    '#payModal .pm-chip.on{border-color:#2CC6B3;background:rgba(44,198,179,.14);color:var(--teal,#1A5C54)}' +
    '#payModal #pmAmt{font-size:20px;font-weight:800}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ── блок в карточке заказа ── */
  function boxHtml(info, c) {
    var h = '';
    if (info.open_tx && info.open_tx.status === 'otp') {
      h += '<div class="pay-due">' + L('Оплата ждёт код из SMS', 'To\'lov SMS kodini kutmoqda') + '</div>' +
        '<div class="pay-row"><button class="pay-btn" data-pay-act="resume" data-num="' + esc(info.order_num) + '" data-tx="' + Number(info.open_tx.id) + '">' + L('Ввести код', 'Kodni kiritish') + '</button></div>';
    } else if (info.open_tx) {
      h += '<div class="pay-sub">⏳ ' + L('Оплата проверяется банком — обновите через минуту', 'To\'lov bankda tekshirilmoqda — bir daqiqadan keyin yangilang') + '</div>';
    } else if (info.can_pay) {
      h += '<div class="pay-due">' + L('К оплате', 'To\'lov uchun') + ': ' + sum(info.due) + ' ' + L('сум', 'so\'m') + '</div>' +
        (info.paid > 0 ? '<div class="pay-sub">' + L('Уже внесено', 'To\'langan') + ': ' + sum(info.paid) + '</div>' : '') +
        '<div class="pay-row"><button class="pay-btn" data-pay-act="pay" data-num="' + esc(info.order_num) + '">💳 ' + L('Оплатить картой', 'Karta bilan to\'lash') + '</button>' +
        (info.can_installment ? '<button class="pay-btn alt" data-pay-act="inst" data-num="' + esc(info.order_num) + '">🧾 ' + L('В рассрочку', 'Muddatli to\'lov') + '</button>' : '') + '</div>' +
        '<div class="pay-sub">' + L('Можно и наличными курьеру при доставке', 'Yetkazishda kuryerga naqd ham mumkin') + '</div>';
    } else if (info.can_prepay) {
      h += '<div class="pay-sub">' + L('Сумма заказа появится после замера. Можно внести предоплату — остаток оплатите после замера.',
        'Buyurtma summasi o\'lchovdan keyin chiqadi. Oldindan to\'lov qilish mumkin — qolganini o\'lchovdan keyin to\'laysiz.') + '</div>' +
        '<div class="pay-row"><button class="pay-btn" data-pay-act="prepay" data-num="' + esc(info.order_num) + '">💳 ' + L('Предоплата', 'Oldindan to\'lov') + ' ' + sum(info.prepay_amount) + ' ' + L('сум', 'so\'m') + '</button>' +
        (info.can_installment ? '<button class="pay-btn alt" data-pay-act="inst" data-num="' + esc(info.order_num) + '">🧾 ' + L('В рассрочку', 'Muddatli to\'lov') + '</button>' : '') + '</div>';
    } else if (info.paid > 0 && info.due === 0 && info.measured) {
      h += '<div class="pay-ok">✅ ' + L('Оплачено', 'To\'langan') + ': ' + sum(info.paid) + ' ' + L('сум', 'so\'m') + '</div>';
    } else if (info.paid > 0) {
      h += '<div class="pay-ok">✅ ' + L('Внесено', 'To\'langan') + ': ' + sum(info.paid) + ' ' + L('сум', 'so\'m') + '</div>';
    }
    if (info.installment) {
      var s = info.installment.status;
      var lbl = {new: L('отправлена менеджеру', 'menejerga yuborildi'), in_work: L('в работе', 'ko\'rib chiqilmoqda'),
                 done: L('оформлена', 'rasmiylashtirildi'), rejected: L('отклонена', 'rad etildi')}[s] || s;
      h += '<div class="pay-sub">🧾 ' + L('Заявка на рассрочку', 'Muddatli to\'lov arizasi') + ': ' + esc(lbl) + '</div>';
    }
    if (!h) return '';
    if (c && c.test_bank) h += '<div class="pay-test">🧪 ' + L('Тестовый режим: настоящие деньги не списываются. Карта', 'Test rejimi: haqiqiy pul yechilmaydi. Karta') + ' 8600 1234 5678 9012 · 12/30 · SMS 111111</div>';
    return h;
  }

  async function decorate(card) {
    var num = safeNum((card.id || '').replace(/^oc-/, ''));
    if (!num || card.dataset.payDone) return;
    card.dataset.payDone = '1';  // сразу, до await — иначе два пересчёта подряд вставят блок дважды
    var c = await getCfg();
    if (!c || !c.enabled) return;
    var box = document.createElement('div');
    box.className = 'pay-box'; box.style.display = 'none'; box.dataset.num = num;
    var anchor = card.querySelector('.oc-details');
    if (anchor) card.insertBefore(box, anchor); else card.appendChild(box);
    await refreshBox(num);
  }

  async function refreshBox(num) {
    var box = document.querySelector('.pay-box[data-num="' + num + '"]');
    if (!box) return;
    try {
      var info = await api('/pay/orders/' + encodeURIComponent(num));
      infoCache[num] = info;
      var h = boxHtml(info, cfg);
      box.innerHTML = h; box.style.display = h ? '' : 'none';
    } catch (e) { box.style.display = 'none'; }
  }

  function scan() {
    if (!token()) return;
    document.querySelectorAll('#drOrdersList .oc-full.oc-active').forEach(function (card) { decorate(card); });
  }

  /* ── экран «Заявка принята»: предложить предоплату ── */
  var lastLead = null;
  async function leadOffer() {
    var badge = document.getElementById('successOrderNum');
    var wrap = document.getElementById('orderSuccess');
    if (!badge || !wrap || wrap.style.display === 'none') return;
    var code = (badge.textContent || '').trim();
    if (!code || code === lastLead || !token()) return;
    lastLead = code;
    var old = document.getElementById('payLeadOffer'); if (old) old.remove();
    var c = await getCfg();
    if (!c || !c.enabled) return;
    try {
      var info = await api('/pay/lead/' + encodeURIComponent(code));
      if (!info.can_prepay) return;
      var d = document.createElement('div');
      d.id = 'payLeadOffer'; d.className = 'pay-box'; d.style.textAlign = 'left'; d.style.margin = '12px 0';
      d.innerHTML = '<div class="pay-due">' + L('Предоплата — по желанию', 'Oldindan to\'lov — xohishingizga ko\'ra') + '</div>' +
        '<div class="pay-sub">' + L('Можно сразу внести', 'Hozir to\'lash mumkin') + ' ' + sum(info.prepay_amount) + ' ' + L('сум картой. Остаток — после замера ковров.', 'so\'m karta bilan. Qolgani — gilamlar o\'lchangandan keyin.') + '</div>' +
        '<div class="pay-row"><button class="pay-btn" data-pay-act="leadpay">💳 ' + L('Внести', 'To\'lash') + ' ' + sum(info.prepay_amount) + ' ' + L('сум', 'so\'m') + '</button></div>' +
        (c.test_bank ? '<div class="pay-test">🧪 ' + L('Тестовый режим. Карта', 'Test rejimi. Karta') + ' 8600 1234 5678 9012 · 12/30 · SMS 111111</div>' : '');
      d.dataset.code = code;
      badge.insertAdjacentElement('afterend', d);
    } catch (e) { /* заявка не этого клиента или вход не выполнен — без предложения */ }
  }

  /* ── окно оплаты ── */
  var M = null, ctx = null;
  function modal() {
    if (M) return M;
    M = document.createElement('div'); M.id = 'payModal';
    M.innerHTML = '<div class="pm-card" role="dialog" aria-modal="true"><button class="pm-x" data-pm="close" aria-label="close">×</button><div class="pm-body"></div></div>';
    document.body.appendChild(M);
    M.addEventListener('click', function (e) { if (e.target === M) close(); });
    return M;
  }
  function body() { return modal().querySelector('.pm-body'); }
  function open() { modal().classList.add('on'); }
  function close() {
    if (M) M.classList.remove('on');
    if (ctx && ctx.timer) clearInterval(ctx.timer);
    var n = ctx && ctx.num; ctx = null;
    if (n) refreshBox(n);
    var lo = document.getElementById('payLeadOffer');
    if (lo && lo.dataset.paid) lo.innerHTML = '<div class="pay-ok">✅ ' + L('Предоплата внесена. Спасибо!', 'Oldindan to\'lov qabul qilindi. Rahmat!') + '</div>';
  }
  function err(msg) {
    var e = body().querySelector('.pm-err'); if (e) e.textContent = msg || '';
    // ошибка — красная рамка у полей ввода; снимается при следующем вводе
    body().querySelectorAll('input[type=tel],input[type=text]').forEach(function (i) { i.classList.toggle('pm-bad', !!msg); });
  }
  document.addEventListener('input', function (e) { if (e.target && e.target.closest && e.target.closest('#payModal')) { e.target.classList.remove('pm-bad'); } });
  function busy(on) { body().querySelectorAll('button,input').forEach(function (b) { b.disabled = !!on; }); }

  function fmtCard(v) { return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); }
  function fmtExp(v) { var d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; }

  async function startFlow(kind, num, amount, lim) {
    ctx = {kind: kind, num: kind === 'lead' ? null : num, code: kind === 'lead' ? num : null, purpose: (kind === 'prepay' || kind === 'lead') ? 'prepay' : 'balance', amount: amount, card: null,
      min: lim && lim.prepay_min, max: lim && lim.prepay_max};
    var cards = [];
    try { cards = (await api('/pay/cards')).cards || []; } catch (e) {}
    ctx.card = cards.length ? cards[0].id : 'new';
    renderChoose(cards);
    open();
  }

  function renderChoose(cards) {
    var title = ctx.purpose === 'prepay' ? L('Предоплата', 'Oldindan to\'lov') : L('Оплата заказа', 'Buyurtma to\'lovi');
    var h = '<h3>' + title + (ctx.num ? ' · ' + esc(ctx.num) : '') + '</h3>' +
      '<div class="pm-amt" id="pmAmtShow">' + sum(ctx.amount) + ' ' + L('сум', 'so\'m') + '</div>' + amountPicker() + '<div class="pm-cards">';
    cards.forEach(function (k) {
      h += '<div class="pm-cardrow' + (ctx.card === k.id ? ' sel' : '') + '" data-pm="pick" data-card="' + Number(k.id) + '">💳 <b>' + esc(k.mask) + '</b>' +
        '<span class="pay-sub" style="margin:0">' + (k.type === 'humo' ? 'Humo' : 'Uzcard') + '</span>' +
        '<button class="pm-del" data-pm="del" data-card="' + Number(k.id) + '" title="' + L('Удалить карту', 'Kartani o\'chirish') + '">✕</button></div>';
    });
    h += '<div class="pm-cardrow' + (ctx.card === 'new' ? ' sel' : '') + '" data-pm="pick" data-card="new">➕ ' + L('Новая карта Uzcard / Humo', 'Yangi karta Uzcard / Humo') + '</div></div>';
    if (ctx.card === 'new') {
      h += '<label>' + L('Номер карты', 'Karta raqami') + '</label><input type="tel" inputmode="numeric" autocomplete="cc-number" id="pmNum" maxlength="19" placeholder="8600 0000 0000 0000">' +
        '<label>' + L('Срок (ММ/ГГ)', 'Muddati (OO/YY)') + '</label><input type="tel" inputmode="numeric" autocomplete="cc-exp" id="pmExp" maxlength="5" placeholder="12/30" style="max-width:140px">' +
        '<label class="pm-chk"><input type="checkbox" id="pmSave" checked> ' + L('Запомнить карту для следующих оплат', 'Kartani keyingi to\'lovlar uchun saqlash') + '</label>';
    }
    h += '<div class="pm-err"></div><div class="pay-row"><button class="pay-btn" data-pm="go" id="pmGo">' + L('Оплатить', 'To\'lash') + ' ' + sum(ctx.amount) + '</button></div>' +
      '<div class="pay-sub" style="margin-top:10px">🔒 ' + L('Оплата через PLUM (Uzcard/Humo). Номер карты мы не храним.', 'To\'lov PLUM orqali (Uzcard/Humo). Karta raqamini saqlamaymiz.') + '</div>';
    body().innerHTML = h;
    bindAmount();
    var n = document.getElementById('pmNum'), x = document.getElementById('pmExp');
    if (n) { n.addEventListener('input', function () { n.value = fmtCard(n.value); }); setTimeout(function () { n.focus(); }, 50); }
    if (x) x.addEventListener('input', function (ev) {
      // «/» появляется сам после двух цифр месяца; при стирании — не мешает
      var del = ev && /^delete/.test(ev.inputType || '');
      var d = x.value.replace(/\D/g, '').slice(0, 4);
      x.value = (!del && d.length === 2) ? d + '/' : fmtExp(x.value);
    });
  }

  /* Предоплата — сумму выбирает клиент (16.11): быстрые суммы + своё число, в пределах с сервера */
  function amountPicker() {
    if (ctx.purpose !== 'prepay' || !ctx.min || !ctx.max) return '';
    var chips = [50000, 100000, 150000, 200000].filter(function (v) { return v >= ctx.min && v <= ctx.max; });
    return '<label>' + L('Сумма предоплаты', 'Oldindan to\'lov summasi') + '</label>' +
      '<div class="pm-chips">' + chips.map(function (v) {
        return '<button type="button" class="pm-chip' + (v === ctx.amount ? ' on' : '') + '" data-pm="amt" data-v="' + v + '">' + sum(v) + '</button>';
      }).join('') + '</div>' +
      '<input type="tel" inputmode="numeric" id="pmAmt" value="' + sum(ctx.amount) + '" aria-label="amount">' +
      '<div class="pay-sub">' + L('Своя сумма: от ', 'O\'z summangiz: ') + sum(ctx.min) + L(' до ', ' dan ') + sum(ctx.max) + L(' сум', ' so\'mgacha') + '</div>';
  }
  function setAmount(v, fromInput) {
    ctx.amount = v;
    var show = document.getElementById('pmAmtShow'), btn = document.getElementById('pmGo'), inp = document.getElementById('pmAmt');
    if (show) show.textContent = sum(v) + ' ' + L('сум', 'so\'m');
    if (btn) btn.textContent = L('Оплатить', 'To\'lash') + ' ' + sum(v);
    if (inp && !fromInput) inp.value = sum(v);
    body().querySelectorAll('.pm-chip').forEach(function (c) { c.classList.toggle('on', Number(c.dataset.v) === v); });
  }
  function bindAmount() {
    var inp = document.getElementById('pmAmt');
    if (!inp) return;
    inp.addEventListener('input', function () {
      var d = Number(inp.value.replace(/\D/g, '').slice(0, 9)) || 0;
      inp.value = d ? sum(d) : '';
      setAmount(d, true);
    });
  }
  function amountOk() {
    if (ctx.purpose !== 'prepay' || !ctx.min) return true;
    var v = Number(ctx.amount) || 0;
    if (v < ctx.min || v > ctx.max) { err(L('Сумма предоплаты — от ', 'Oldindan to\'lov — ') + sum(ctx.min) + L(' до ', ' dan ') + sum(ctx.max) + L(' сум', ' so\'mgacha')); return false; }
    if (v % 1000) { setAmount(v - v % 1000); }
    return true;
  }

  async function go() {
    if (!amountOk()) return;
    err(''); busy(true);
    try {
      var payBody = {lang: lang()};
      if (ctx.card === 'new') {
        var num = (document.getElementById('pmNum') || {}).value || '', exp = (document.getElementById('pmExp') || {}).value || '';
        var save = (document.getElementById('pmSave') || {}).checked;
        if (save) {
          var b = await api('/pay/cards', {method: 'POST', body: {number: num, expire: exp, lang: lang()}});
          if (b.already) { ctx.card = b.card.id; payBody.card_id = b.card.id; }
          else { ctx.bindSession = b.session; renderOtp(b.otp_phone, 'bind'); return; }
        } else {
          payBody.card = {number: num, expire: exp};
        }
      } else {
        payBody.card_id = ctx.card;
      }
      await doPay(payBody);
    } catch (e) { busy(false); err(e.message); }
  }

  async function doPay(payBody) {
    if (ctx.purpose === 'prepay') { payBody.purpose = 'prepay'; payBody.amount = ctx.amount; }
    var path = ctx.code ? '/pay/lead/' + encodeURIComponent(ctx.code) + '/pay' : '/pay/orders/' + encodeURIComponent(ctx.num) + '/pay';
    var r = await api(path, {method: 'POST', body: payBody});
    handleTx(r);
  }

  function handleTx(r) {
    ctx.tx = r.tx_id;
    if (r.status === 'otp') return renderOtp(r.otp_phone, 'pay', r.resend_in);
    if (r.status === 'paid') return renderDone(true);
    if (r.status === 'pending' || r.status === 'review') return renderPending();
    renderDone(false, r.error_ru ? L(r.error_ru, r.error_uz) : L('Платёж не прошёл', 'To\'lov o\'tmadi'));
  }

  function renderOtp(phone, kind, resendIn) {
    ctx.otpKind = kind;
    body().innerHTML = '<h3>' + L('Код из SMS', 'SMS kodi') + '</h3>' +
      '<div class="pay-sub">' + L('Банк отправил код на номер', 'Bank kodni yubordi') + ' ' + esc(phone || '') + '</div>' +
      '<label>' + L('Код', 'Kod') + '</label><input type="tel" inputmode="numeric" autocomplete="one-time-code" id="pmOtp" maxlength="8" pattern="[0-9]*" autofocus placeholder="••••••">' +
      '<div class="pm-err"></div><div class="pay-row"><button class="pay-btn" data-pm="otp">' + L('Подтвердить', 'Tasdiqlash') + '</button></div>' +
      (kind === 'pay' ? '<div class="pay-row"><button class="pay-btn alt" data-pm="resend" id="pmResend"></button></div>' : '');
    var o = document.getElementById('pmOtp'); setTimeout(function () { o && o.focus(); }, 50);
    o.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmOtp(); });
    if (kind === 'pay') tickResend(resendIn == null ? 120 : resendIn);
  }

  function tickResend(sec) {
    if (ctx.timer) clearInterval(ctx.timer);
    var b = document.getElementById('pmResend'); if (!b) return;
    var left = sec;
    function draw() { b.disabled = left > 0; b.textContent = left > 0 ? L('Новый код через ', 'Yangi kod ') + left + L(' с', ' s dan keyin') : L('Отправить код ещё раз', 'Kodni qayta yuborish'); }
    draw();
    ctx.timer = setInterval(function () { left--; draw(); if (left <= 0) clearInterval(ctx.timer); }, 1000);
  }

  async function confirmOtp() {
    var otp = ((document.getElementById('pmOtp') || {}).value || '').replace(/\D/g, '');
    err(''); busy(true);
    try {
      if (ctx.otpKind === 'bind') {
        var c = await api('/pay/cards/confirm', {method: 'POST', body: {session: ctx.bindSession, otp: otp, lang: lang()}});
        ctx.card = c.card.id;
        await doPay({lang: lang(), card_id: c.card.id});
        return;
      }
      var r = await api('/pay/tx/' + Number(ctx.tx) + '/confirm', {method: 'POST', body: {otp: otp}});
      handleTx(r);
    } catch (e) {
      busy(false); err(e.message);
      if (e.code && e.code !== 'plum_otp_invalid' && ctx.otpKind === 'pay') renderDone(false, e.message);
    }
  }

  function renderPending() {
    body().innerHTML = '<h3>⏳ ' + L('Проверяем оплату', 'To\'lov tekshirilmoqda') + '</h3><div class="pay-sub">' +
      L('Банк ещё не ответил. Обычно это занимает до минуты — деньги дважды не спишутся.', 'Bank hali javob bermadi. Odatda bu bir daqiqagacha — pul ikki marta yechilmaydi.') + '</div>';
    var tries = 0;
    var t = setInterval(async function () {
      tries++;
      try {
        var r = await api('/pay/tx/' + Number(ctx.tx));
        if (r.status !== 'pending') { clearInterval(t); handleTx(r); }
      } catch (e) {}
      if (tries > 20) clearInterval(t);
    }, 4000);
    ctx.timer = t;
  }

  function renderDone(ok, msg) {
    if (ctx.timer) clearInterval(ctx.timer);
    if (ok) { var lo = document.getElementById('payLeadOffer'); if (lo && ctx.code) lo.dataset.paid = '1'; }
    body().innerHTML = (ok
      ? '<h3>✅ ' + L('Оплачено', 'To\'landi') + '</h3><div class="pm-amt">' + sum(ctx.amount) + ' ' + L('сум', 'so\'m') + '</div><div class="pay-sub">' + L('Спасибо! Оплата отразится в заказе.', 'Rahmat! To\'lov buyurtmada ko\'rinadi.') + '</div>'
      : '<h3>❌ ' + L('Оплата не прошла', 'To\'lov o\'tmadi') + '</h3><div class="pay-sub">' + esc(msg || '') + '</div>') +
      '<div class="pay-row"><button class="pay-btn" data-pm="close">' + L('Готово', 'Tayyor') + '</button></div>';
    if (ctx.num) delete infoCache[ctx.num];
  }

  async function installment(num) {
    ctx = {num: num};
    body().innerHTML = '<h3>🧾 ' + L('Рассрочка', 'Muddatli to\'lov') + '</h3>' +
      '<div class="pay-sub">' + L('Оформляем через SmartBill. Менеджер позвонит и поможет оформить — понадобится паспорт и карта.',
        'SmartBill orqali rasmiylashtiramiz. Menejer qo\'ng\'iroq qilib yordam beradi — pasport va karta kerak bo\'ladi.') + '</div>' +
      '<label>' + L('Комментарий (необязательно)', 'Izoh (ixtiyoriy)') + '</label><input type="text" id="pmInstNote" maxlength="300" placeholder="' + L('например, на 3 месяца', 'masalan, 3 oyga') + '">' +
      '<div class="pm-err"></div><div class="pay-row"><button class="pay-btn" data-pm="inst">' + L('Отправить заявку', 'Ariza yuborish') + '</button></div>';
    open();
  }

  async function sendInst() {
    err(''); busy(true);
    try {
      await api('/pay/orders/' + encodeURIComponent(ctx.num) + '/installment', {method: 'POST', body: {note: (document.getElementById('pmInstNote') || {}).value || ''}});
      body().innerHTML = '<h3>✅ ' + L('Заявка отправлена', 'Ariza yuborildi') + '</h3><div class="pay-sub">' + L('Менеджер свяжется с вами.', 'Menejer siz bilan bog\'lanadi.') + '</div>' +
        '<div class="pay-row"><button class="pay-btn" data-pm="close">' + L('Готово', 'Tayyor') + '</button></div>';
    } catch (e) { busy(false); err(e.message); }
  }

  document.addEventListener('click', async function (e) {
    var a = e.target.closest('[data-pay-act]');
    if (a) {
      e.preventDefault();
      var act = a.dataset.payAct, num = safeNum(a.dataset.num), info = num && infoCache[num];
      if (act === 'pay' && info) startFlow('balance', num, info.due);
      else if (act === 'prepay' && info) startFlow('prepay', num, info.prepay_amount, info);
      else if (act === 'inst' && num) installment(num);
      else if (act === 'resume' && num) { ctx = {num: num, tx: Number(a.dataset.tx), amount: info && info.open_tx ? info.open_tx.amount : 0}; renderOtp('', 'pay', 0); open(); }
      else if (act === 'leadpay') {
        var lo = document.getElementById('payLeadOffer'), c = await getCfg();
        if (lo && safeNum(lo.dataset.code)) startFlow('lead', lo.dataset.code, c ? c.prepay_amount : 0, c);
      }
      return;
    }
    var p = e.target.closest('#payModal [data-pm]');
    if (!p) return;
    var k = p.dataset.pm;
    if (k === 'close') close();
    else if (k === 'del') {
      e.stopPropagation();
      if (!confirm(L('Удалить сохранённую карту?', 'Saqlangan karta o\'chirilsinmi?'))) return;
      try { await api('/pay/cards/' + Number(p.dataset.card), {method: 'DELETE'}); } catch (er) {}
      var cards = []; try { cards = (await api('/pay/cards')).cards || []; } catch (er) {}
      ctx.card = cards.length ? cards[0].id : 'new'; renderChoose(cards);
    } else if (k === 'pick') {
      ctx.card = p.dataset.card === 'new' ? 'new' : Number(p.dataset.card);
      var cs = []; try { cs = (await api('/pay/cards')).cards || []; } catch (er) {}
      renderChoose(cs);
    } else if (k === 'amt') { setAmount(Number(p.dataset.v)); err(''); }
    else if (k === 'go') go();
    else if (k === 'otp') confirmOtp();
    else if (k === 'resend') {
      try { var r = await api('/pay/tx/' + Number(ctx.tx) + '/resend', {method: 'POST'}); tickResend(r.resend_in || 120); err(''); }
      catch (er) { err(er.message); }
    } else if (k === 'inst') sendInst();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && M && M.classList.contains('on')) close(); });

  /* следим за перерисовкой списка заказов и экрана «Заявка принята» */
  var pend = null;
  new MutationObserver(function () {
    if (pend) return;
    pend = setTimeout(function () { pend = null; scan(); leadOffer(); }, 150);
  }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['style']});
  window.addEventListener('storage', function () { cfg = null; });
  scan();
})();
