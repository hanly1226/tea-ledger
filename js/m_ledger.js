'use strict';
// ============ 6️⃣ 运营台账 ============
// 所有账本统一为「订单」模型：一个订单可含多种产品，每项含单价/数量/小计，自动合计总价。
const INV_OPTS = ['增值税普通发票', '增值税专用发票', '电子发票', '暂不开发票'];
// 订购类型别名归一：历史「员工」与现行「职工」视为同一类，统一并入「职工」
const OTYPE_ALIAS = { '员工': '职工' };
const LedgerMod = {
  curBook: 'linfang',
  month: todayStr().slice(0, 7),
  year: String(new Date().getFullYear()),
  viewMode: 'year',            // 默认按年查看（整年记录 + 年度分析）；可用「时间段」筛选任意区间
  dateFrom: '',                // 时间段起始（YYYY-MM-DD），留空=不限
  dateTo: '',                  // 时间段结束（YYYY-MM-DD），留空=不限
  curOtype: '',                // 月饼门店台账按订购类型分小标签；''=全部
  editId: null,
  weekOffset: 0,
  weekCustomStart: '',
  weekCustomLen: 7,
  BOOKS: {
    linfang:  {title: '临方中心产品入库登记', icon: '📦', pays: null, amount: true},
    sales:    {title: '中药茶饮销售登记', icon: '🍵', pays: ['微信/支付宝', '小程序', '现金', '挂号', '食堂卡', '未付款', '院内', '单位'], amount: true},
    reception:{title: '院内接待推广产品登记', icon: '🤝', amount: true, head: {key: 'contact', label: '联系人'}, dept: {label: '科室', opts: ['中医科','康复科','理疗科','护理部','治未病科','营养科']}},
    bracelet: {title: '合香产品销售登记', icon: '📿', pays: ['微信/支付宝', '小程序', '现金', '挂号', '食堂卡', '未付款', '院内', '单位'], amount: true},
    group:    {title: '单位订购产品登记', icon: '🛒', pays: ['扫码（伊尹）', '转账（伊尹）', '扫码（伊云本草）', '转账（伊云本草）', '小程序', '未付款'], amount: true, head: {key: 'unit', label: '单位'}, inv: true, invOpts: ['普票', '专票', '暂不开发票'], deliveryMethod: ['自提', '门店配送', '快递'], deliveryDate: true, deliveryStatus: ['未配送', '配送']},
    commission:{title: '委托加工产品入库登记', icon: '🏭', settle: ['未结账', '已结账'], amount: true, head: {key: 'processor', label: '加工方', select: true}, deposit: true},
    // 月饼门店台账：与金山文档《3门店月饼进货、销售、推广产品领取台账》同步（只读镜像，每小时自动从金山同步）。
    mooncake: {title: '月饼门店台账', icon: '🥮',
      readOnly: true,
      kdocsUrl: 'https://www.kdocs.cn/l/cdIi3fNSAlFz',   // 金山文档在线台账（点击按钮新标签打开）
      otype: ['入库', '销售', '推广领取', '预订'],
      contact: true,                 // 联系人：购买人·去向 / 领取人 / 姓名·单位 / 供应商
      pays: true,                    // 收款方式：销售、预订有支付信息
      amount: true,                  // 金额
      deliveryDate: true,            // 取·送货时间 / 生产日期
      srcNote: '本账本与金山文档《3门店月饼进货、销售、推广产品领取台账》同步：每小时自动同步金山文档最新数据；工作台为只读，请在金山文档中修改（点「🔗 金山文档」按钮可新开标签页直达在线台账）。'}
  },
  // 原始数组（用于增删改，含旧格式记录）
  raw(book){
    const L = Store.get('ledger');
    if(!L[book]) L[book] = [];
    return L[book];
  },
  // 规范化视图（旧的单品记录自动转为订单结构，保证兼容）
  rows(book){
    return this.raw(book).filter(r => !r.del).map(r => this.norm(r));
  },
  // 按「年 / 时间段 + 订购类型小标签」过滤后的可见记录（render 与导出 CSV 共用）
  filteredList(book){
    const B = this.BOOKS[book];
    const all = this.rows(book);
    const hasRange = !!(this.dateFrom || this.dateTo);
    let list;
    if(hasRange){
      const from = this.dateFrom || '0000-01-01';
      const to = this.dateTo || '9999-12-31';
      list = all.filter(r => r.date >= from && r.date <= to);
    } else {
      list = all.filter(r => r.date.slice(0, 4) === this.year);
    }
    list = list.slice().sort((a, b) => a.date < b.date ? 1 : -1);
    if(B.otype && this.curOtype){
      list = list.filter(r => (this.normOtype(r.otype) || (B.otype && B.otype[0]) || '') === this.curOtype);
    }
    return list;
  },
  norm(r){
    if(r.items) return r; // 已是新订单结构
    const price = (r.amount && r.qty) ? Math.round(r.amount / r.qty * 100) / 100 : (r.amount || 0);
    return {
      id: r.id, date: r.date, t: r.t, del: r.del,
      otype: '', unit: '', contact: '', salesman: '',
      delivery: '', deliveryDate: '', deliveryStatus: '', special: '', invTitle: '',
      deposit: 0, balance: 0, payStatus: '', settle: r.settle || '',
      items: [{product: r.product || '', price: price, qty: r.qty || 0, amount: r.amount || 0}],
      total: r.amount || 0,
      pays: r.pay ? [r.pay] : (Array.isArray(r.pays) ? r.pays : []),
      inv: (typeof r.inv === 'string' && r.inv) ? [r.inv] : (Array.isArray(r.inv) ? r.inv : []),
      flags: r.flags || {},
      note: r.note || ''
    };
  },
  qtySum(r){ return (r.items || []).reduce((s, it) => s + (+it.qty || 0), 0); },
  render(){
    this.migratePays();
    this.migrateOtype();
    const el = $('#content');
    const bk = this.curBook, B = this.BOOKS[bk];
    this.syncAllInitial();
    const hasRange = !!(this.dateFrom || this.dateTo);
    if(!B.otype) this.curOtype = '';
    const list = this.filteredList(bk);
    let totalQty = 0, totalAmt = 0;
    list.forEach(r => { totalQty += this.qtySum(r); totalAmt += (+r.total || 0); });

    const showHead = !!B.head, showPays = !!B.pays, showInv = !!B.inv, showFlags = !!(B.flags && B.flags.length), showDept = !!B.dept;
    const showOtype = !!(B.otype && !this.curOtype), showContact = !!B.contact, showUnit = !!B.unitField, showDeliveryMethod = !!B.deliveryMethod, showDeliveryDate = !!B.deliveryDate, showDeliveryStatus = !!B.deliveryStatus, showSpecial = !!B.special, showInvTitle = !!B.invTitle;
    const showPayStatus = !!B.payStatus, showSalesman = !!B.salesman, showDeposit = !!B.deposit, showSettle = !!B.settle;
    const prodOpts = Store.get('products').items.filter(p => !p.del).map(p => '<option value="' + esc(p.name) + '">').join('');

    const scopeLabel = hasRange
      ? ((this.dateFrom || '…') + ' ~ ' + (this.dateTo || '…'))
      : (this.year + ' 年');

    const head =
      '<div class="mod-head"><h2>📒 运营台账</h2>' +
      '<div class="date-nav">' +
      '<span class="seg" title="按年份查看整年记录"><label class="dn-lab">年</label>' +
      '<input autocomplete="off" type="number" min="2000" max="2100" value="' + this.year + '" onchange="LedgerMod.setYear(this.value)"></span>' +
      '<span class="date-range" title="选择时间段筛选（留空则显示整年记录）"><label class="dn-lab">时间段</label>' +
      '<input autocomplete="off" type="date" value="' + this.dateFrom + '" onchange="LedgerMod.dateFrom=this.value||\'\';LedgerMod.render()" placeholder="起始日期"> ' +
      '<span class="dn-tilde">~</span> ' +
      '<input autocomplete="off" type="date" value="' + this.dateTo + '" onchange="LedgerMod.dateTo=this.value||\'\';LedgerMod.render()" placeholder="结束日期">' +
      (hasRange ? ' <button class="btn sm ghost" onclick="LedgerMod.dateFrom=\'\';LedgerMod.dateTo=\'\';LedgerMod.render()">✕ 清除</button>' : '') +
      '</span>' +
      (B.readOnly ? '' :
        '<button class="btn sm ghost" onclick="LedgerMod.downloadLedgerTemplate(\'' + bk + '\')">⬇ 📄 模板</button>' +
        '<button class="btn sm ghost" onclick="LedgerMod.importLedger(\'' + bk + '\')">📥 导入</button>') +
      '<button class="btn sm ghost" onclick="LedgerMod.exportCsv()">⬇ 导出CSV</button>' +
      '<button class="btn sm" style="background:var(--accent)" onclick="LedgerMod.showUnpaid()" title="一键搜索全部账本未付款订单">🔍 未付款</button></div></div>' +
      '<div class="tabs">' + Object.keys(this.BOOKS).map(k =>
        '<span class="tab' + (k === bk ? ' on' : '') + '" onclick="LedgerMod.curBook=\'' + k + '\';LedgerMod.render()">' +
        this.BOOKS[k].icon + ' ' + this.BOOKS[k].title + '</span>').join('') + '</div>' +
      (B.otype ? '<div class="tabs otype-tabs">' +
        '<span class="tab' + (!this.curOtype ? ' on' : '') + '" onclick="LedgerMod.curOtype=\'\';LedgerMod.render()">全部</span>' +
        this.distinctOtypes(B, this.rows(bk)).map(ot =>
          '<span class="tab' + (this.curOtype === ot ? ' on' : '') + '" onclick="LedgerMod.curOtype=\'' + esc(ot) + '\';LedgerMod.render()">' + esc(ot) + '</span>').join('') +
        '</div>' : '') +
      '<div class="card"><h3>' + B.icon + ' ' + B.title + ' · ' + scopeLabel +
      (B.readOnly
        ? ' <button class="btn sm ghost" style="margin-left:auto" onclick="LedgerMod.manualSync()">🔄 立即同步</button>' +
          (B.kdocsUrl ? ' <button class="btn sm" style="background:var(--accent)" onclick="LedgerMod.openKdocs()">🔗 金山文档</button>' : '')
        : ' <button class="btn sm" style="margin-left:auto" onclick="LedgerMod.addNew()">＋ 登记</button>') + '</h3>' +
      (B.srcNote ? '<div class="sync-note">🔄 ' + esc(this.syncSrcNote(bk)) + '</div>' : '');

    const o = {showHead, showPays, showInv, showFlags, showOtype, showContact, showUnit, showDeliveryMethod, showDeliveryDate, showDeliveryStatus, showSpecial, showInvTitle, showSalesman, showPayStatus, showDeposit, showSettle, showDept};
    const colCount = 1 + (showOtype?1:0) + (showContact?1:0) + (showSalesman?1:0) + (showUnit?1:0) + (showHead?1:0) + 1 + 1 + (B.amount?1:0) + (showPays?1:0) + (showPayStatus?1:0) + (showSettle?1:0) + (showDept?1:0) + (showDeliveryMethod?1:0) + (showDeliveryDate?1:0) + (showDeliveryStatus?1:0) + (showFlags?B.flags.length:0) + (showInv?1:0) + (B.readOnly?0:1);
    const thead = '<thead><tr><th>' + (B.dateLabel || '日期') + '</th>' +
      (showOtype ? '<th>订购类型</th>' : '') +
      (showContact ? '<th>联系人</th>' : '') +
      (showSalesman ? '<th>推销员</th>' : '') +
      (showUnit ? '<th>单位/渠道</th>' : '') +
      (showHead ? '<th>' + esc(B.head.label) + '</th>' : '') +
      (showDept ? '<th>' + esc(B.dept.label) + '</th>' : '') +
      '<th>产品明细</th><th>数量</th>' +       (B.amount ? '<th>' + (B.amountLabel || '金额') + '</th>' : '') +
      (showPays ? '<th>收款方式</th>' : '') +
      (showPayStatus ? '<th>收款状态</th>' : '') +
      (showSettle ? '<th>结账方式</th>' : '') +
      (showDeliveryMethod ? '<th>配送方式</th>' : '') +
      (showDeliveryDate ? '<th>配送日期</th>' : '') +
      (showDeliveryStatus ? '<th>配送状态</th>' : '') +
      (showFlags ? B.flags.map(f => '<th>' + esc(f.label) + '</th>').join('') : '') +
      (showInv ? '<th>发票</th>' : '') + (B.readOnly ? '' : '<th></th>') + '</tr></thead>';

    let body;
    if(!list.length){
      body = '<tr><td colspan="' + colCount + '" class="empty">' + (hasRange ? ('所选时间段（' + (this.dateFrom || '起始') + ' ~ ' + (this.dateTo || '结束') + '）') : (this.year + ' 年')) + '暂无记录</td></tr>';
    } else if(showOtype){
      body = this.distinctOtypes(B, list).map(ot => {
        const sub = list.filter(r => (this.normOtype(r.otype) || (B.otype && B.otype[0]) || '') === ot);
        if(!sub.length) return '';
        const sq = sub.reduce((s, r) => s + this.qtySum(r), 0);
        const sa = sub.reduce((s, r) => s + (+r.total || 0), 0);
        return '<tr class="grp-row"><td colspan="' + colCount + '">🏷 ' + esc(ot) + ' · ' + sub.length + ' 单 · ' + moneyFmt(sa) + '</td></tr>' +
          sub.map(r => this.orderRow(r, B, o)).join('');
      }).join('');
    } else {
      body = list.map(r => this.orderRow(r, B, o)).join('');
    }

    const tfoot = '<tfoot><tr><td>合计</td>' +
      (showOtype ? '<td></td>' : '') + (showContact ? '<td></td>' : '') + (showSalesman ? '<td></td>' : '') + (showUnit ? '<td></td>' : '') +
      (showHead ? '<td></td>' : '') +
      (showDept ? '<td></td>' : '') +
      '<td>' + list.length + ' 单</td><td><b>' + totalQty + '</b></td>' +
      (B.amount ? '<td class="amt"><b>' + moneyFmt(totalAmt) + '</b></td>' : '') +
      (showPays ? '<td></td>' : '') + (showPayStatus ? '<td></td>' : '') + (showSettle ? '<td></td>' : '') + (showDeliveryMethod ? '<td></td>' : '') + (showDeliveryDate ? '<td></td>' : '') + (showDeliveryStatus ? '<td></td>' : '') +
      (showFlags ? B.flags.map(() => '<td></td>').join('') : '') + (showInv ? '<td></td>' : '') + '<td></td></tr></tfoot>';

    const extraHint = B.otype ? '表格按「订购类型」分小标签（' + B.otype.join(' / ') + '），点击可单独查看某一类，分析区也按当前显示范围统计。' : '';
    const syncHint = this.syncHintFor(bk);
    let analysisHtml;
    if(hasRange || (B.otype && this.curOtype)){
      analysisHtml = this.renderBookStats(this.analyzeList(B, list));
    } else {
      analysisHtml = this.bookYearSummary(bk, this.year);
    }
    el.innerHTML = head +
      '<div class="tbl-scroll"><table class="tbl">' + thead + '<tbody>' + body + '</tbody>' + tfoot + '</table></div>' +
      '<div class="hint">一个订单可登记多种产品，每项填写单价与数量后自动合计；点击 ✎ 可修改订单（增删产品、改单价/数量/付款/发票）。' +
      (B.head ? '「' + esc(B.head.label) + '」为每单必填的归属信息。' : '') +
      (B.otype ? '「订购类型」决定归属分区，单位/渠道仅企业单位与渠道批发显示。' : '') +
      syncHint + extraHint + '</div>' +
      '<div class="lg-analysis"><h3>📊 ' + B.icon + ' ' + B.title + ' · ' + scopeLabel + ' 数据分析</h3>' + analysisHtml + '</div>' +
      '</div>';
  },
  setYear(v){ if(v){ this.year = String(v); this.dateFrom=''; this.dateTo=''; this.render(); } },
  // 云端同步账本「立即同步」：
  //  - 若按需同步函数地址为「公开可访问」（URL 不含 eo_token 访问网关），则直连函数做真正即时同步；
  //  - 当前 EdgeOne Makers 项目带访问网关，浏览器无法跨域调用该函数（仅静态页可被网关放行，
  //    函数 API 路由一律 401），故走兜底：直接拉云端最新。云端已改为「每 2 分钟自动从金山文档同步」，
  //    因此点击按钮即可看到接近最新的数据（最多落后约 2 分钟，通常已是最新）。
  manualSync(){
    const bk = this.curBook, B = this.BOOKS[bk];
    if(!B || !B.readOnly) return;
    const cfg = (window.TCM_CONFIG && TCM_CONFIG.mooncakeSync) || null;
    const canCallFn = cfg && cfg.url && cfg.url.indexOf('eo_token') === -1 && cfg.url.indexOf('__MOONCAKE_SYNC_URL__') === -1;
    if(canCallFn){
      const before = this.lastSyncTs();
      toast('正在从金山文档拉取最新数据…');
      fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sync-Secret': cfg.secret },
        body: JSON.stringify({ book: bk })
      }).then(r => r.json().catch(() => ({}))).then(j => {
        if(j && j.ok) return;
        if(j && j.error === 'busy'){ toast('同步进行中，稍候自动刷新…', false); return; }
        if(j && j.error === 'unauthorized'){ toast('同步鉴权失败，请联系管理员', false); return; }
        toast('同步触发未成功（' + (j && j.error ? j.error : '未知') + '）；已尽量刷新可见数据', false);
      }).catch(() => { toast('同步触发失败（网络/网关）；已尽量刷新可见数据', false); });
      this._waitFreshSync(before, Date.now() + 75000);
      return;
    }
    // 兜底：拉云端最新（云端每小时自动从金山文档同步一次，按钮点击即拉到云端最新快照）
    toast('正在刷新到云端最新数据…');
    Store.pullShard('ledger', true).then(() => {
      this.render();
      const t = this.lastSyncText();
      if(t) toast('已刷新（云端每小时自动从金山文档同步；最近一次同步：' + t + '）');
      else toast('已刷新到云端最新数据（云端定期自动从金山文档同步）');
    }).catch(() => { this.render(); toast('已尝试刷新，但云端读取失败，请稍后重试', false); });
  },
  // 等待「立即同步」把云端 _syncDone 推进后再刷新界面
  _waitFreshSync(before, deadline){
    if(Date.now() > deadline){
      Store.pullShard('ledger', true).catch(() => {}).then(() => {
        this.render();
        const t = this.lastSyncText();
        if(t) toast('已刷新可见数据；若金山文档改动未出现，请稍后重试「立即同步」', false);
        else toast('同步较慢或失败，请稍后重试「立即同步」', false);
      });
      return;
    }
    Store.pullShard('ledger', true).catch(() => {}).then(() => {
      const now = this.lastSyncTs();
      if(now && before && now > before){
        this.render();
        toast('已刷新到金山文档最新数据（最近同步：' + this.lastSyncText() + '）');
        return;
      }
      setTimeout(() => this._waitFreshSync(before, deadline), 2500);
    });
  },
  // 新标签页打开金山文档在线台账（月饼门店台账的源头，可在线修改）
  openKdocs(){
    const bk = this.curBook, B = this.BOOKS[bk];
    if(B && B.kdocsUrl) window.open(B.kdocsUrl, '_blank', 'noopener');
  },
  // 最近一次从金山文档同步到云端的时间（由同步脚本写入 ledger._syncDone）
  lastSyncText(){
    try {
      const L = Store.get('ledger');
      if(L && L._syncDone){
        const d = new Date(L._syncDone);
        return (d.getMonth() + 1) + '-' + d.getDate() + ' ' +
          ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      }
    } catch(e){}
    return '';
  },
  // 返回 _syncDone 原始时间戳（用于判断「立即同步」后数据是否已推进）
  lastSyncTs(){
    try { const L = Store.get('ledger'); return (L && L._syncDone) ? L._syncDone : 0; }
    catch(e){ return 0; }
  },
  // 月饼等只读同步账本的说明，附最近一次从金山文档同步的时间
  syncSrcNote(bk){
    const B = this.BOOKS[bk];
    if(!B.srcNote) return '';
    const t = this.lastSyncText();
    return t ? (B.srcNote + '（最近一次从金山文档同步：' + t + '）') : B.srcNote;
  },
  // ===== 提醒：每周一未付款订单 + 配送前3天每日待配送 =====
  // 返回该周周一日期串（用于「每周一次」去重键）
  mondayKey(t){ return fmtDate(startOfWeek(parseDate(t))); },
  // 全账本未付款订单（按账本自身规则判定）
  isUnpaid(B, r){
    if(B.flags && B.flags.some(f => f.key === 'paid')) return !(r.flags && r.flags.paid);
    if(B.pays) return (r.pays || []).includes('未付款');
    if(B.payStatus) return (r.payStatus || B.payStatus[0]) !== '全款结清';
    return false;
  },
  allUnpaid(){
    const out = [];
    Object.keys(this.BOOKS).forEach(bk => {
      const B = this.BOOKS[bk];
      this.rows(bk).forEach(r => {
        if(this.isUnpaid(B, r)){
          const who = B.head ? (r[B.head.key] || '') : '';
          out.push('[' + B.icon + B.title + '] ' + r.date + ' · ' + (r.items || []).map(it => it.product).join('/') +
            ' · ' + moneyFmt(r.total || 0) + (who ? (' · ' + who) : ''));
        }
      });
    });
    return out;
  },
  // 待配送订单：配送状态非「配送」且有配送日期，且距今 ≤ 3 天（含逾期）
  allDueDelivery(today){
    const out = [];
    Object.keys(this.BOOKS).forEach(bk => {
      const B = this.BOOKS[bk];
      if(!B.deliveryStatus) return;
      this.rows(bk).forEach(r => {
        if(r.deliveryStatus === '配送') return;
        const dd = r.deliveryDate;
        if(!dd) return;
        const days = Math.round((parseDate(dd) - today) / 86400000);
        if(days <= 3 && days >= -60){
          const who = B.head ? (r[B.head.key] || '') : '';
          out.push('[' + B.icon + B.title + '] ' + r.date + ' · 配送日期 ' + dd +
            '（' + (days >= 0 ? '还有 ' + days + ' 天' : '已逾期 ' + (-days) + ' 天') + '）· ' +
            (r.items || []).map(it => it.product).join('/') + ' · ' + (r.delivery || '') + (who ? (' · ' + who) : ''));
        }
      });
    });
    return out;
  },
  // 进入运营台账 / 每日启动触发；每周一与每日各提醒一次（localStorage 去重）
  checkReminders(){
    if($('#modal-mask')) return;                 // 不打断其它弹窗
    const t = todayStr();
    const today = parseDate(t);
    const sections = [];
    const dow = new Date().getDay();
    // 周一：全店未付款订单
    if(dow === 1){
      const mk = 'tcmws_unpaid_mon_' + this.mondayKey(t);
      if(!localStorage.getItem(mk)){
        const items = this.allUnpaid();
        if(items.length) sections.push({key: mk, title: '📅 周一 · 全店未付款订单提醒（共 ' + items.length + ' 单）', items});
      }
    }
    // 每日：配送前 3 天起待配送订单
    const dk = 'tcmws_due_' + t;
    if(!localStorage.getItem(dk)){
      const items = this.allDueDelivery(today);
      if(items.length) sections.push({key: dk, title: '🚚 待配送提醒（配送日期前 3 天起每日）· 共 ' + items.length + ' 单', items});
    }
    if(!sections.length) return;
    sections.forEach(s => localStorage.setItem(s.key, '1'));
    const html = sections.map(s => '<h4 style="margin:10px 0 4px">' + s.title + '</h4><div class="remind-list">' +
      s.items.map(x => '<div class="remind-item">• ' + esc(x) + '</div>').join('') + '</div>').join('');
    const n = sections.reduce((s, x) => s + x.items.length, 0);
    if('Notification' in window && Notification.permission === 'granted'){
      try { new Notification('🔔 运营台账提醒', {body: '有 ' + n + ' 条订单待处理（未付款 / 待配送）'}); } catch(e){}
    }
    speak('提醒：运营台账有 ' + n + ' 条订单待处理，请打开查看。');
    openModal('<h3>🔔 运营台账提醒</h3>' + html +
      '<div class="modal-btns"><button class="btn" onclick="closeModal();Nav.go(\'ledger\')">查看运营台账 →</button></div>');
  },
  // ===== 一键搜索：全部账本未付款订单（跨账本汇总，可点击跳转）=====
  showUnpaid(){
    const groups = {};
    let total = 0;
    Object.keys(this.BOOKS).forEach(bk => {
      const B = this.BOOKS[bk];
      this.rows(bk).forEach(r => {
        if(this.isUnpaid(B, r)){
          (groups[bk] = groups[bk] || []).push(r);
          total++;
        }
      });
    });
    if(!total){
      openModal('<h3>✅ 未付款订单</h3><div class="hint">太好了，当前所有账本都没有未付款订单。</div><div class="modal-btns"><button class="btn" onclick="closeModal()">关闭</button></div>');
      return;
    }
    const html = Object.keys(groups).map(bk => {
      const B = this.BOOKS[bk];
      const items = groups[bk].map(r => {
        const who = B.head ? (r[B.head.key] || '') : '';
        return '<div class="remind-item" style="cursor:pointer" onclick="LedgerMod.jumpBook(\'' + bk + '\')">• [' + B.icon + B.title + '] ' +
          r.date + ' · ' + (r.items || []).map(it => it.product).join('/') + ' · ' + moneyFmt(r.total || 0) +
          (who ? (' · ' + who) : '') + '</div>';
      }).join('');
      return '<h4 style="margin:10px 0 4px">' + B.icon + ' ' + B.title + '（' + groups[bk].length + ' 单）</h4>' +
        '<div class="remind-list" style="max-height:none">' + items + '</div>';
    }).join('');
    openModal('<h3>🔍 全部账本未付款订单 · 共 ' + total + ' 单</h3>' + html +
      '<div class="modal-btns"><button class="btn" onclick="closeModal()">关闭</button></div>');
  },
  jumpBook(bk){
    closeModal();
    this.curBook = bk;
    this.editId = null;
    this.render();
    toast('已跳转到「' + this.BOOKS[bk].title + '」');
  },
  // ---- 订单行渲染（按账本可选字段裁剪列）----
  otypeOrder(arr){ return arr || []; },
  // 订购类型归一：历史「员工」统一并入现行「职工」，保证两者同属一类、合并显示
  normOtype(ot){ return ot ? (OTYPE_ALIAS[ot] || ot) : ot; },
  // 分区所用的订购类型清单：以配置 B.otype 为基准，再补上数据中真实存在但因改名/历史原因不在配置里的类型，并按别名归一（历史「员工」并入「职工」），避免记录整组消失或分错区
  distinctOtypes(B, list){
    const set = (B.otype || []).map(t => this.normOtype(t));
    (list || []).forEach(r => { const ot = this.normOtype(r.otype); if(ot && !set.includes(ot)) set.push(ot); });
    return set;
  },
  orderRow(r, B, o){
    let extra = '';
    const bits = [];
    if(o.showInvTitle && r.invTitle) bits.push('发票抬头：' + r.invTitle);
    if(o.showSpecial && r.special) bits.push('特殊需求：' + r.special);
    if(o.showDeposit && (+r.deposit || 0)) bits.push('定金：' + moneyFmt(r.deposit));
    if(o.showDeposit && (+r.balance || 0)) bits.push('尾款：' + moneyFmt(r.balance));
    if(r.note) bits.push(r.note);
    if(bits.length) extra = '<div class="muted lg-extra">' + bits.map(x => esc(x)).join('；') + '</div>';
    return '<tr><td>' + r.date + '</td>' +
      (o.showOtype ? '<td>' + esc(this.normOtype(r.otype) || '—') + '</td>' : '') +
      (o.showContact ? '<td>' + esc(r.contact || '') + '</td>' : '') +
      (o.showSalesman ? '<td>' + esc(r.salesman || '') + '</td>' : '') +
      (o.showUnit ? '<td>' + esc(r.unit || '') + '</td>' : '') +
      (o.showHead ? '<td>' + esc(r[B.head.key] || '') + '</td>' : '') +
      (o.showDept ? '<td>' + esc(r.dept || '') + '</td>' : '') +
      '<td>' + (r.items || []).map(it =>
        '<div class="lg-it">' + esc(it.product) + ' ×' + (it.qty || 0) +
        (it.price ? ' <span class="muted">@' + moneyFmt(it.price) + '</span>' : '') + '</div>').join('') + extra + '</td>' +
      '<td><b>' + this.qtySum(r) + '</b></td>' +
      (B.amount ? '<td class="amt">' + moneyFmt(r.total || 0) + '</td>' : '') +
      (o.showPays ? '<td>' + (r.pays && r.pays.length ? r.pays.map(esc).join('、') : '<span class="muted">—</span>') + '</td>' : '') +
      (o.showPayStatus ? '<td>' + esc(this.payStatusLabel(r, B)) + '</td>' : '') +
      (o.showSettle ? '<td>' + esc(this.settleLabel(r, B)) + '</td>' : '') +
      (o.showDeliveryMethod ? '<td>' + (r.delivery ? esc(r.delivery) : '<span class="muted">—</span>') + '</td>' : '') +
      (o.showDeliveryDate ? '<td>' + (r.deliveryDate ? esc(r.deliveryDate) : '<span class="muted">—</span>') + '</td>' : '') +
      (o.showDeliveryStatus ? '<td>' + (r.deliveryStatus ? esc(r.deliveryStatus) : '<span class="muted">—</span>') + '</td>' : '') +
      (o.showFlags ? B.flags.map(f => '<td>' + ((r.flags && r.flags[f.key]) ? '是' : '<span class="muted">否</span>') + '</td>').join('') : '') +
      (o.showInv ? '<td>' + (r.inv && r.inv.length ? r.inv.map(esc).join('、') : '<span class="muted">—</span>') + '</td>' : '') +
      (B.readOnly ? '' : '<td class="ops"><a onclick="LedgerMod.edit(\'' + r.id + '\')" title="编辑">✎</a>' +
      '<a onclick="LedgerMod.openMove(\'' + r.id + '\')" title="移动到其它账本">⇄</a>' +
      '<a class="del" onclick="LedgerMod.remove(\'' + r.id + '\')">✕</a></td>') + '</tr>';
  },
  // ---- 订单登记 / 编辑弹窗 ----
  addNew(){ this.editId = null; this.openForm(null); },
  edit(id){ this.editId = id; this.openForm(id); },
  openForm(id){
    const bk = this.curBook, B = this.BOOKS[bk];
    if(B.readOnly){ toast('本账本为只读同步账本，请在金山文档中修改', false); return; }
    const rec = id ? this.raw(bk).find(r => r.id === id) : null;
    this._prevOtype = rec ? (rec.otype || (B.otype ? B.otype[0] : '')) : (B.otype ? B.otype[0] : '');
    const prodOpts = B.styles
      ? B.styles.map(s => '<option value="' + esc(s.name) + '">').join('')
      : Store.get('products').items.filter(p => !p.del).map(p => '<option value="' + esc(p.name) + '">').join('');
    const paysHtml = B.pays ? '<div class="lg-fld"><label>收款方式（可多选勾选）</label><div class="chk-group" id="lg-pays">' +
      B.pays.map(p => {
        const on = (rec && Array.isArray(rec.pays) && rec.pays.includes(p)) ? 'checked' : '';
        return '<label class="chk-i"><input autocomplete="off" type="checkbox" value="' + esc(p) + '" ' + on + '><span>' + esc(p) + '</span></label>';
      }).join('') + '</div></div>' : '';
    const payStatusHtml = B.payStatus ? '<div class="lg-fld"><label>收款状态</label><select id="lg-paystatus">' +
      B.payStatus.map(s => '<option value="' + esc(s) + '"' + ((rec && rec.payStatus === s) ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' : '';
    const settleHtml = B.settle ? '<div class="lg-fld"><label>结账方式</label><select id="lg-settle">' +
      B.settle.map(s => '<option value="' + esc(s) + '"' + ((rec && rec.settle === s) ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' : '';
    const depositHtml = B.deposit ? '<div class="lg-2col">' +
      '<div class="lg-fld"><label>定金(元)</label><input autocomplete="off" id="lg-deposit" type="number" min="0" step="0.01" value="' + ((rec && +rec.deposit) ? rec.deposit : '') + '" placeholder="已收定金"></div>' +
      '<div class="lg-fld"><label>尾款(元)</label><input autocomplete="off" id="lg-balance" type="number" min="0" step="0.01" value="' + ((rec && +rec.balance) ? rec.balance : '') + '" placeholder="待收尾款"></div>' +
      '</div>' : '';
    const invHtml = B.inv ? '<div class="lg-fld"><label>发票（可多选勾选）</label><div class="chk-group" id="lg-inv">' +
      (B.invOpts || INV_OPTS).map(p => {
        const on = (rec && Array.isArray(rec.inv) && rec.inv.includes(p)) ? 'checked' : '';
        return '<label class="chk-i"><input autocomplete="off" type="checkbox" value="' + esc(p) + '" ' + on + ' onchange="LedgerMod.onInvChange()"><span>' + esc(p) + '</span></label>';
      }).join('') + '</div></div>' : '';
    let headHtml = '';
    if(B.head){
      if(B.head.select){
        const opts = this.processors().map(p =>
          '<option value="' + esc(p) + '"' + ((rec && rec[B.head.key] === p) ? ' selected' : '') + '>' + esc(p) + '</option>').join('');
        headHtml = '<div class="lg-fld"><label>' + esc(B.head.label) + '（下拉选择，可在「管理」中增删）</label>' +
          '<div class="lg-head-row"><select id="lg-head">' + opts + '</select>' +
          '<button class="btn sm ghost" type="button" onclick="LedgerMod.manageProcessors()">⚙️ 管理加工方</button></div></div>';
      } else {
        headHtml = '<div class="lg-fld"><label>' + esc(B.head.label) + '</label><input autocomplete="off" id="lg-head" value="' +
          (rec && rec[B.head.key] ? esc(rec[B.head.key]) : '') + '"></div>';
      }
    }
    let deptHtml = '';
    if(B.dept){
      const opts = this.depts().map(p =>
        '<option value="' + esc(p) + '"' + ((rec && rec.dept === p) ? ' selected' : '') + '>' + esc(p) + '</option>').join('');
      deptHtml = '<div class="lg-fld"><label>' + esc(B.dept.label) + '（下拉选择，可在「管理」中增删）</label>' +
        '<div class="lg-head-row"><select id="lg-dept">' + opts + '</select>' +
        '<button class="btn sm ghost" type="button" onclick="LedgerMod.manageDepts()">⚙️ 管理科室</button></div></div>';
    }
    const flagsHtml = B.flags ? '<div class="lg-fld"><label>' + esc(B.flags.map(f => f.label).join(' / ')) + '（勾选为「是」）</label>' +
      '<div class="chk-group" id="lg-flags">' + B.flags.map(f => {
        const on = (rec && rec.flags && rec.flags[f.key]) ? 'checked' : '';
        return '<label class="chk-i"><input autocomplete="off" type="checkbox" id="lg-flag-' + f.key + '" ' + on + '><span>' + esc(f.label) + '</span></label>';
      }).join('') + '</div></div>' : '';

    const otypeHtml = B.otype ? '<div class="lg-fld"><label>订购类型</label><select id="lg-otype" onchange="LedgerMod.onOtypeChange(this)">' +
      B.otype.map(t => '<option value="' + esc(t) + '"' + ((rec && rec.otype === t) ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></div>' : '';
    const contactHtml = B.contact ? '<div class="lg-fld"><label>联系人</label><input autocomplete="off" id="lg-contact" value="' + ((rec && rec.contact) ? esc(rec.contact) : '') + '" placeholder="选填"></div>' : '';
    const salesmanHtml = B.salesman ? '<div class="lg-fld"><label>推销员姓名</label><input autocomplete="off" id="lg-salesman" value="' + ((rec && rec.salesman) ? esc(rec.salesman) : '') + '" placeholder="选填（谁经手这笔订单）"></div>' : '';
    const unitHtml = B.unitField ? '<div class="lg-fld" id="lg-unit-row"' + ((rec && rec.otype && B.otypeUnit && !B.otypeUnit[rec.otype]) ? ' style="display:none"' : '') + '><label>单位 / 渠道</label><input autocomplete="off" id="lg-unit" value="' + ((rec && rec.unit) ? esc(rec.unit) : '') + '" placeholder="企业单位或批发渠道名称"></div>' : '';
    const invTitleShow = B.invTitle && rec && Array.isArray(rec.inv) && rec.inv.some(v => v.indexOf('暂不开发') === -1);
    const invTitleHtml = B.invTitle ? '<div class="lg-fld" id="lg-invtitle-row"' + (invTitleShow ? '' : ' style="display:none"') + '><label>发票抬头</label><input autocomplete="off" id="lg-invtitle" value="' + ((rec && rec.invTitle) ? esc(rec.invTitle) : '') + '" placeholder="开票抬头（单位全称）"></div>' : '';
    let deliveryHtml = '';
    if(B.deliveryMethod){
      deliveryHtml += '<div class="lg-fld"><label>配送方式</label><select id="lg-delivery">' +
        B.deliveryMethod.map(m => '<option value="' + esc(m) + '"' + ((rec && rec.delivery === m) ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>';
    }
    if(B.deliveryDate){
      deliveryHtml += '<div class="lg-fld"><label>配送日期</label><input autocomplete="off" type="date" id="lg-deliveryDate" value="' + ((rec && rec.deliveryDate) ? esc(rec.deliveryDate) : '') + '"></div>';
    }
    if(B.deliveryStatus){
      deliveryHtml += '<div class="lg-fld"><label>配送状态</label><select id="lg-deliveryStatus">' +
        B.deliveryStatus.map(s => '<option value="' + esc(s) + '"' + ((rec && rec.deliveryStatus === s) ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>';
    }
    const specialHtml = B.special ? '<div class="lg-fld"><label>特殊需求</label><textarea id="lg-special" rows="2" placeholder="选填">' + ((rec && rec.special) ? esc(rec.special) : '') + '</textarea></div>' : '';

    const html =
      '<h3>' + B.icon + ' ' + (id ? '编辑订单' : '登记订单') + ' · ' + esc(B.title) + '</h3>' +
      '<div class="lg-form">' +
        '<div class="lg-fld"><label>' + (B.dateLabel || '日期') + '</label><input autocomplete="off" type="date" id="lg-date" value="' + (rec ? rec.date : todayStr()) + '"></div>' +
        otypeHtml +
        contactHtml +
        salesmanHtml +
        unitHtml +
        headHtml + deptHtml +
        '<div class="lg-fld"><label>产品明细（一个订单可添加多种' + (B.styles ? '礼盒款式' : '产品') + '）</label>' +
          '<div class="lg-items" id="lg-items"></div>' +
          '<button class="btn sm ghost" type="button" onclick="LedgerMod.addLine()">＋ 添加' + (B.styles ? '款式' : '产品') + '</button></div>' +
        '<div class="lg-total">合计：<b id="lg-total">¥0.00</b></div>' +
        paysHtml + payStatusHtml + settleHtml + depositHtml + invHtml + flagsHtml + invTitleHtml + deliveryHtml + specialHtml +
        '<div class="lg-fld"><label>备注</label><textarea id="lg-note" rows="2" placeholder="选填">' + ((rec && rec.note) ? esc(rec.note) : '') + '</textarea></div>' +
      '</div>' +
      '<div class="modal-btns"><button class="btn ghost" type="button" onclick="closeModal()">取消</button>' +
      '<button class="btn" type="button" onclick="LedgerMod.save()">保存</button></div>' +
      '<datalist id="lg-prodlist">' + prodOpts + '</datalist>';
    openModal(html, 'wide');
    if(rec && rec.items && rec.items.length){ rec.items.forEach(it => this.addLine(it.product, it.price, it.qty)); }
    else this.addLine();
  },
  addLine(prod, pr, q){
    const wrap = $('#lg-items');
    if(!wrap) return;
    const Bk = this.BOOKS[this.curBook];
    const ph = Bk.styles ? '礼盒款式' : '产品名称';
    const d = document.createElement('div');
    d.className = 'lg-line';
    d.innerHTML =
      '<input autocomplete="off" class="lg-lp" list="lg-prodlist" placeholder="' + ph + '" value="' + esc(prod || '') + '" onchange="LedgerMod.fillPrice(this)" oninput="LedgerMod.fillPrice(this)">' +
      '<input autocomplete="off" class="lg-lpr" type="number" min="0" step="0.01" placeholder="单价" value="' + (pr != null ? pr : '') + '" oninput="LedgerMod.recalc()">' +
      '<input autocomplete="off" class="lg-lq" type="number" min="0" step="1" placeholder="数量" value="' + (q != null ? q : '') + '" oninput="LedgerMod.recalc()">' +
      '<span class="lg-la">¥0.00</span>' +
      '<a class="del" onclick="LedgerMod.delLine(this)">✕</a>';
    wrap.appendChild(d);
    this.recalc();
  },
  delLine(btn){ const line = btn.closest('.lg-line'); if(line) line.remove(); this.recalc(); },
  // 产品名匹配资料库时，自动按「会员价」填入单价（价格框为空才填，允许手动覆盖）
  fillPrice(input){
    const line = input.closest('.lg-line');
    if(!line) return;
    const pr = line.querySelector('.lg-lpr');
    const name = input.value.trim();
    if(!name || (pr && pr.value)) return;
    const B = this.BOOKS[this.curBook];
    if(B.styles){
      const st = B.styles.find(s => s.name === name);
      if(st){
        const otp = this.mooncakeUnitPrice(name);
        if(otp != null){ pr.value = otp; this.recalc(); return; }
      }
    }
    const prod = Store.get('products').items.find(p => !p.del && p.name === name);
    if(prod && prod.member != null && prod.member !== ''){
      pr.value = prod.member;
      this.recalc();
    }
  },
  // 月饼单价：职工按产品资料中的职工价填充，其他类型默认原价
  mooncakeUnitPrice(name, otype){
    const B = this.BOOKS[this.curBook];
    if(!B.styles) return null;
    const st = B.styles.find(s => s.name === name);
    if(!st) return null;
    const ot = (otype != null) ? otype : (B.otype && $('#lg-otype') ? $('#lg-otype').value : (B.otype ? B.otype[0] : null));
    // 在产品资料库中按款式名匹配对应产品（如「基础款」→「五行月饼（基础款）」）
    const prod = Store.get('products').items.find(p => !p.del && p.name && p.name.indexOf(name) >= 0);
    if(ot === '职工' && prod && prod.staff != null && prod.staff !== '') return Math.round(prod.staff * 10) / 10;
    if(prod && prod.price != null) return Math.round(prod.price * 10) / 10;
    return Math.round(st.price * 10) / 10; // 兜底：款式原价
  },
  // 订购类型切换：企业单位 / 渠道批发 才显示「单位/渠道」，并按新类型重算各款式单价
  onOtypeChange(inp){
    const B = this.BOOKS[this.curBook];
    const row = document.getElementById('lg-unit-row');
    if(row && B.otypeUnit){ row.style.display = B.otypeUnit[inp.value] ? '' : 'none'; }
    if(B.styles){
      const oldOt = this._prevOtype || (B.otype ? B.otype[0] : '');
      $$('#lg-items .lg-line').forEach(line => {
        const name = line.querySelector('.lg-lp').value.trim();
        const pr = line.querySelector('.lg-lpr');
        if(!name || !pr) return;
        const newP = this.mooncakeUnitPrice(name, inp.value);
        if(newP == null) return;
        const oldP = this.mooncakeUnitPrice(name, oldOt);
        if(pr.value === '' || (+pr.value === oldP)) pr.value = newP;
      });
      this.recalc();
      this._prevOtype = inp.value;
    }
  },
  // 勾选「普票 / 专票」即显示发票抬头（选「暂不开发票」则隐藏）
  onInvChange(){
    const row = document.getElementById('lg-invtitle-row');
    if(!row) return;
    const checks = $$('#lg-inv input:checked');
    const need = checks.some(c => c.value.indexOf('暂不开发') === -1);
    row.style.display = need ? '' : 'none';
  },
  // 历史数据迁移：收款方式「扫码现金」统一更名为「现金」（仅执行一次）
  migratePays(){
    if(this._payMigrated) return;
    this._payMigrated = true;
    const L = Store.get('ledger');
    if(!L) return;
    let changed = false;
    Object.keys(L).forEach(bk => {
      (Array.isArray(L[bk]) ? L[bk] : []).forEach(r => {
        if(r && Array.isArray(r.pays)){
          const np = r.pays.map(p => (p === '扫码现金') ? '现金' : p);
          if(np.some((p, i) => p !== r.pays[i])){ r.pays = np; changed = true; }
        }
        if(r && typeof r.pay === 'string' && r.pay === '扫码现金'){ r.pay = '现金'; changed = true; }
        // 委托加工：旧「收款方式」(已付款/未付款) → 新「结账方式」(已结账/未结账)
        if(bk === 'commission' && r && Array.isArray(r.pays) && r.pays.length && !r.settle){
          r.settle = r.pays.includes('未付款') ? '未结账' : '已结账';
          delete r.pays;
          changed = true;
        }
      });
    });
    if(changed) Store.markDirty('ledger');
  },
  // 首次进入时，将历史「员工」订购类型统一改写为现行「职工」，保证两者合并为同一类（仅执行一次，改写后落库同步）
  migrateOtype(){
    if(this._otypeMigrated) return;
    this._otypeMigrated = true;
    const L = Store.get('ledger');
    if(!L) return;
    let changed = false;
    Object.keys(L).forEach(bk => {
      (Array.isArray(L[bk]) ? L[bk] : []).forEach(r => {
        if(r && r.otype && OTYPE_ALIAS[r.otype]){ r.otype = OTYPE_ALIAS[r.otype]; changed = true; }
      });
    });
    if(changed) Store.markDirty('ledger');
  },
  // ===== 跨账本自动同步：来源账本含指定类目产品时，自动拆出同步到目标账本 =====
  // 规则：from 账本中命中 cat 类目的产品，会拆成一份写入 to 账本，收款方式记 tag 便于区分；幂等（按来源 id + 类目关联）。
  SYNC_RULES: [
    {from: 'reception', to: 'bracelet', cat: '合香产品',   tag: '院内', prefix: '院内接待'},
    {from: 'group',     to: 'bracelet', cat: '合香产品',   tag: '单位', prefix: '单位订购'},
    {from: 'reception', to: 'sales',    cat: '袋泡茶饮',   tag: '院内', prefix: '院内接待'},
    {from: 'group',     to: 'sales',    cat: '袋泡茶饮',   tag: '单位', prefix: '单位订购'}
  ],
  // 判断产品是否属于某类目
  isCat(name, cat){
    const p = Store.get('products').items.find(p => !p.del && p.name === name);
    return !!(p && p.cat === cat);
  },
  // 首次进入时，按规则把来源账本里命中类目的订单同步到目标账本（幂等，仅执行一次）
  syncAllInitial(){
    if(this._syncInit) return;
    this._syncInit = true;
    // 历史兜底：早期规则误用来源键 'unit'，统一修正为正确的 'group'，保证后续取消同步能匹配到副本
    let fixed = false;
    Object.keys(this.BOOKS).forEach(bk => {
      this.raw(bk).forEach(r => { if(r._src && r._src.book === 'unit'){ r._src.book = 'group'; fixed = true; } });
    });
    this.SYNC_RULES.forEach(r => {
      this.rows(r.from).forEach(rec => this.syncRuleRecord(r, rec.id, false));
    });
    this.pruneOrphanSyncs();
    if(fixed) Store.markDirty('ledger');
  },
  // 单条来源记录 → 目标账本（按指定类目拆出，收款方式记 tag；幂等 upsert：已存在则更新，不存在才新增）
  syncRuleRecord(rule, id, markDirty){
    const rec = this.raw(rule.from).find(r => r.id === id);
    if(!rec || rec.del){ this.removeSyncedFrom(rule, id); return; }
    const r = this.norm(rec);
    const items = (r.items || []).filter(it => this.isCat(it.product, rule.cat));
    if(!items.length){ this.removeSyncedFrom(rule, id); return; }
    const total = items.reduce((s, it) => s + (+it.amount || 0), 0);
    let note = rule.prefix;
    if(rule.from === 'reception' && r.contact) note += '·联系人：' + r.contact;
    if(rule.from === 'group' && r.unit) note += '·单位：' + r.unit;
    if(r.note) note += '；' + r.note;
    const arr = this.raw(rule.to);
    const ex = arr.find(x => x._src && x._src.book === rule.from && x._src.id === id && x._src.cat === rule.cat && !x.del);
    if(ex){
      ex.items = items.map(it => ({product: it.product, price: it.price, qty: it.qty, amount: it.amount}));
      ex.total = total; ex.note = note; ex.t = Date.now();
      if(markDirty) Store.markDirty('ledger');
    } else {
      arr.push({id: uid(), date: r.date, t: Date.now(), del: false,
        items: items.map(it => ({product: it.product, price: it.price, qty: it.qty, amount: it.amount})),
        total: total, pays: [rule.tag], note: note, _src: {book: rule.from, id: id, cat: rule.cat}});
      if(markDirty) Store.markDirty('ledger');
    }
  },
  // 清理孤儿同步副本：来源记录已删除/不存在的副本应移除（自愈，防止重复残留）
  pruneOrphanSyncs(){
    let changed = false;
    this.SYNC_RULES.forEach(rule => {
      const srcIds = new Set(this.raw(rule.from).filter(r => !r.del).map(r => r.id));
      const arr = this.raw(rule.to);
      const kept = arr.filter(r => {
        if(r._src && r._src.book === rule.from && r._src.id){
          if(!srcIds.has(r._src.id)){ changed = true; return false; }
        }
        return true;
      });
      if(kept.length !== arr.length){ arr.length = 0; kept.forEach(r => arr.push(r)); }
    });
    if(changed) Store.markDirty('ledger');
  },
  // 撤销某条来源记录同步到目标的副本（按 来源账本 + 来源 id 匹配，兼容旧版无 cat 的副本）
  removeSyncedFrom(rule, id){
    const arr = this.raw(rule.to);
    const kept = arr.filter(r => !(r._src && r._src.book === rule.from && r._src.id === id));
    if(kept.length !== arr.length){ arr.length = 0; kept.forEach(r => arr.push(r)); Store.markDirty('ledger'); }
  },
  // 生成账本底部的自动同步说明
  syncHintFor(bk){
    const rules = this.SYNC_RULES.filter(r => r.to === bk);
    if(!rules.length) return '';
    const byFrom = {};
    rules.forEach(r => { (byFrom[r.from] = byFrom[r.from] || []).push(r.cat); });
    const segs = Object.keys(byFrom).map(f => this.BOOKS[f].title + '中的「' + byFrom[f].join('、') + '」');
    const tags = [...new Set(rules.map(r => r.tag))].join('/');
    return segs.join('、') + '会自动同步到本账本（收款方式记「' + tags + '」）。';
  },
  // ===== 加工方下拉选项（存云端 settings，全店同步，可增删）=====
  processors(){
    const s = Store.get('settings') || {};
    return Array.isArray(s.processors) && s.processors.length ? s.processors : ['本店加工'];
  },
  saveProcessors(arr){
    const s = Store.get('settings') || {};
    s.processors = arr; Store.data['settings'] = s; Store.markDirty('settings');
  },
  manageProcessors(){
    const list = this.processors();
    openModal('<h3>🏭 管理加工方</h3>' +
      '<div class="hint">加工方在下拉中选择；下方可新增或删除选项，修改后全店即时同步。</div>' +
      '<div class="lg-fld"><label>新增加工方</label><div class="lg-head-row"><input autocomplete="off" id="mp-new" placeholder="加工方名称">' +
      '<button class="btn sm" type="button" onclick="LedgerMod.addProcessor()">＋ 添加</button></div></div>' +
      '<div id="mp-list" class="mp-list">' + list.map((p, i) =>
        '<div class="mp-item"><span>' + esc(p) + '</span><a class="del" onclick="LedgerMod.delProcessorAt(' + i + ')">✕ 删除</a></div>').join('') +
      '</div><div class="modal-btns"><button class="btn" type="button" onclick="closeModal()">完成</button></div>');
  },
  addProcessor(){
    const inp = $('#mp-new'); if(!inp) return;
    const v = inp.value.trim();
    if(!v){ toast('请输入加工方名称', false); return; }
    const list = this.processors().slice();
    if(list.includes(v)){ toast('该加工方已存在', false); return; }
    list.push(v); this.saveProcessors(list);
    inp.value = '';
    this.renderProcessorList();
  },
  delProcessorAt(i){
    const list = this.processors().slice();
    const p = list[i]; if(!p) return;
    if(!confirm('删除加工方「' + p + '」？')) return;
    list.splice(i, 1); this.saveProcessors(list);
    this.renderProcessorList();
  },
  renderProcessorList(){
    const box = $('#mp-list'); if(!box) return;
    const list = this.processors();
    box.innerHTML = list.length ? list.map((p, i) =>
      '<div class="mp-item"><span>' + esc(p) + '</span><a class="del" onclick="LedgerMod.delProcessorAt(' + i + ')">✕ 删除</a></div>').join('')
      : '<div class="empty">暂无加工方，请在上方添加</div>';
  },
  // ===== 院内接待科室下拉选项（存云端 settings，全店同步，可增删）=====
  depts(){
    const s = Store.get('settings') || {};
    const def = (this.BOOKS.reception && this.BOOKS.reception.dept && this.BOOKS.reception.dept.opts) || ['中医科','康复科','理疗科','护理部','治未病科','营养科'];
    return Array.isArray(s.depts) && s.depts.length ? s.depts : def;
  },
  saveDepts(arr){
    const s = Store.get('settings') || {};
    s.depts = arr; Store.data['settings'] = s; Store.markDirty('settings');
  },
  manageDepts(){
    const list = this.depts();
    openModal('<h3>🏥 管理科室</h3>' +
      '<div class="hint">科室在下拉中选择；下方可新增或删除选项，修改后全店即时同步。</div>' +
      '<div class="lg-fld"><label>新增加科室</label><div class="lg-head-row"><input autocomplete="off" id="md-new" placeholder="科室名称">' +
      '<button class="btn sm" type="button" onclick="LedgerMod.addDept()">＋ 添加</button></div></div>' +
      '<div id="md-list" class="mp-list">' + list.map((p, i) =>
        '<div class="mp-item"><span>' + esc(p) + '</span><a class="del" onclick="LedgerMod.delDeptAt(' + i + ')">✕ 删除</a></div>').join('') +
      '</div><div class="modal-btns"><button class="btn" type="button" onclick="closeModal()">完成</button></div>');
  },
  addDept(){
    const inp = $('#md-new'); if(!inp) return;
    const v = inp.value.trim();
    if(!v){ toast('请输入科室名称', false); return; }
    const list = this.depts().slice();
    if(list.includes(v)){ toast('该科室已存在', false); return; }
    list.push(v); this.saveDepts(list);
    inp.value = '';
    this.renderDeptList();
  },
  delDeptAt(i){
    const list = this.depts().slice();
    const p = list[i]; if(!p) return;
    if(!confirm('删除科室「' + p + '」？已有的记录仍保留该科室名称。')) return;
    list.splice(i, 1); this.saveDepts(list);
    this.renderDeptList();
  },
  renderDeptList(){
    const box = $('#md-list'); if(!box) return;
    const list = this.depts();
    box.innerHTML = list.length ? list.map((p, i) =>
      '<div class="mp-item"><span>' + esc(p) + '</span><a class="del" onclick="LedgerMod.delDeptAt(' + i + ')">✕ 删除</a></div>').join('')
      : '<div class="empty">暂无科室，请在上方添加</div>';
  },
  recalc(){
    let total = 0;
    $$('#lg-items .lg-line').forEach(line => {
      const pr = +line.querySelector('.lg-lpr').value || 0;
      const q = +line.querySelector('.lg-lq').value || 0;
      const am = Math.round(pr * q * 100) / 100;
      const la = line.querySelector('.lg-la'); if(la) la.textContent = '¥' + am.toLocaleString('zh-CN');
      total += am;
    });
    const t = $('#lg-total'); if(t) t.textContent = '¥' + total.toLocaleString('zh-CN');
  },
  save(){
    const B = this.BOOKS[this.curBook];
    const date = $('#lg-date').value;
    if(!date){ toast('请选择日期', false); return; }
    const items = [];
    $$('#lg-items .lg-line').forEach(line => {
      const product = line.querySelector('.lg-lp').value.trim();
      const pr = +line.querySelector('.lg-lpr').value || 0;
      const q = +line.querySelector('.lg-lq').value || 0;
      if(product && q > 0){
        items.push({product, price: pr, qty: q, amount: Math.round(pr * q * 100) / 100});
      }
    });
    if(!items.length){ toast('请至少添加一个产品并填写名称与数量', false); return; }
    let total = 0; items.forEach(it => total += it.amount);
    const row = {
      id: this.editId || uid(), date, t: Date.now(), del: false,
      otype: B.otype ? ($('#lg-otype').value || B.otype[0]) : '',
      unit: B.unitField ? ($('#lg-unit').value.trim() || '') : '',
      contact: B.contact ? ($('#lg-contact').value.trim() || '') : '',
      salesman: B.salesman ? ($('#lg-salesman').value.trim() || '') : '',
      delivery: B.deliveryMethod ? ($('#lg-delivery').value || '') : '',
      deliveryDate: B.deliveryDate ? ($('#lg-deliveryDate').value || '') : '',
      deliveryStatus: B.deliveryStatus ? ($('#lg-deliveryStatus').value || '') : '',
      special: B.special ? ($('#lg-special').value.trim() || '') : '',
      invTitle: B.invTitle ? ($('#lg-invtitle').value.trim() || '') : '',
      items, total,
      deposit: B.deposit ? (+$('#lg-deposit').value || 0) : 0,
      balance: B.deposit ? (+$('#lg-balance').value || 0) : 0,
      payStatus: B.payStatus ? ($('#lg-paystatus').value || (B.payStatus[0] || '')) : '',
      settle: B.settle ? ($('#lg-settle').value || (B.settle[0] || '')) : '',
      pays: B.pays ? $$('#lg-pays input:checked').map(c => c.value) : [],
      inv: B.inv ? $$('#lg-inv input:checked').map(c => c.value) : [],
      note: $('#lg-note').value.trim() || ''
    };
    if(B.head) row[B.head.key] = $('#lg-head').value.trim();
    if(B.dept) row.dept = $('#lg-dept').value.trim();
    if(B.flags){
      row.flags = {};
      B.flags.forEach(f => { const c = $('#lg-flag-' + f.key); row.flags[f.key] = !!(c && c.checked); });
    }
    const arr = this.raw(this.curBook);
    const savedId = row.id;
    let keepTags = null;
    if(this.editId){
      const ex = arr.find(x => x.id === this.editId);
      if(ex){ keepTags = {_src: ex._src, _movedFrom: ex._movedFrom}; Object.assign(ex, row); if(keepTags._src) ex._src = keepTags._src; if(keepTags._movedFrom) ex._movedFrom = keepTags._movedFrom; }
    } else {
      arr.push(row);
    }
    Store.markDirty('ledger');
    this.SYNC_RULES.filter(r => r.from === this.curBook).forEach(r => this.syncRuleRecord(r, savedId, true));
    this.editId = null;
    closeModal();
    this.month = date.slice(0, 7);
    this.render();
    toast('已保存');
  },
  remove(id){
    const B = this.BOOKS[this.curBook];
    if(B.readOnly){ toast('本账本为只读同步账本，请在金山文档中修改', false); return; }
    const r = this.raw(this.curBook).find(x => x.id === id);
    if(!r) return;
    if(!confirm('确定删除该订单记录？')) return;
    r.del = true; Store.markDirty('ledger');
    this.SYNC_RULES.filter(r => r.from === this.curBook).forEach(r => this.removeSyncedFrom(r, id));
    this.render();
  },
  // ===== 记录移动到 / 复制到其它账本 =====
  openMove(id){
    const B = this.BOOKS[this.curBook];
    if(B.readOnly){ toast('本账本为只读同步账本，请在金山文档中修改', false); return; }
    const from = this.curBook;
    const others = Object.keys(this.BOOKS).filter(k => k !== from);
    openModal('<h3>⇄ 移动 / 复制记录</h3>' +
      '<div class="hint">把当前账本的记录移动到其它账本，或保留原记录仅复制一份。不同账本字段不同，仅通用字段（产品明细、日期、金额、收款方式等）会带入；目标账本没有的专属字段（如联系人、订购类型）按目标账本重新适配，不会带入。</div>' +
      '<div class="lg-fld"><label>目标账本</label><div class="chk-group" id="mv-to">' +
      others.map(k => '<label class="chk-i"><input autocomplete="off" type="radio" name="mvto" value="' + k + '"><span>' + esc(this.BOOKS[k].icon) + ' ' + esc(this.BOOKS[k].title) + '</span></label>').join('') +
      '</div></div>' +
      '<div class="add-row"><label class="chk-row"><input autocomplete="off" type="checkbox" id="mv-copy"> 保留原记录（复制一份，不删除原账本中的记录）</label></div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="LedgerMod.doMove(\'' + id + '\')">确定</button></div>');
  },
  doMove(id){
    const from = this.curBook;
    const sel = document.querySelector('#mv-to input[name="mvto"]:checked');
    if(!sel){ toast('请选择目标账本', false); return; }
    const to = sel.value;
    const keep = !!(document.getElementById('mv-copy') && document.getElementById('mv-copy').checked);
    const src = this.raw(from);
    const rec = src.find(r => r.id === id);
    if(!rec){ closeModal(); return; }
    if(!keep){
      const i = src.indexOf(rec); if(i >= 0) src.splice(i, 1);
    }
    const clone = JSON.parse(JSON.stringify(rec));
    clone.t = Date.now();
    clone._movedFrom = from;
    this.raw(to).push(clone);
    Store.markDirty('ledger');
    // 来源账本记录移走（非复制）后，其自动同步到目标账本的副本也应撤销
    if(!keep) this.SYNC_RULES.filter(r => r.from === from).forEach(r => this.removeSyncedFrom(r, id));
    closeModal();
    this.curBook = to;
    this.render();
    toast(keep ? '已复制到「' + this.BOOKS[to].title + '」' : '已移动到「' + this.BOOKS[to].title + '」');
  },
  exportCsv(){
    const B = this.BOOKS[this.curBook];
    const hasRange = !!(this.dateFrom || this.dateTo);
    const period = hasRange
      ? ((this.dateFrom || '起') + '_' + (this.dateTo || '止'))
      : (this.year + '年');
    const orders = this.filteredList(this.curBook)
      .sort((a, b) => a.date < b.date ? -1 : 1);
    const showHead = !!B.head, showPays = !!B.pays, showInv = !!B.inv, showFlags = !!(B.flags && B.flags.length);
    const showOtype = !!B.otype, showContact = !!B.contact, showUnit = !!B.unitField, showDeliveryMethod = !!B.deliveryMethod, showDeliveryDate = !!B.deliveryDate, showDeliveryStatus = !!B.deliveryStatus, showSpecial = !!B.special, showInvTitle = !!B.invTitle;
    const showPayStatus = !!B.payStatus, showSalesman = !!B.salesman, showDeposit = !!B.deposit, showSettle = !!B.settle, showDept = !!B.dept;
    const head = [(B.dateLabel || '日期')]
      .concat(showOtype ? ['订购类型'] : [])
      .concat(showContact ? ['联系人'] : [])
      .concat(showSalesman ? ['推销员'] : [])
      .concat(showUnit ? ['单位/渠道'] : [])
      .concat(showHead ? [B.head.label] : [])
      .concat(showDept ? [B.dept.label] : [])
      .concat(['产品', '单价', '数量', '小计'])
      .concat(showPays ? ['收款方式'] : [])
      .concat(showPayStatus ? ['收款状态'] : [])
      .concat(showSettle ? ['结账方式'] : [])
      .concat(showDeposit ? ['定金', '尾款'] : [])
      .concat(showDeliveryMethod ? ['配送方式'] : [])
      .concat(showDeliveryDate ? ['配送日期'] : [])
      .concat(showDeliveryStatus ? ['配送状态'] : [])
      .concat(showFlags ? B.flags.map(f => f.label) : [])
      .concat(showInvTitle ? ['发票抬头'] : [])
      .concat(showSpecial ? ['特殊需求'] : [])
      .concat(showInv ? ['发票'] : [])
      .concat(['备注']);
    const lines = [head.join(',')].concat(orders.flatMap(r =>
      (r.items || []).map(it =>
        [r.date]
        .concat(showOtype ? [r.otype || ''] : [])
        .concat(showContact ? [r.contact || ''] : [])
        .concat(showSalesman ? [r.salesman || ''] : [])
        .concat(showUnit ? [r.unit || ''] : [])
        .concat(showHead ? [r[B.head.key] || ''] : [])
        .concat(showDept ? [r.dept || ''] : [])
        .concat([(it.product || '').replace(/,/g, '，'), it.price || 0, it.qty || 0, it.amount || 0])
        .concat(showPays ? [(r.pays || []).join('/')] : [])
        .concat(showPayStatus ? [this.payStatusLabel(r, B)] : [])
        .concat(showSettle ? [this.settleLabel(r, B)] : [])
        .concat(showDeposit ? [(+r.deposit || 0), (+r.balance || 0)] : [])
        .concat(showDeliveryMethod ? [r.delivery || ''] : [])
        .concat(showDeliveryDate ? [r.deliveryDate || ''] : [])
        .concat(showDeliveryStatus ? [r.deliveryStatus || ''] : [])
        .concat(showFlags ? B.flags.map(f => (r.flags && r.flags[f.key]) ? '是' : '否') : [])
        .concat(showInvTitle ? [r.invTitle || ''] : [])
        .concat(showSpecial ? [r.special || ''] : [])
        .concat(showInv ? [(r.inv || []).join('/')] : [])
        .concat([(r.note || '').replace(/,/g, '，')]).join(','))));
    const blob = new Blob(['\ufeff' + lines.join('\n')], {type: 'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = B.title + '_' + period + '.csv';
    a.click(); URL.revokeObjectURL(a.href);
    toast('已导出 CSV（' + (hasRange ? ('时间段 ' + (this.dateFrom || '起') + ' ~ ' + (this.dateTo || '止')) : (this.year + ' 年')) + '，共 ' + orders.length + ' 单）');
  },
  // ===== 每个台账的 Excel/CSV 模板与导入 =====
  downloadLedgerTemplate(book){
    const B = this.BOOKS[book];
    const cols = ['日期'];
    if(B.otype) cols.push('订购类型');
    if(B.contact) cols.push('联系人');
    if(B.salesman) cols.push('推销员');
    if(B.unitField) cols.push('单位/渠道');
    if(B.head) cols.push(B.head.label);
    if(B.dept) cols.push(B.dept.label);
    cols.push('产品', '单价', '数量');
    if(B.pays) cols.push('收款方式');
    if(B.payStatus) cols.push('收款状态');
    if(B.settle) cols.push('结账方式');
    if(B.deposit) cols.push('定金', '尾款');
    if(B.deliveryMethod) cols.push('配送方式');
    if(B.deliveryDate) cols.push('配送日期');
    if(B.deliveryStatus) cols.push('配送状态');
    if(B.flags) B.flags.forEach(f => cols.push(f.label));
    if(B.invTitle) cols.push('发票抬头');
    if(B.special) cols.push('特殊需求');
    if(B.inv) cols.push('发票');
    cols.push('备注');
    const ex = ['2026-08-01'];
    if(B.otype) ex.push(B.otype[0]);
    if(B.contact) ex.push('示例联系人');
    if(B.salesman) ex.push('示例推销员');
    if(B.unitField) ex.push('');
    if(B.head) ex.push('示例' + B.head.label);
    if(B.dept) ex.push('示例' + B.dept.label);
    ex.push(B.styles ? B.styles[0].name : '枸杞菊花茶', B.styles ? B.styles[0].price : 18, 2);
    if(Array.isArray(B.pays) && B.pays.length) ex.push(B.pays[0]);
    if(B.payStatus) ex.push(B.payStatus[0]);
    if(B.settle) ex.push(B.settle[0]);
    if(B.deposit) ex.push(200, 188);
    if(B.deliveryMethod) ex.push('自提');
    if(B.deliveryDate) ex.push('');
    if(B.deliveryStatus) ex.push('未配送');
    if(B.flags) B.flags.forEach(f => ex.push(f.key === 'paid' ? '是' : '否'));
    if(B.invTitle) ex.push('');
    if(B.special) ex.push('');
    if(B.inv) ex.push((B.invOpts || INV_OPTS)[0]);
    ex.push('');
    const aoa = [cols, ex];
    if(typeof XLSX !== 'undefined'){
      try { const ws = XLSX.utils.aoa_to_sheet(aoa); XLSX.writeFile(ws, B.title + '_导入模板.xlsx'); toast('已下载 Excel 导入模板'); return; }
      catch(e){ /* 落到 CSV 兜底 */ }
    }
    const csv = '﻿' + aoa.map(r => r.map(c => String(c == null ? '' : c).replace(/,/g, '，')).join(',')).join('\r\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = B.title + '_导入模板.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已下载 CSV 导入模板（Excel 可双击打开）');
  },
  importLedger(book){
    if(this.BOOKS[book] && this.BOOKS[book].readOnly){ toast('本账本为只读同步账本，请在金山文档中修改', false); return; }
    this._importBook = book;
    let el = document.getElementById('lg-file');
    if(!el){
      el = document.createElement('input');
      el.type = 'file'; el.id = 'lg-file'; el.accept = '.xlsx,.xls,.csv'; el.style.display = 'none';
      el.onchange = () => { const f = el.files[0]; el.value = ''; this.handleLedgerFile(f); };
      document.body.appendChild(el);
    }
    el.click();
  },
  handleLedgerFile(file){
    if(!file) return;
    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
    if(typeof XLSX === 'undefined'){
      if(!isCsv){ toast('表格解析组件未加载，无法读取 Excel；请改用 CSV，或刷新页面后重试', false); return; }
      const reader = new FileReader();
      reader.onload = e => { try { const rows = WorkMod.parseCsvToRows(e.target.result); if(rows) this.previewLedgerImport(rows); }
        catch(err){ toast('解析失败：' + (err && err.message ? err.message : err), false); } };
      reader.onerror = () => toast('文件读取失败', false);
      reader.readAsText(file, 'utf-8');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => { try {
      const wb = XLSX.read(e.target.result, {type: 'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval: ''});
      this.previewLedgerImport(rows);
    } catch(err){ toast('解析失败：' + (err && err.message ? err.message : err), false); } };
    reader.onerror = () => toast('文件读取失败', false);
    reader.readAsArrayBuffer(file);
  },
  mapLedgerField(header, B){
    const h = String(header == null ? '' : header).toLowerCase().replace(/\s/g, '');
    if(/日期|时间/.test(h) && !/星期|周/.test(h)) return 'date';
    if(B.otype && (/订购类型/.test(h) || /类型/.test(h))) return 'otype';
    if(B.contact && /联系人/.test(h)) return 'contact';
    if(B.salesman && /(推销员|业务员|销售员|经手人)/.test(h)) return 'salesman';
    if(B.payStatus && /(收款状态|收付款状态|收款情况)/.test(h)) return 'payStatus';
    if(B.settle && /(结账方式|结算方式|结账)/.test(h)) return 'settle';
    if(B.deposit && /定金/.test(h)) return 'deposit';
    if(B.deposit && /(尾款|余款)/.test(h)) return 'balance';
    if(B.unitField && (/单位|渠道/.test(h))) return 'unit';
    if(B.head && (h.indexOf(B.head.label.toLowerCase()) >= 0 || h.indexOf(B.head.key.toLowerCase()) >= 0)) return 'head';
    if(B.dept && /科室/.test(h)) return 'dept';
    if(/产品|品名|商品|名称/.test(h)) return 'product';
    if(/单价|价格|售价/.test(h)) return 'price';
    if(/数量|个数|件数|qty/.test(h)) return 'qty';
    if(/是否付款|已付款|付款状态/.test(h)) return 'paid';
    if(/收款|付款方式/.test(h)) return 'pays';
    if(/是否开票|已开票|开票状态/.test(h)) return 'invoice';
    if(/发票/.test(h)) return 'inv';
    if(B.deliveryMethod && /(配送方式|配送方法)/.test(h)) return 'delivery';
    if(B.deliveryDate && /配送日期/.test(h)) return 'deliveryDate';
    if(B.deliveryStatus && /配送状态/.test(h)) return 'deliveryStatus';
    if((B.deliveryMethod || B.deliveryDate || B.deliveryStatus) && /配送/.test(h)) return 'delivery';
    if(B.special && /特殊/.test(h)) return 'special';
    if(B.invTitle && /抬头/.test(h)) return 'invTitle';
    if(/备注|说明/.test(h)) return 'note';
    return null;
  },
  splitMulti(s){
    return String(s == null ? '' : s).split(/[\/、，,｜|]+/).map(x => x.trim()).filter(x => x);
  },
  previewLedgerImport(rows){
    const book = this._importBook, B = this.BOOKS[book];
    if(!rows || !rows.length){ toast('文件为空或无法识别', false); return; }
    const first = rows[0];
    const fields = {date: null, head: null, otype: null, contact: null, salesman: null, unit: null, product: null, price: null, qty: null, pays: null, delivery: null, deliveryDate: null, deliveryStatus: null, inv: null, invTitle: null, special: null, paid: null, invoice: null, payStatus: null, settle: null, deposit: null, balance: null, dept: null, note: null};
    Object.keys(first).forEach(k => { const f = this.mapLedgerField(k, B); if(f && !fields[f]) fields[f] = k; });
    if(!fields.date){ toast('未找到「日期」列，请含表头：日期 / 产品 / 数量', false); return; }
    if(!fields.product || !fields.qty){ toast('未识别到「产品」「数量」列，请检查表头', false); return; }
    const out = [];
    rows.forEach(r => {
      const d = WorkMod.normBizDate(r[fields.date]);
      const product = String(r[fields.product] == null ? '' : r[fields.product]).trim();
      const qty = Math.round(+(r[fields.qty] == null ? 0 : r[fields.qty]) || 0);
      if(!d || !product || qty <= 0) return;
      const price = +(r[fields.price] == null ? 0 : r[fields.price]) || 0;
      const amount = Math.round(price * qty * 100) / 100;
      const pays = fields.pays ? this.splitMulti(r[fields.pays]) : [];
      const inv = fields.inv ? this.splitMulti(r[fields.inv]) : [];
      const head = fields.head ? String(r[fields.head] == null ? '' : r[fields.head]).trim() : '';
      const dept = fields.dept ? String(r[fields.dept] == null ? '' : r[fields.dept]).trim() : '';
      const note = fields.note ? String(r[fields.note] == null ? '' : r[fields.note]).trim() : '';
      const otype = fields.otype ? String(r[fields.otype] == null ? '' : r[fields.otype]).trim() : (B.otype ? B.otype[0] : '');
      const contact = fields.contact ? String(r[fields.contact] == null ? '' : r[fields.contact]).trim() : '';
      const salesman = fields.salesman ? String(r[fields.salesman] == null ? '' : r[fields.salesman]).trim() : '';
      const unit = fields.unit ? String(r[fields.unit] == null ? '' : r[fields.unit]).trim() : '';
      const delivery = fields.delivery ? String(r[fields.delivery] == null ? '' : r[fields.delivery]).trim() : '';
      const deliveryDate = fields.deliveryDate ? String(r[fields.deliveryDate] == null ? '' : r[fields.deliveryDate]).trim() : '';
      const deliveryStatus = fields.deliveryStatus ? String(r[fields.deliveryStatus] == null ? '' : r[fields.deliveryStatus]).trim() : '';
      const special = fields.special ? String(r[fields.special] == null ? '' : r[fields.special]).trim() : '';
      const invTitle = fields.invTitle ? String(r[fields.invTitle] == null ? '' : r[fields.invTitle]).trim() : '';
      const payStatus = fields.payStatus ? String(r[fields.payStatus] == null ? '' : r[fields.payStatus]).trim() : (B.payStatus ? B.payStatus[0] : '');
      const settle = fields.settle ? String(r[fields.settle] == null ? '' : r[fields.settle]).trim() : (B.settle ? B.settle[0] : '');
      const deposit = fields.deposit ? (+(r[fields.deposit] == null ? 0 : r[fields.deposit]) || 0) : 0;
      const balance = fields.balance ? (+(r[fields.balance] == null ? 0 : r[fields.balance]) || 0) : 0;
      let flags = {};
      if(B.flags){
        if(B.flags.some(f => f.key === 'paid')){
          const pv = fields.paid ? String(r[fields.paid] == null ? '' : r[fields.paid]) : '';
          flags.paid = !(fields.paid && /(未|否|没)/.test(pv));
        }
        if(B.flags.some(f => f.key === 'invoice')){
          const iv = fields.invoice ? String(r[fields.invoice] == null ? '' : r[fields.invoice]) : '';
          flags.invoice = !!(fields.invoice && /(是|已|开)/.test(iv));
        }
      }
      const row = {id: uid(), date: d, t: Date.now(), del: false,
        otype: B.otype ? otype : '', unit, contact, salesman, dept, delivery, deliveryDate, deliveryStatus, special, invTitle,
        deposit: B.deposit ? deposit : 0, balance: B.deposit ? balance : 0,
        payStatus: B.payStatus ? payStatus : '',
        settle: B.settle ? settle : '',
        items: [{product, price, qty, amount}], total: amount,
        pays: B.pays ? pays : [], inv: B.inv ? inv : [], note: note, flags: B.flags ? flags : {}};
      if(B.head) row[B.head.key] = head;
      if(B.dept) row.dept = dept;
      out.push(row);
    });
    if(!out.length){ toast('没有可导入的有效行（需 日期+产品+数量，如 2026-08-01）', false); return; }
    this._ledgerImport = {book, rows: out};
    const colHead = '<th>日期</th>' + (B.otype ? '<th>订购类型</th>' : '') + (B.head ? '<th>' + esc(B.head.label) + '</th>' : '') + '<th>产品</th><th>数量</th><th>金额</th>';
    const sample = out.slice(0, 8).map(r =>
      '<tr><td>' + r.date + '</td>' + (B.otype ? '<td>' + esc(r.otype || '—') + '</td>' : '') + (B.head ? '<td>' + esc(r[B.head.key] || '') + '</td>' : '') +
      '<td>' + esc(r.items[0].product) + '</td><td>' + r.items[0].qty + '</td><td class="amt">' + moneyFmt(r.total) + '</td></tr>').join('');
    openModal('<h3>📥 确认导入「' + esc(B.title) + '」</h3>' +
      '<div class="hint">识别到 <b>' + out.length + '</b> 行有效订单（每行=含一种产品的订单；已忽略缺日期/产品/数量的行）。导入后随云端全店共享。</div>' +
      '<div class="add-row"><label class="chk-row"><input autocomplete="off" type="checkbox" id="lg-ov" checked> 追加到现有记录（取消则先清空该账本全部记录再导入）</label></div>' +
      '<div style="max-height:220px;overflow:auto"><table class="tbl"><thead><tr>' + colHead + '</tr></thead><tbody>' + sample +
      (out.length > 8 ? '<tr><td colspan="' + (4 + (B.otype ? 1 : 0) + (B.head ? 1 : 0)) + '" class="empty">…仅显示前 8 行</td></tr>' : '') + '</tbody></table></div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="LedgerMod.confirmLedgerImport()">导入 ' + out.length + ' 行</button></div>');
  },
  confirmLedgerImport(){
    const imp = this._ledgerImport; if(!imp) return;
    const book = imp.book, arr = this.raw(book);
    const replaceAll = !document.getElementById('lg-ov').checked;
    if(replaceAll){ arr.length = 0; }
    imp.rows.forEach(r => arr.push(r));
    Store.markDirty('ledger'); closeModal(); this.render();
    toast('已导入 ' + imp.rows.length + ' 条' + (replaceAll ? '（已清空原记录）' : ''));
  },
  // ===== 每本台账的本月数据分析 =====
  // 基于「已过滤的 list」做统计分析（render 与导出共用；支持年/时间段 + 订购类型小标签）
  analyzeList(B, list){
    let totalQty = 0, totalAmt = 0;
    list.forEach(r => { totalQty += this.qtySum(r); totalAmt += (+r.total || 0); });
    const payMap = {};
    if(B.pays){ const payKeys = (Array.isArray(B.pays) ? B.pays.slice() : []); list.forEach(r => (r.pays || []).forEach(p => { if(p && !payKeys.includes(p)) payKeys.push(p); })); payKeys.forEach(p => payMap[p] = {count: 0, amt: 0});
      list.forEach(r => (r.pays || []).forEach(p => { if(payMap[p]){ payMap[p].count++; payMap[p].amt += (+r.total || 0); } })); }
    const prodMap = {};
    list.forEach(r => (r.items || []).forEach(it => { const name = it.product || '(未命名)'; prodMap[name] = (prodMap[name] || 0) + (+it.qty || 0); }));
    const prodRank = Object.keys(prodMap).sort((a, b) => prodMap[b] - prodMap[a]).slice(0, 8);
    let headMap = null;
    if(B.head){ headMap = {}; list.forEach(r => { const k = r[B.head.key]; if(k) headMap[k] = (headMap[k] || 0) + 1; }); }
    let deptMap = null;
    if(B.dept){ deptMap = {}; list.forEach(r => { const k = r.dept; if(k) deptMap[k] = (deptMap[k] || 0) + 1; }); }
    return {B, list, totalQty, totalAmt, payMap, prodMap, prodRank, headMap, deptMap};
  },
  bookAnalyze(book, month){
    const B = this.BOOKS[book];
    const list = this.rows(book).filter(r => r.date.slice(0, 7) === month);
    let totalQty = 0, totalAmt = 0;
    list.forEach(r => { totalQty += this.qtySum(r); totalAmt += (+r.total || 0); });
    // 收款方式分布（笔数 / 金额）
    const payMap = {};
    if(B.pays){ const payKeys = (Array.isArray(B.pays) ? B.pays.slice() : []); list.forEach(r => (r.pays || []).forEach(p => { if(p && !payKeys.includes(p)) payKeys.push(p); })); payKeys.forEach(p => payMap[p] = {count: 0, amt: 0});
      list.forEach(r => (r.pays || []).forEach(p => { if(payMap[p]){ payMap[p].count++; payMap[p].amt += (+r.total || 0); } })); }
    // 产品销量排行
    const prodMap = {};
    list.forEach(r => (r.items || []).forEach(it => {
      const name = it.product || '(未命名)'; prodMap[name] = (prodMap[name] || 0) + (+it.qty || 0);
    }));
    const prodRank = Object.keys(prodMap).sort((a, b) => prodMap[b] - prodMap[a]).slice(0, 8);
    // 归属分布（单位 / 联系人 / 加工方）
    let headMap = null;
    if(B.head){ headMap = {}; list.forEach(r => { const k = r[B.head.key]; if(k) headMap[k] = (headMap[k] || 0) + 1; }); }
    let deptMap = null;
    if(B.dept){ deptMap = {}; list.forEach(r => { const k = r.dept; if(k) deptMap[k] = (deptMap[k] || 0) + 1; }); }
    return {B, list, totalQty, totalAmt, payMap, prodMap, prodRank, headMap, deptMap};
  },
  // 未付款订单数（优先按 flags.paid，否则按 pays 含「未付款」）
  unpaidCount(B, list){
    if(B.flags && B.flags.some(f => f.key === 'paid')) return list.filter(r => !(r.flags && r.flags.paid)).length;
    if(B.pays) return list.filter(r => (r.pays || []).includes('未付款')).length;
    return 0;
  },
  // 收款状态标签（默认取账本首个状态）
  payStatusLabel(r, B){
    if(r.payStatus) return r.payStatus;
    return (B.payStatus && B.payStatus[0]) || '—';
  },
  // 结账方式标签（默认取账本首个选项）
  settleLabel(r, B){
    if(r.settle) return r.settle;
    return (B.settle && B.settle[0]) || '—';
  },
  // 收款状态分布（笔数 / 金额）
  payStatusDist(B, list){
    if(!B.payStatus) return '';
    return B.payStatus.map(s => {
      const sub = list.filter(r => (r.payStatus || B.payStatus[0]) === s);
      const amt = sub.reduce((s2, r) => s2 + (+r.total || 0), 0);
      return esc(s) + ' ' + sub.length + '单(' + moneyFmt(amt) + ')';
    }).join(' · ');
  },
  // 按订购类型分区统计（个人零散购买 / 职工 / 企业单位订购 / 渠道批发 …，历史「员工」并入「职工」）
  otypeBreakdown(B, list){
    if(!B.otype) return '';
    return this.distinctOtypes(B, list).map(ot => {
      const sub = list.filter(r => (this.normOtype(r.otype) || B.otype[0]) === ot);
      const sq = sub.reduce((s, r) => s + this.qtySum(r), 0);
      const sa = sub.reduce((s, r) => s + (+r.total || 0), 0);
      return esc(ot) + ' ' + sub.length + '单 · 数量' + sq + ' · ' + moneyFmt(sa);
    }).join(' ｜ ');
  },
  bookSummary(book, month){
    const a = this.bookAnalyze(book, month);
    if(!a.list.length) return '<div class="empty">「' + month + '」暂无记录，无法分析</div>';
    return this.renderBookStats(a);
  },
  // 由分析结果对象渲染统计卡片（本月 / 本周分析共用）
  renderBookStats(a){
    const stat = (label, val) => '<div class="stat"><b>' + val + '</b><span>' + label + '</span></div>';
    const unpaid = this.unpaidCount(a.B, a.list);
    let html = '<div class="stat-grid">' +
      stat('订单数', a.list.length + ' 单') +
      stat('总数量', a.totalQty) +
      stat('总金额', moneyFmt(a.totalAmt)) +
      stat('客单量', (a.list.length ? Math.round(a.totalQty / a.list.length) : 0)) +
      stat('客单价', moneyFmt(a.list.length ? a.totalAmt / a.list.length : 0)) +
      (a.B.payStatus
        ? (stat('赊账订单', a.list.filter(r => (r.payStatus || a.B.payStatus[0]) === '赊账').length + ' 单') +
           stat('总定金', moneyFmt(a.list.reduce((s, r) => s + (+r.deposit || 0), 0))) +
           stat('总尾款', moneyFmt(a.list.reduce((s, r) => s + (+r.balance || 0), 0))))
        : (a.B.pays ? stat('未付款订单', unpaid + ' 单') : '')) +
      '</div>';
    if(a.B.otype){
      html += '<div class="hint">🏷 分区统计（按订购类型）：' + this.otypeBreakdown(a.B, a.list) + '</div>';
    }
    if(a.B.settle){
      html += '<div class="hint">结账方式分布：' + a.B.settle.map(ss => {
        const sub = a.list.filter(r => (r.settle || (a.B.settle[0])) === ss);
        const amt = sub.reduce((s2, r) => s2 + (+r.total || 0), 0);
        return esc(ss) + ' ' + sub.length + '单(' + moneyFmt(amt) + ')';
      }).join(' · ') + '</div>';
    }
    if(a.B.payStatus){
      html += '<div class="hint">收款状态分布：' + this.payStatusDist(a.B, a.list) + '</div>';
    }
    if(a.B.pays){
      html += '<div class="hint">收款方式分布（笔数 / 金额）：' + Object.keys(a.payMap).map(p => {
        const m = a.payMap[p]; const cnt = m ? m.count : 0; const amt = m ? m.amt : 0;
        return esc(p) + ' ' + cnt + '单(' + moneyFmt(amt) + ')';
      }).join(' · ') + '</div>';
    }
    if(a.prodRank.length){
      html += '<div class="hint">产品销量排行（前8 · 按数量）：' + a.prodRank.map(n => esc(n) + ' ' + a.prodMap[n]).join('、') + '</div>';
    }
    if(a.headMap){
      const arr = Object.keys(a.headMap).sort((x, y) => a.headMap[y] - a.headMap[x]).slice(0, 6);
      html += '<div class="hint">' + esc(a.B.head.label) + '分布（前6 · 按单数）：' + arr.map(k => esc(k) + ' ' + a.headMap[k] + '单').join('、') + '</div>';
    }
    if(a.deptMap){
      const arr = Object.keys(a.deptMap).sort((x, y) => a.deptMap[y] - a.deptMap[x]).slice(0, 6);
      html += '<div class="hint">' + esc(a.B.dept.label) + '分布（前6 · 按单数）：' + arr.map(k => esc(k) + ' ' + a.deptMap[k] + '单').join('、') + '</div>';
    }
    return html;
  },
  // ===== 周分析（以「周五」为界：上周六 ~ 这周五）=====
  weekRange(){
    if(this.weekCustomStart){
      const start = parseDate(this.weekCustomStart);
      const len = Math.max(1, Math.min(31, this.weekCustomLen || 7));
      return {start: fmtDate(start), end: fmtDate(addDays(start, len - 1)), custom: true, label: '自定义（' + len + '天）'};
    }
    const thisFri = fridayEnd(new Date());
    const end = addDays(thisFri, this.weekOffset * 7);   // 这周五（按周偏移）
    const start = addDays(end, -6);                       // 向前 6 天 = 上周六
    let label = '本周';
    if(this.weekOffset < 0) label = '上' + Math.abs(this.weekOffset) + '周';
    else if(this.weekOffset > 0) label = '下' + this.weekOffset + '周';
    return {start: fmtDate(start), end: fmtDate(end), custom: false, label};
  },
  bookWeekAnalyze(book, start, end){
    const B = this.BOOKS[book];
    const list = this.rows(book).filter(r => r.date >= start && r.date <= end);
    let totalQty = 0, totalAmt = 0;
    list.forEach(r => { totalQty += this.qtySum(r); totalAmt += (+r.total || 0); });
    const payMap = {};
    if(B.pays){ const payKeys = (Array.isArray(B.pays) ? B.pays.slice() : []); list.forEach(r => (r.pays || []).forEach(p => { if(p && !payKeys.includes(p)) payKeys.push(p); })); payKeys.forEach(p => payMap[p] = {count: 0, amt: 0});
      list.forEach(r => (r.pays || []).forEach(p => { if(payMap[p]){ payMap[p].count++; payMap[p].amt += (+r.total || 0); } })); }
    const prodMap = {};
    list.forEach(r => (r.items || []).forEach(it => { const name = it.product || '(未命名)'; prodMap[name] = (prodMap[name] || 0) + (+it.qty || 0); }));
    const prodRank = Object.keys(prodMap).sort((a, b) => prodMap[b] - prodMap[a]).slice(0, 8);
    let headMap = null;
    if(B.head){ headMap = {}; list.forEach(r => { const k = r[B.head.key]; if(k) headMap[k] = (headMap[k] || 0) + 1; }); }
    let deptMap = null;
    if(B.dept){ deptMap = {}; list.forEach(r => { const k = r.dept; if(k) deptMap[k] = (deptMap[k] || 0) + 1; }); }
    return {B, list, totalQty, totalAmt, payMap, prodMap, prodRank, headMap, deptMap};
  },
  bookWeekSection(book){
    const r = this.weekRange();
    const a = this.bookWeekAnalyze(book, r.start, r.end);
    const nav = '<button class="btn sm" onclick="LedgerMod.weekOffset--;LedgerMod.weekCustomStart=\'\';LedgerMod.render()">◀ 上周</button>' +
      '<button class="btn sm ghost" onclick="LedgerMod.weekOffset=0;LedgerMod.weekCustomStart=\'\';LedgerMod.render()">本周</button>' +
      '<button class="btn sm" onclick="LedgerMod.weekOffset++;LedgerMod.weekCustomStart=\'\';LedgerMod.render()">下周 ▶</button>';
    const customRow = '<div class="add-row"><label>自定义起始日期<input autocomplete="off" type="date" value="' + esc(this.weekCustomStart) + '" onchange="LedgerMod.weekCustomStart=this.value;LedgerMod.render()"></label>' +
      '<label>天数<input autocomplete="off" type="number" min="1" max="31" value="' + this.weekCustomLen + '" onchange="LedgerMod.weekCustomLen=Math.max(1,Math.min(31,+this.value||7));LedgerMod.render()"></label>' +
      (this.weekCustomStart ? '<button class="btn sm ghost" onclick="LedgerMod.weekCustomStart=\'\';LedgerMod.render()">取消自定义</button>' : '') + '</div>';
    const hint = r.custom ? '' : '<div class="hint">固定以「周五」为周界（上周六 ~ 这周五）。也可上方选择自定义起始日期与天数。</div>';
    const body = a.list.length ? this.renderBookStats(a) : '<div class="empty">该周期（' + r.start + ' ~ ' + r.end + '）暂无记录</div>';
    return '<h3>📆 ' + this.BOOKS[book].icon + ' ' + this.BOOKS[book].title + ' · 周分析 · ' + r.label +
      ' <span class="tag">' + r.start + ' ~ ' + r.end + '</span></h3>' +
      '<div class="date-nav">' + nav + '</div>' + hint + customRow + body;
  },
  // 年度分析：汇总某年全部订单，并拆到各月
  bookYearAnalyze(book, year){
    const B = this.BOOKS[book];
    const y = String(year);
    const list = this.rows(book).filter(r => r.date.slice(0, 4) === y);
    let totalQty = 0, totalAmt = 0;
    const months = {}; const payMap = {};
    const payKeys = (Array.isArray(B.pays) ? B.pays.slice() : []);
    if(B.pays) list.forEach(r => (r.pays || []).forEach(p => { if(p && !payKeys.includes(p)) payKeys.push(p); }));
    payKeys.forEach(p => payMap[p] = {count: 0, amt: 0});
    list.forEach(r => {
      totalQty += this.qtySum(r); totalAmt += (+r.total || 0);
      const m = r.date.slice(0, 7);
      if(!months[m]) months[m] = {qty: 0, amt: 0};
      months[m].qty += this.qtySum(r); months[m].amt += (+r.total || 0);
      if(B.pays) (r.pays || []).forEach(p => { if(payMap[p]){ payMap[p].count++; payMap[p].amt += (+r.total || 0); } });
    });
    return {B, list, totalQty, totalAmt, months, payMap};
  },
  bookYearSummary(book, year){
    const a = this.bookYearAnalyze(book, year);
    if(!a.list.length) return '<div class="empty">「' + year + '」年暂无记录，无法分析</div>';
    const stat = (label, val) => '<div class="stat"><b>' + val + '</b><span>' + label + '</span></div>';
    const unpaid = this.unpaidCount(a.B, a.list);
    let html = '<div class="stat-grid">' +
      stat('年订单数', a.list.length + ' 单') +
      stat('年总数量', a.totalQty) +
      stat('年总金额', moneyFmt(a.totalAmt)) +
      stat('年客单价', moneyFmt(a.list.length ? a.totalAmt / a.list.length : 0)) +
      stat('有数据月数', Object.keys(a.months).length + ' 个') +
      (a.B.payStatus
        ? (stat('年赊账订单', a.list.filter(r => (r.payStatus || a.B.payStatus[0]) === '赊账').length + ' 单') +
           stat('年总定金', moneyFmt(a.list.reduce((s, r) => s + (+r.deposit || 0), 0))) +
           stat('年总尾款', moneyFmt(a.list.reduce((s, r) => s + (+r.balance || 0), 0))))
        : (a.B.pays ? stat('年未付款订单', unpaid + ' 单') : '')) +
      '</div>';
    if(a.B.otype){
      html += '<div class="hint">🏷 分区统计（按订购类型）：' + this.otypeBreakdown(a.B, a.list) + '</div>';
    }
    if(a.B.settle){
      html += '<div class="hint">结账方式分布：' + a.B.settle.map(ss => {
        const sub = a.list.filter(r => (r.settle || (a.B.settle[0])) === ss);
        const amt = sub.reduce((s2, r) => s2 + (+r.total || 0), 0);
        return esc(ss) + ' ' + sub.length + '单(' + moneyFmt(amt) + ')';
      }).join(' · ') + '</div>';
    }
    if(a.B.payStatus){
      html += '<div class="hint">收款状态分布：' + this.payStatusDist(a.B, a.list) + '</div>';
    }
    if(a.B.pays){
      html += '<div class="hint">收款方式分布（笔数 / 金额）：' + Object.keys(a.payMap).map(p => {
        const m = a.payMap[p]; const cnt = m ? m.count : 0; const amt = m ? m.amt : 0;
        return esc(p) + ' ' + cnt + '单(' + moneyFmt(amt) + ')';
      }).join(' · ') + '</div>';
    }
    const ms = Object.keys(a.months).sort();
    if(ms.length){
      const maxA = Math.max.apply(null, ms.map(m => a.months[m].amt).concat([1]));
      html += '<div class="hint">各月金额（共 ' + ms.length + ' 个月有数据）：</div><div class="bar-list">' +
        ms.map(m => {
          const s = a.months[m].amt; const pct = Math.round(s / maxA * 100);
          return '<div class="bar-row"><span class="bar-m">' + m.slice(5) + '月</span>' +
            '<div class="bar-track"><i style="width:' + pct + '%"></i></div>' +
            '<span class="bar-v">' + moneyFmt(s) + '</span></div>';
        }).join('') + '</div>';
    }
    return html;
  }
};
