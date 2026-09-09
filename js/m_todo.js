'use strict';
// ============ 1️⃣ 待办事项 ============
// 提醒模式：remind = {mode:'none'} | {mode:'date', date:'YYYY-MM-DD'} | {mode:'week', days:[0..6]}
// 提前一天开始提醒：目标日 D-1 即进入「提前提醒」状态。
const WEEK_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const TodoMod = {
  selDate: todayStr(),
  render(){
    const el = $('#content');
    const d = this.selDate;
    const today = todayStr();
    el.innerHTML =
      '<div class="mod-head"><h2>📋 待办事项</h2><div class="date-nav">' +
      '<button class="btn sm" onclick="TodoMod.shift(-1)">◀ 前一天</button>' +
      '<input autocomplete="off" type="date" id="todo-date" value="' + d + '" onchange="TodoMod.setDate(this.value)">' +
      '<button class="btn sm" onclick="TodoMod.shift(1)">后一天 ▶</button>' +
      '<button class="btn sm ghost" onclick="TodoMod.setDate(todayStr())">回到今天</button>' +
      '</div></div>' +
      this.remindBanner(today) +
      '<div class="hint">' + d + ' ' + weekdayCn(d) + ' · 所有未删除项目永久保存，可切换日期查看历史 · 完成后自动归入本周/本月汇总</div>' +
      '<div class="two-col todo-stack">' +
      '<div class="col col-shop">' + this.panel('店内事项', 'shop', today) + '</div>' +
      '<div class="col col-daily">' + this.panel('重要待办工作', 'daily', today) + '</div>' +
      '</div>' +
      this.summary('week') + this.summary('month') + this.summaryShop();
  },
  setDate(v){ if(v){ this.selDate = v; this.render(); } },
  shift(n){ this.selDate = fmtDate(addDays(parseDate(this.selDate), n)); this.render(); },
  items(){ return Store.get('todo').items.filter(i => !i.del); },
  panel(title, type, today){
    const d = this.selDate;
    let list = this.items().filter(i => i.type === type);
    // 未完成的工作一直显示（直至完成归类到本周/本月汇总）；已完成项按日期归类，仅在所属日期显示
    list = list.filter(i => !i.done || i.date === d || i.doneDate === d);
    list.sort((a,b) => (a.done - b.done) || (a.createdAt - b.createdAt));
    const rows = list.map(i =>
      '<div class="todo-item' + (i.done ? ' done' : '') + '">' +
      '<label><input autocomplete="off" type="checkbox" ' + (i.done ? 'checked' : '') + ' onchange="TodoMod.toggle(\'' + i.id + '\')">' +
      '<span>' + esc(i.text) + '</span></label>' +
      '<span class="tags">' + (type === 'shop' ? '<em class="tag">' + i.date.slice(5) + '</em>' : '') +
      (this.remindState(i, today) ? '<em class="tag remind ' + this.remindState(i, today).level + '">🔔' + this.remindState(i, today).label + '</em>' : '') +
      (i.done ? '<em class="tag ok">完成于' + i.doneDate.slice(5) + '</em>' : '') + '</span>' +
      '<span class="ops"><a onclick="TodoMod.edit(\'' + i.id + '\')">✎</a><a class="del" onclick="TodoMod.remove(\'' + i.id + '\')">✕</a></span>' +
      '</div>').join('') || '<div class="empty">暂无事项</div>';
    return '<div class="card"><h3>' + (type === 'daily' ? '☀️' : '🏪') + ' ' + title + '</h3>' +
      '<div class="add-row"><input id="todo-add-' + type + '" name="todo-add-' + type + '" placeholder="输入事项，回车或点添加" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
      'onkeydown="if(event.key===\'Enter\')TodoMod.add(\'' +  type + '\')">' +
      '<button class="btn" onclick="TodoMod.add(\'' + type + '\')">＋添加</button></div>' +
      rows + '</div>';
  },
  add(type){
    const inp = $('#todo-add-' + type);
    const text = inp.value.trim();
    if(!text){ toast('请输入事项内容', false); return; }
    Store.get('todo').items.push({id: uid(), type, date: this.selDate, text, done: false, doneDate: null, createdAt: Date.now(), del: false});
    Store.markDirty('todo'); this.render(); toast('已添加');
  },
  find(id){ return Store.get('todo').items.find(i => i.id === id); },
  toggle(id){
    const i = this.find(id); if(!i) return;
    i.done = !i.done;
    i.doneDate = i.done ? todayStr() : null; // 按完成日期归类汇总；取消完成即从汇总消失
    Store.markDirty('todo'); this.render();
  },
  edit(id){
    const i = this.find(id); if(!i) return;
    const r = i.remind || {mode: 'none'};
    const mode = r.mode || 'none';
    const dateVal = (r.mode === 'date' && r.date) ? r.date : i.date;
    const weekChecks = WEEK_SHORT.map((w, idx) => {
      const wd = (idx === 0) ? 0 : idx; // 周日=0
      const on = (r.mode === 'week' && (r.days || []).includes(wd)) ? ' checked' : '';
      return '<label class="chip"><input type="checkbox" value="' + wd + '"' + on + '>' + w + '</label>';
    }).join('');
    openModal('<h3>编辑事项</h3>' +
      '<label class="f-label">内容</label><textarea id="ed-text" rows="3">' + esc(i.text) + '</textarea>' +
      '<label class="f-label">日期</label><input autocomplete="off" type="date" id="ed-date" value="' + i.date + '">' +
      '<label class="f-label">提醒</label>' +
      '<select id="ed-remind" onchange="TodoMod.onRemindChange()">' +
      '<option value="none"' + (mode === 'none' ? ' selected' : '') + '>不提醒</option>' +
      '<option value="date"' + (mode === 'date' ? ' selected' : '') + '>按具体日期</option>' +
      '<option value="week"' + (mode === 'week' ? ' selected' : '') + '>每周固定</option></select>' +
      '<div id="ed-remind-date-wrap" style="margin:6px 0;display:' + (mode === 'date' ? 'block' : 'none') + '">提醒日期 <input autocomplete="off" type="date" id="ed-remind-date" value="' + dateVal + '"></div>' +
      '<div id="ed-remind-week-wrap" style="margin:6px 0;display:' + (mode === 'week' ? 'block' : 'none') + '">固定星期（可多选）' +
      '<div class="chips">' + weekChecks + '</div></div>' +
      '<div class="hint">「提前一天就开始提醒」：目标日/目标星期的前一天即触发提醒。</div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="TodoMod.saveEdit(\'' + id + '\')">保存</button></div>');
  },
  onRemindChange(){
    const m = $('#ed-remind').value;
    const dw = document.getElementById('ed-remind-date-wrap');
    const ww = document.getElementById('ed-remind-week-wrap');
    if(dw) dw.style.display = (m === 'date') ? 'block' : 'none';
    if(ww) ww.style.display = (m === 'week') ? 'block' : 'none';
  },
  saveEdit(id){
    const i = this.find(id); if(!i) return;
    const t = $('#ed-text').value.trim(), dt = $('#ed-date').value;
    if(!t){ toast('内容不能为空', false); return; }
    i.text = t; if(dt) i.date = dt;
    const mode = $('#ed-remind').value;
    let remind = {mode: 'none'};
    if(mode === 'date'){
      const rd = $('#ed-remind-date').value;
      remind = rd ? {mode: 'date', date: rd} : {mode: 'none'};
    } else if(mode === 'week'){
      const days = [].slice.call(document.querySelectorAll('#ed-remind-week input:checked')).map(c => +c.value);
      remind = days.length ? {mode: 'week', days} : {mode: 'none'};
    }
    i.remind = remind;
    Store.markDirty('todo'); closeModal(); this.render(); toast('已保存');
  },
  remove(id){
    const i = this.find(id); if(!i) return;
    if(!confirm('确定删除该事项？删除后将不再显示。')) return;
    i.del = true; Store.markDirty('todo'); this.render(); toast('已删除');
  },
  // 提醒状态判定（相对 ref 日期，默认今天）。返回 null=不提醒，否则 {level, label}
  remindState(item, ref){
    if(!item.remind || item.remind.mode === 'none' || item.done) return null;
    const r = item.remind;
    const refD = parseDate(ref);
    if(r.mode === 'date'){
      if(!r.date) return null;
      const target = parseDate(r.date);
      if(fmtDate(target) === fmtDate(refD)) return {level: 'today', label: '今天提醒'};
      // 提前一天
      if(fmtDate(addDays(target, -1)) === fmtDate(refD)) return {level: 'soon', label: '提前提醒·明天' + weekdayCn(r.date)};
      if(refD > target) return {level: 'over', label: '已逾期·应于' + r.date};
      return null;
    }
    if(r.mode === 'week'){
      const days = r.days || [];
      if(days.includes(refD.getDay())) return {level: 'today', label: '今天提醒(每周)'};
      if(days.includes(addDays(refD, 1).getDay())) return {level: 'soon', label: '提前提醒·明天提醒'};
      return null;
    }
    return null;
  },
  // 顶部「今日提醒」汇总：列出相对今天处于提醒状态（含提前一天/逾期）的全部未完成提醒项
  remindBanner(today){
    const items = this.items().filter(i => !i.done && i.remind && i.remind.mode && i.remind.mode !== 'none');
    const groups = {over: [], today: [], soon: []};
    items.forEach(i => { const s = this.remindState(i, today); if(s && groups[s.level]) groups[s.level].push({i, s}); });
    const order = ['over', 'today', 'soon'];
    const all = order.flatMap(k => groups[k]);
    if(!all.length) return '';
    const sum = (k) => groups[k].length;
    const head = '<div class="remind-banner"><h3>🔔 今日提醒 <em class="tag warn">' + (sum('over') ? '逾期 ' + sum('over') + ' · ' : '') + '今天 ' + sum('today') + ' · 提前 ' + sum('soon') + '</em></h3>';
    const rows = all.map(({i, s}) =>
      '<div class="remind-row ' + s.level + '"><span class="r-tag">' + (s.level === 'over' ? '逾期' : s.level === 'today' ? '今天' : '提前') + '</span>' +
      '<span class="r-text">' + esc(i.text) + '</span>' +
      '<span class="r-meta">' + (i.type === 'shop' ? '🏪' : '☀️') + ' ' + i.date + ' · ' + s.label + '</span></div>').join('');
    return head + rows + '</div>';
  },
  summary(kind){
    const base = parseDate(this.selDate);
    let from, to, title, icon;
    if(kind === 'week'){
      // 周汇总周期：周六为周首 → 下周五（如 8.1周六 ~ 8.7周五）
      const off = (base.getDay() + 1) % 7;
      from = addDays(base, -off); to = addDays(from, 6);
      title = '本周汇总（' + fmtDate(from).slice(5) + ' ~ ' + fmtDate(to).slice(5) + '）'; icon = '🗓️';
    } else {
      from = new Date(base.getFullYear(), base.getMonth(), 1);
      to = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      title = '本月汇总（' + (base.getMonth() + 1) + '月）'; icon = '📅';
    }
    const f = fmtDate(from), t = fmtDate(to);
    const done = this.items().filter(i => i.type === 'daily' && i.done && i.doneDate >= f && i.doneDate <= t);
    const byDate = {};
    done.forEach(i => { (byDate[i.doneDate] = byDate[i.doneDate] || []).push(i); });
    const dates = Object.keys(byDate).sort();
    const body = dates.map(dt =>
      '<div class="sum-day"><div class="sum-date">' + dt + ' ' + weekdayCn(dt) + '</div>' +
      byDate[dt].map(i => '<div class="sum-item">✅ ' + esc(i.text) + '</div>').join('') +
      '</div>').join('') || '<div class="empty">该时段暂无已完成事项</div>';
    return '<div class="card sum-card"><h3>' + icon + ' ' + title + ' <em class="tag ok">已完成 ' + done.length + ' 项</em></h3>' + body + '</div>';
  },
  summaryShop(){
    const base = parseDate(this.selDate);
    const from = new Date(base.getFullYear(), base.getMonth(), 1);
    const to = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const f = fmtDate(from), t = fmtDate(to);
    const done = this.items().filter(i => i.type === 'shop' && i.done && i.doneDate >= f && i.doneDate <= t);
    const byDate = {};
    done.forEach(i => { (byDate[i.doneDate] = byDate[i.doneDate] || []).push(i); });
    const dates = Object.keys(byDate).sort();
    const body = dates.map(dt =>
      '<div class="sum-day"><div class="sum-date">' + dt + ' ' + weekdayCn(dt) + '</div>' +
      byDate[dt].map(i => '<div class="sum-item">✅ ' + esc(i.text) + '</div>').join('') +
      '</div>').join('') || '<div class="empty">本月暂无已完成店内事项</div>';
    return '<div class="card sum-card"><h3>🏪 本月店内事项汇总 <em class="tag ok">已完成 ' + done.length + ' 项</em></h3>' + body + '</div>';
  }
};
