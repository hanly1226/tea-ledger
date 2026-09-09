'use strict';
// ============ 备忘录 ============
// 数据存于云端 memo 分片，全店共享、随设备同步（与主数据同一数据源，换设备不丢）。
const MemoMod = {
  data(){
    const m = Store.get('memo');
    if(!m.items) m.items = [];
    return m;
  },
  render(){
    const el = $('#content');
    const m = this.data();
    const items = m.items.filter(x => !x.del)
      .sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (b.createdAt - a.createdAt));
    const rows = items.length ? items.map(r => {
      const t = new Date(r.createdAt);
      const ts = fmtDate(t) + ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
      return '<div class="card memo-item' + (r.done ? ' done' : '') + '">' +
        '<div class="memo-main">' +
          '<label class="memo-check"><input autocomplete="off" type="checkbox" ' + (r.done ? 'checked' : '') + ' onchange="MemoMod.toggle(\'' + r.id + '\')">' +
          '<span class="memo-text">' + esc(r.text) + '</span></label>' +
          '<div class="memo-time">' + ts + (r.pinned ? ' · 📌 置顶' : '') + '</div>' +
        '</div>' +
        '<div class="ops">' +
          (r.pinned ? '<a onclick="MemoMod.pin(\'' + r.id + '\')">📌取消</a>' : '<a onclick="MemoMod.pin(\'' + r.id + '\')">📌置顶</a>') +
          '<a onclick="MemoMod.edit(\'' + r.id + '\')">✎</a>' +
          '<a class="del" onclick="MemoMod.del(\'' + r.id + '\')">✕</a>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="empty">暂无备忘，下面添加一条吧</div>';
    el.innerHTML =
      '<div class="mod-head"><h2>📝 备忘录</h2></div>' +
      '<div class="card"><div class="add-row">' +
        '<textarea id="memo-add" rows="2" placeholder="输入备忘内容，点「添加」保存（Enter 快捷添加）"></textarea>' +
        '<button class="btn" onclick="MemoMod.add()">＋ 添加</button>' +
      '</div>' +
      '<div class="hint">备忘内容随云端全店共享，所有设备实时同步；勾选表示已完成，可置顶重要备忘。</div></div>' +
      rows;
  },
  add(){
    const inp = $('#memo-add'); if(!inp) return;
    const t = inp.value.trim();
    if(!t){ toast('请输入备忘内容', false); return; }
    const m = this.data();
    m.items.push({id: uid(), text: t, done: false, pinned: false, createdAt: Date.now(), del: false});
    Store.markDirty('memo'); this.render(); toast('已添加备忘');
  },
  toggle(id){
    const m = this.data();
    const r = m.items.find(x => x.id === id); if(!r) return;
    r.done = !r.done; Store.markDirty('memo'); this.render();
  },
  pin(id){
    const m = this.data();
    const r = m.items.find(x => x.id === id); if(!r) return;
    r.pinned = !r.pinned; Store.markDirty('memo'); this.render();
  },
  edit(id){
    const m = this.data();
    const r = m.items.find(x => x.id === id); if(!r) return;
    openModal('<h3>编辑备忘</h3>' +
      '<div class="lg-fld"><label>内容</label><textarea id="memo-ed" rows="3">' + esc(r.text) + '</textarea></div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="MemoMod.save(\'' + id + '\')">保存</button></div>');
  },
  save(id){
    const m = this.data();
    const r = m.items.find(x => x.id === id); if(!r) return;
    const t = $('#memo-ed').value.trim();
    if(!t){ toast('内容不能为空', false); return; }
    r.text = t; Store.markDirty('memo'); closeModal(); this.render(); toast('已保存');
  },
  del(id){
    const m = this.data();
    const r = m.items.find(x => x.id === id); if(!r) return;
    if(!confirm('确定删除该备忘？')) return;
    r.del = true; Store.markDirty('memo'); this.render(); toast('已删除');
  }
};
