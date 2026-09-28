'use strict';
// ============ 财务账本（收入按收款分类 / 支出按类别，支持编辑、导入导出、月度合规账本）============
const FIN_INCOME_CATS = ['支付宝', '微信', '挂号', '食堂卡', '小程序', '美团', '淘宝闪购', '院内接待', '其他'];
const FIN_EXPENSE_CATS = ['进货', '房租', '工资', '水电燃气', '设备维修', '办公杂费', '提成', '其他支出'];
const FIN_PWD = '260024';
const FinMod = {
  selDate: todayStr(),
  selMonth: todayStr().slice(0, 7),
  type: '支出',            // '收入' | '支出'
  gran: 'day',             // 'day' 按日 | 'week' 按周
  unlocked: false,
  editId: null,
  catMode: null,           // 'income' | 'expense' | null（分类管理弹窗）
  init(){
    try { if(localStorage.getItem('tcmws_fin_unlocked') === '1') this.unlocked = true; } catch(e){}
  },
  weekStartOf(dateStr){
    const d = parseDate(dateStr);
    const diff = (d.getDay() + 1) % 7;
    return fmtDate(addDays(d, -diff));
  },
  getIncomeCats(){ const f = Store.get('finance'); if(!f.incomeCats || !f.incomeCats.length) f.incomeCats = FIN_INCOME_CATS.slice(); return f.incomeCats; },
  getExpenseCats(){ const f = Store.get('finance'); if(!f.expenseCats || !f.expenseCats.length) f.expenseCats = FIN_EXPENSE_CATS.slice(); return f.expenseCats; },
  render(){
    this.init();
    const el = $('#content');
    // 密码保护
    if(!this.unlocked){
      el.innerHTML =
        '<div class="mod-head"><h2>💰 财务账本</h2></div>' +
        '<div class="card fin-lock">' +
        '<div style="font-size:42px;text-align:center;margin:8px 0">🔒</div>' +
        '<div class="hint" style="text-align:center">财务账本已加密，请输入访问密码</div>' +
        '<div class="add-row" style="justify-content:center;margin-top:14px">' +
        '<input id="fin-pwd" type="password" placeholder="请输入密码" autocomplete="off" style="max-width:200px">' +
        '<button class="btn" onclick="FinMod.unlock()">进入</button>' +
        '</div>' +
        '<div id="fin-lock-err" class="login-err" style="text-align:center"></div>' +
        '</div>';
      setTimeout(() => { const p = $('#fin-pwd'); if(p){ p.focus(); p.onkeydown = e => { if(e.key === 'Enter') FinMod.unlock(); }; } }, 30);
      return;
    }
    const d = this.selDate, m = this.selMonth;
    const all = Store.get('finance').items.filter(i => !i.del);
    const byDate = all.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const incCats = this.getIncomeCats(), expCats = this.getExpenseCats();
    // 汇总
    let totalIn = 0, totalOut = 0;
    const inByCat = {}, expByCat = {};
    all.forEach(r => {
      const amt = +r.amount || 0;
      if(r.type === '收入'){ totalIn += amt; inByCat[r.category] = (inByCat[r.category] || 0) + amt; }
      else { totalOut += amt; expByCat[r.category] = (expByCat[r.category] || 0) + amt; }
    });
    const inRows = incCats.map(c => {
      const v = inByCat[c] || 0;
      return '<div class="fin-cat"><span>' + c + '</span><b class="c-red">' + moneyFmt(v) + '</b></div>';
    }).join('');
    const expRows = expCats.map(c => {
      const v = expByCat[c] || 0;
      return '<div class="fin-cat"><span>' + c + '</span><b class="c-green">' + moneyFmt(v) + '</b></div>';
    }).join('');
    const dateVal = this.gran === 'week' ? this.weekStartOf(d) : d;
    const rows = byDate.map(r => {
      const tag = r.period === 'week' ? ' <span class="muted">(周)</span>' : '';
      return '<tr><td>' + r.date + tag + '</td>' +
      '<td>' + (r.type === '收入' ? '<span class="c-purple">收入</span>' : '<span class="c-teal">支出</span>') + '</td>' +
      '<td>' + esc(r.category) + '</td>' +
      '<td class="' + (r.type === '收入' ? 'c-red' : 'c-green') + '">' + moneyFmt(+r.amount || 0) + '</td>' +
      '<td class="muted">' + esc(r.note || '') + '</td>' +
      '<td class="ops"><a onclick="FinMod.editRec(\'' + r.id + '\')">✎</a>' +
      '<a class="del" onclick="FinMod.remove(\'' + r.id + '\')">✕</a></td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">暂无记录，下面添加第一笔吧</td></tr>';

    el.innerHTML =
      '<div class="mod-head"><h2>💰 财务账本</h2>' +
      '<span class="mod-ops">' +
      '<button class="btn sm ghost" onclick="FinMod.lock()">🔒 锁定</button></span></div>' +
      '<div class="hint">按日期记录每一笔收入与支出。收入按收款分类记录金额；支出按类别记录。数据随云端全店共享，可导出/导入，并支持按月生成合规账本。</div>' +
      // 汇总卡片
      '<div class="fin-summary">' +
      '<div class="fin-card"><div class="fin-card-t">总收入</div><div class="fin-card-v c-red">' + moneyFmt(totalIn) + '</div></div>' +
      '<div class="fin-card"><div class="fin-card-t">总支出</div><div class="fin-card-v c-green">' + moneyFmt(totalOut) + '</div></div>' +
      '<div class="fin-card"><div class="fin-card-t">结余</div><div class="fin-card-v">' + moneyFmt(totalIn - totalOut) + '</div></div>' +
      '</div>' +
      // 收入分类明细
      '<div class="card"><h3>📥 收入分类明细 <span class="card-ops"><a onclick="FinMod.manageCats(\'income\')" title="管理收入类型">⚙ 管理</a></span></h3><div class="fin-cats">' + (inRows || '<span class="muted">暂无收入</span>') + '</div></div>' +
      // 支出分类明细
      '<div class="card"><h3>📤 支出分类明细 <span class="card-ops"><a onclick="FinMod.manageCats(\'expense\')" title="管理支出类型">⚙ 管理</a></span></h3><div class="fin-cats">' + (expRows || '<span class="muted">暂无支出</span>') + '</div></div>' +
      // 录入区
      '<div class="card fin-form">' +
      '<div class="fin-type-toggle">' +
      '<button class="btn sm ' + (this.type === '支出' ? '' : 'ghost') + '" onclick="FinMod.setType(\'支出\')">支出</button>' +
      '<button class="btn sm ' + (this.type === '收入' ? '' : 'ghost') + '" onclick="FinMod.setType(\'收入\')">收入</button>' +
      '</div>' +
      '<div class="fin-type-toggle" style="margin-top:8px">' +
      '<button class="btn sm ' + (this.gran === 'day' ? '' : 'ghost') + '" onclick="FinMod.setGran(\'day\')">按日</button>' +
      '<button class="btn sm ' + (this.gran === 'week' ? '' : 'ghost') + '" onclick="FinMod.setGran(\'week\')">按周</button>' +
      '</div>' +
      '<div class="add-row">' +
      (this.gran === 'week'
        ? '<input type="text" id="fin-date" value="' + dateVal + '" readonly autocomplete="off" title="按周录入，日期自动取所在周期周六">'
        : '<input type="date" id="fin-date" value="' + d + '" autocomplete="off">') +
      (this.type === '收入'
        ? '<select id="fin-cat" autocomplete="off">' + incCats.map(c => '<option' + (c === '其他' ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>'
        : '<input id="fin-cat" autocomplete="off" placeholder="支出类别，如 进货 / 房租 / 工资">') +
      '<input id="fin-amt" type="number" min="0" step="0.01" placeholder="金额" autocomplete="off">' +
      '<input id="fin-note" placeholder="备注（可选）" autocomplete="off">' +
      '<button class="btn" onclick="FinMod.save()">＋ 添加</button>' +
      '</div>' +
      '<div class="hint" style="margin-top:6px">' + (this.gran === 'week' ? '当前「按周」：本条金额计入 ' + dateVal + '（该周六）所在整周。' : '当前「按日」：按单日记录。') + '</div>' +
      '</div>' +
      // 明细列表
      '<div class="card"><h3>📋 收支明细 <span class="card-ops">' +
      '<a onclick="FinMod.exportCsv()" title="导出 CSV">⬇ 导出</a>' +
      '<a onclick="FinMod.importCsv()" title="从 CSV 导入">📥 导入</a>' +
      '<a onclick="FinMod.openMonth()" title="按月生成合规账本">📒 月度账本</a>' +
      '</span></h3>' +
      '<table class="biz-table"><thead><tr><th>日期</th><th>类型</th><th>类别</th><th>金额</th><th>备注</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  },
  // ===== 月度合规账本 =====
  openMonth(){
    const m = this.selMonth;
    const all = Store.get('finance').items.filter(i => !i.del && i.date.slice(0, 7) === m);
    if(!all.length){ toast('「' + m + '」还没有财务数据', false); return; }
    let totalIn = 0, totalOut = 0;
    const inByCat = {}, expByCat = {};
    all.forEach(r => {
      const amt = +r.amount || 0;
      if(r.type === '收入'){ totalIn += amt; inByCat[r.category] = (inByCat[r.category] || 0) + amt; }
      else { totalOut += amt; expByCat[r.category] = (expByCat[r.category] || 0) + amt; }
    });
    const incCats = this.getIncomeCats(), expCats = this.getExpenseCats();
    const inTbl = incCats.map(c => { const v = inByCat[c] || 0; return '<tr><td>' + c + '</td><td class="c-red">' + moneyFmt(v) + '</td></tr>'; }).join('') || '<tr><td colspan="2" class="empty">无</td></tr>';
    const expTbl = expCats.map(c => { const v = expByCat[c] || 0; return '<tr><td>' + c + '</td><td class="c-green">' + moneyFmt(v) + '</td></tr>'; }).join('') || '<tr><td colspan="2" class="empty">无</td></tr>';
    const det = all.slice().sort((a, b) => a.date < b.date ? 1 : -1).map(r =>
      '<tr><td>' + r.date + '</td><td>' + (r.type === '收入' ? '收入' : '支出') + '</td><td>' + esc(r.category) + '</td><td>' + moneyFmt(+r.amount || 0) + '</td><td class="muted">' + esc(r.note || '') + '</td></tr>').join('');
    const gen = fmtDate(new Date());
    openModal(
      '<div class="fin-report">' +
      '<div class="fin-rep-ops modal-btns">' +
      '<button class="btn sm ghost" onclick="FinMod.exportMonth(\'' + m + '\')">⬇ 导出CSV</button>' +
      '<button class="btn sm" onclick="window.print()">🖨 打印 / 另存PDF</button>' +
      '<button class="btn sm ghost" onclick="closeModal()">关闭</button></div>' +
      '<h2 style="text-align:center;margin:6px 0">中医养生茶饮 · 财务账本</h2>' +
      '<div style="text-align:center;color:#888;margin-bottom:10px">' + m.slice(0, 4) + ' 年 ' + (+m.slice(5)) + ' 月 · 生成日期 ' + gen + '</div>' +
      '<table class="rep-sum"><tr><td>总收入</td><td class="c-red">' + moneyFmt(totalIn) + '</td><td>总支出</td><td class="c-green">' + moneyFmt(totalOut) + '</td><td>结余</td><td>' + moneyFmt(totalIn - totalOut) + '</td></tr></table>' +
      '<h3>一、收入分类明细</h3><table class="biz-table"><thead><tr><th>收入分类</th><th>金额</th></tr></thead><tbody>' + inTbl + '</tbody></table>' +
      '<h3>二、支出分类明细</h3><table class="biz-table"><thead><tr><th>支出分类</th><th>金额</th></tr></thead><tbody>' + expTbl + '</tbody></table>' +
      '<h3>三、收支明细</h3><table class="biz-table"><thead><tr><th>日期</th><th>类型</th><th>类别</th><th>金额</th><th>备注</th></tr></thead><tbody>' + det + '</tbody></table>' +
      '<div class="rep-foot">本账本由「中医养生茶饮云端协同工作台」自动生成，数据经云端多人共享、可追溯。</div>' +
      '</div>');
  },
  exportMonth(month){
    const all = Store.get('finance').items.filter(i => !i.del && i.date.slice(0, 7) === month);
    if(!all.length){ toast('本月暂无数据', false); return; }
    const head = ['日期', '周期', '类型', '类别', '金额', '备注'];
    const rows = all.slice().sort((a, b) => a.date < b.date ? 1 : -1).map(r => [r.date, (r.period === 'week' ? '按周' : '按日'), r.type, r.category, (+r.amount || 0), r.note || '']);
    const csv = [head].concat(rows).map(line => line.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    this._dl('财务账本_' + month + '.csv', csv);
    toast('已导出 ' + month + ' 财务账本');
  },
  _dl(name, csv){
    const blob = new Blob(['\ufeff' + csv], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  },
  // ===== 编辑 / 删除 =====
  editRec(id){
    const r = Store.get('finance').items.find(i => i.id === id); if(!r) return;
    this.editId = id;
    openModal('<h3>✎ 修改收支记录</h3>' +
      '<label class="f-label">日期</label><input id="er-date" type="date" value="' + r.date + '" autocomplete="off">' +
      '<label class="f-label">类型</label><select id="er-type"><option' + (r.type === '收入' ? ' selected' : '') + '>收入</option><option' + (r.type === '支出' ? ' selected' : '') + '>支出</option></select>' +
      '<label class="f-label">类别</label><input id="er-cat" value="' + esc(r.category) + '" placeholder="类别" autocomplete="off">' +
      '<label class="f-label">金额</label><input id="er-amt" type="number" min="0" step="0.01" value="' + (+r.amount || 0) + '" autocomplete="off">' +
      '<label class="f-label">备注</label><input id="er-note" value="' + esc(r.note || '') + '" autocomplete="off">' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="FinMod.saveRec()">保存</button></div>');
  },
  saveRec(){
    const r = Store.get('finance').items.find(i => i.id === this.editId); if(!r) return;
    const date = $('#er-date').value, type = $('#er-type').value, cat = $('#er-cat').value.trim(), amt = +($('#er-amt').value || 0);
    if(!cat){ toast('请填写类别', false); return; }
    if(!amt){ toast('请填写金额', false); return; }
    r.date = date || r.date; r.type = type; r.category = cat; r.amount = amt; r.note = ($('#er-note').value || '').trim();
    Store.markDirty('finance'); closeModal(); this.render(); toast('已保存');
  },
  remove(id){
    const items = Store.get('finance').items;
    const r = items.find(i => i.id === id); if(!r) return;
    if(!confirm('删除该条记录？')) return;
    r.del = true; Store.markDirty('finance'); this.render(); toast('已删除');
  },
  // ===== 分类管理（增 / 改 / 删）=====
  manageCats(mode){
    this.catMode = mode;
    const cats = mode === 'income' ? this.getIncomeCats() : this.getExpenseCats();
    const rows = cats.map((c, i) =>
      '<div class="cat-row"><span>' + esc(c) + '</span><a class="del" onclick="FinMod.delCat(\'' + mode + '\',' + i + ')">✕</a></div>').join('') ||
      '<div class="muted">暂无分类</div>';
    openModal('<h3>⚙ ' + (mode === 'income' ? '收入类型' : '支出分类') + '管理</h3>' +
      '<div class="hint">可增加、删除分类；修改名称请先删除再新增。</div>' +
      '<div class="cat-list">' + rows + '</div>' +
      '<div class="add-row"><input id="cat-new" placeholder="新增分类名称" autocomplete="off" onkeydown="if(event.key===\'Enter\')FinMod.addCat()">' +
      '<button class="btn" onclick="FinMod.addCat()">＋ 添加</button></div>' +
      '<div class="modal-btns"><button class="btn" onclick="closeModal()">完成</button></div>');
  },
  addCat(){
    const v = ($('#cat-new').value || '').trim(); if(!v){ toast('请输入名称', false); return; }
    const f = Store.get('finance');
    if(this.catMode === 'income'){ if(!f.incomeCats) f.incomeCats = FIN_INCOME_CATS.slice(); if(f.incomeCats.indexOf(v) >= 0){ toast('已存在该分类', false); return; } f.incomeCats.push(v); }
    else { if(!f.expenseCats) f.expenseCats = FIN_EXPENSE_CATS.slice(); if(f.expenseCats.indexOf(v) >= 0){ toast('已存在该分类', false); return; } f.expenseCats.push(v); }
    Store.markDirty('finance'); this.manageCats(this.catMode);
  },
  delCat(mode, i){
    const f = Store.get('finance');
    const arr = mode === 'income' ? f.incomeCats : f.expenseCats;
    if(!arr || !arr[i]) return;
    if(!confirm('删除分类「' + arr[i] + '」？已记录中该分类不会被改动。')) return;
    arr.splice(i, 1); Store.markDirty('finance'); this.manageCats(mode);
  },
  // ===== 导入 / 导出 =====
  exportCsv(){ const all = Store.get('finance').items.filter(i => !i.del).sort((a, b) => a.date < b.date ? 1 : -1); if(!all.length){ toast('暂无可导出的数据', false); return; }
    const head = ['日期', '周期', '类型', '类别', '金额', '备注'];
    const rows = all.map(r => [r.date, (r.period === 'week' ? '按周' : '按日'), r.type, r.category, (+r.amount || 0), r.note || '']);
    const csv = [head].concat(rows).map(line => line.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    this._dl('财务账本_' + todayStr() + '.csv', csv);
    toast('已导出 ' + all.length + ' 条记录');
  },
  importCsv(){
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv';
    inp.onchange = e => { const f = e.target.files[0]; if(f) this.handleCsv(f); inp.value = ''; };
    inp.click();
  },
  handleCsv(file){
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const lines = this.splitCsv(ev.target.result);
        if(lines.length < 2){ toast('CSV 至少需表头+一行数据', false); return; }
        const header = this.parseCsvLine(lines[0]).map(h => h.trim());
        const idx = {};
        ['日期','周期','类型','类别','金额','备注'].forEach(k => { const j = header.indexOf(k); if(j >= 0) idx[k] = j; });
        if(idx['日期'] == null || idx['金额'] == null){ toast('未找到「日期」「金额」列', false); return; }
        const items = Store.get('finance').items;
        const out = [];
        for(let i = 1; i < lines.length; i++){
          if(!lines[i].trim()) continue;
          const c = this.parseCsvLine(lines[i]);
          const date = this.normDate(c[idx['日期']]); if(!date) continue;
          const amt = parseFloat(String(c[idx['金额']] || '').replace(/[^\d.\-]/g, '')); if(isNaN(amt)) continue;
          const type = idx['类型'] != null ? (c[idx['类型']].indexOf('收入') >= 0 ? '收入' : '支出') : '支出';
          const cat = idx['类别'] != null ? (c[idx['类别']] || '').trim() : '';
          const period = idx['周期'] != null && /周/.test(c[idx['周期']]) ? 'week' : 'day';
          const note = idx['备注'] != null ? (c[idx['备注']] || '').trim() : '';
          out.push({id: uid(), date, type, category: cat || (type === '收入' ? '其他' : '其他支出'), amount: amt, note, period, createdAt: Date.now(), del: false});
        }
        if(!out.length){ toast('没有可导入的有效行', false); return; }
        this._csvImport = out;
        openModal('<h3>📥 确认导入财务数据</h3>' +
          '<div class="hint">识别到 <b>' + out.length + '</b> 行有效数据。导入后追加到现有记录（重复日期不会覆盖，可手动删除）。</div>' +
          '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
          '<button class="btn" onclick="FinMod.confirmImport()">导入 ' + out.length + ' 行</button></div>');
      } catch(err){ toast('解析失败：' + (err && err.message ? err.message : err), false); }
    };
    reader.onerror = () => toast('文件读取失败', false);
    reader.readAsText(file, 'utf-8');
  },
  confirmImport(){
    const out = this._csvImport || []; if(!out.length) return;
    Store.get('finance').items = Store.get('finance').items.concat(out);
    Store.markDirty('finance'); closeModal(); this.render();
    toast('已导入 ' + out.length + ' 条记录');
  },
  splitCsv(text){
    const res = []; let cur = ''; let q = false;
    for(let i = 0; i < text.length; i++){
      const c = text[i];
      if(c === '"'){ if(q && text[i+1] === '"'){ cur += '"'; i++; } else q = !q; }
      else if(c === '\n'){ if(q) cur += '\n'; else { res.push(cur); cur = ''; } }
      else if(c !== '\r'){ cur += c; }
    }
    if(cur.length || res.length) res.push(cur);
    return res;
  },
  parseCsvLine(line){
    const res = []; let cur = ''; let q = false;
    for(let i = 0; i < line.length; i++){
      const c = line[i];
      if(c === '"'){ if(q && line[i+1] === '"'){ cur += '"'; i++; } else q = !q; }
      else if(c === ','){ if(q) cur += ','; else { res.push(cur); cur = ''; } }
      else cur += c;
    }
    res.push(cur); return res;
  },
  normDate(v){
    if(v == null || v === '') return null;
    let s = String(v).trim();
    let mm = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if(mm) return mm[1] + '-' + pad2(+mm[2]) + '-' + pad2(+mm[3]);
    mm = s.match(/(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
    if(mm) return mm[1] + '-' + pad2(+mm[2]) + '-' + pad2(+mm[3]);
    return null;
  },
  // ===== 基础操作 =====
  setType(t){ this.type = t; this.render(); },
  setGran(g){ this.gran = g; this.render(); },
  unlock(){
    const p = $('#fin-pwd'); if(!p) return;
    if(p.value === FIN_PWD){ this.unlocked = true; try { localStorage.setItem('tcmws_fin_unlocked', '1'); } catch(e){} this.render(); }
    else { const e = $('#fin-lock-err'); if(e) e.textContent = '密码错误，请重试'; p.value = ''; p.focus(); }
  },
  lock(){ this.unlocked = false; try { localStorage.removeItem('tcmws_fin_unlocked'); } catch(e){} this.render(); },
  save(){
    const date = $('#fin-date').value || todayStr();
    const category = ($('#fin-cat').value || '').trim();
    const amount = +($('#fin-amt').value || 0);
    if(!category){ toast('请填写类别', false); return; }
    if(!amount){ toast('请填写金额', false); return; }
    const period = this.gran === 'week' ? 'week' : 'day';
    Store.get('finance').items.push({id: uid(), date, type: this.type, category, amount, note: ($('#fin-note').value || '').trim(), period, createdAt: Date.now(), del: false});
    Store.markDirty('finance'); toast('已记录'); this.render();
  }
};
