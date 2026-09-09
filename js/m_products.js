'use strict';
// ============ 5️⃣ 产品资料库 ============
const ProdMod = {
  curCat: '',
  q: '',
  priceText(p){
    if(p.price == null) return '价格面议';
    let s = '原价 ¥' + p.price + (p.unit && p.unit !== '元' ? p.unit : '');
    if(p.member != null) s += ' <span class="muted">｜会员¥' + p.member + '</span>';
    if(p.staff != null) s += ' <span class="muted">｜职工¥' + p.staff + '</span>';
    return s;
  },
  render(){
    const el = $('#content');
    const cat = this.curCat || TCM_DATA.CATS[0];
    this.curCat = cat;
    const prods = Store.get('products').items.filter(p => !p.del);
    el.innerHTML =
      '<div class="mod-head"><h2>📚 产品资料库</h2>' +
      '<button class="btn" onclick="ProdMod.edit()">＋ 新增产品</button></div>' +
      '<div class="prod-search"><span class="ps-ico">🔍</span>' +
      '<input id="prod-q" name="prod-search" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="快速搜索：输入产品编号或名称，如 01 / 白龙涎 / S16 / 阿胶" ' +
      'value="' + esc(this.q || '') + '" oninput="ProdMod.onSearch(this.value)" ' +
      'onkeydown="if(event.key===\'Escape\'){ProdMod.clearSearch()}">' +
      (this.q ? '<button class="btn ghost sm" onclick="ProdMod.clearSearch()">✕ 清除</button>' : '') +
      '</div>' +
      '<div class="hint">共 ' + prods.length + ' 个产品 · 6 大类 · 产品数据与节气文案、体质匹配自动联动。</div>' +
      '<div id="prod-body">' + this.bodyHtml() + '</div>';
  },
  // 搜索：编号精确 > 编号前缀 > 名称开头 > 名称包含；名称无命中时按香方/功效/人群等内容兜底
  search(raw){
    const s = (raw || '').trim().toLowerCase().replace(/\s+/g, '');
    if(!s) return null;
    const alt = /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : null;
    const prods = Store.get('products').items.filter(p => !p.del);
    const hit = [];
    prods.forEach(p => {
      const nm = (p.name || '').toLowerCase();
      const flat = nm.replace(/\s+/g, '');
      const m = (p.name || '').match(/^([A-Za-z]{0,2}\d{1,3})[\s　]/);
      const code = m ? m[1].toLowerCase() : '';
      let sc = 0;
      if(code){
        if(code === s || (alt && code === alt)) sc = 100;
        else if(code.indexOf(s) === 0) sc = 80;
      }
      if(!sc){
        if(flat.indexOf(s) === 0) sc = 70;
        else if(flat.indexOf(s) >= 0) sc = 60;
      }
      if(sc) hit.push({p: p, sc: sc});
    });
    if(hit.length){
      hit.sort((a, b) => b.sc - a.sc);
      return {list: hit.map(x => x.p), fallback: false};
    }
    const keys = ['formula', 'effect', 'people', 'desc', 'herb', 'compat', 'note', 'avoid'];
    const deep = prods.filter(p =>
      keys.some(k => (p[k] || '').toLowerCase().indexOf(s) >= 0) ||
      (p.suit || []).some(t => t.toLowerCase().indexOf(s) >= 0) ||
      (p.cat || '').toLowerCase().indexOf(s) >= 0);
    return {list: deep, fallback: true};
  },
  onSearch(v){
    this.q = v;
    const b = $('#prod-body');
    if(b) b.innerHTML = this.bodyHtml();
    const box = $('#prod-q') && $('#prod-q').parentNode;
    if(box){
      const btn = box.querySelector('button');
      if(this.q && !btn){
        const nb = document.createElement('button');
        nb.className = 'btn ghost sm'; nb.textContent = '✕ 清除';
        nb.onclick = () => ProdMod.clearSearch();
        box.appendChild(nb);
      } else if(!this.q && btn){ btn.remove(); }
    }
  },
  clearSearch(){
    this.q = '';
    const i = $('#prod-q');
    if(i){ i.value = ''; i.focus(); }
    const b = $('#prod-body');
    if(b) b.innerHTML = this.bodyHtml();
    const box = i && i.parentNode, btn = box && box.querySelector('button');
    if(btn) btn.remove();
  },
  bodyHtml(){
    const prods = Store.get('products').items.filter(p => !p.del);
    const r = this.search(this.q);
    if(r){
      const kw = esc((this.q || '').trim());
      if(!r.list.length)
        return '<div class="card"><div class="empty">没有找到匹配「' + kw + '」的产品，换个编号或关键词试试</div></div>';
      return '<div class="hint">🔍 找到 <b>' + r.list.length + '</b> 个匹配「' + kw + '」的产品' +
        (r.fallback ? '（产品名无匹配，以下按香方 / 功效 / 适宜人群等内容命中）' : '') + '</div>' +
        '<div class="card">' + r.list.map(p => this.rowHtml(p, true)).join('') + '</div>';
    }
    const cat = this.curCat;
    const list = prods.filter(p => p.cat === cat);
    return '<div class="tabs">' + TCM_DATA.CATS.map(c =>
      '<span class="tab' + (c === cat ? ' on' : '') + '" onclick="ProdMod.curCat=\'' + c + '\';ProdMod.render()">' + c +
      ' <em>' + prods.filter(p => p.cat === c).length + '</em></span>').join('') + '</div>' +
      '<div class="card">' +
      (list.map(p => this.rowHtml(p, false)).join('') ||
        '<div class="empty">该类别暂无产品，点右上角"新增产品"录入</div>') +
      '</div>';
  },
  rowHtml(p, showCat){
    return '<div class="prod-row"><div class="prod-main">' +
      (showCat ? '<span class="pcat-tag">' + esc(p.cat) + '</span>' : '') +
      '<b>' + esc(p.name) + '</b>' +
      '<div class="price-line">' + this.priceText(p) + '</div>' +
      (p.formula ? '<div class="muted sm-txt">🧪 香方：' + esc(p.formula) + '</div>' : '') +
      (p.effect ? '<div class="muted"><b>功效：</b>' + esc(p.effect) + '</div>' : '') +
      '<div class="suit-tags">' + (p.suit || []).map(s => '<em class="tag">' + s + '</em>').join('') + '</div>' +
      (p.people ? '<div class="muted sm-txt"><b>适宜人群：</b>' + esc(p.people) + '</div>' : '') +
      (p.compat ? '<details class="prod-desc"><summary>和合配伍（君/臣/佐/使）</summary><div>' + esc(p.compat) + '</div></details>' : '') +
      (p.herb ? '<details class="prod-desc"><summary>本草实录</summary><div>' + esc(p.herb) + '</div></details>' : '') +
      (p.desc ? '<div class="muted sm-txt"><b>卖点：</b>' + esc(p.desc) + '</div>' : '') +
      (p.avoid ? '<div class="rec-avoid">⚠️ ' + esc(p.avoid) + '</div>' : '') +
      (p.note ? '<div class="muted sm-txt">备注：' + esc(p.note) + '</div>' : '') + '</div>' +
      '<span class="ops"><a onclick="ProdMod.edit(\'' + p.id + '\')">✎ 编辑</a>' +
      '<a class="del" onclick="ProdMod.remove(\'' + p.id + '\')">✕ 删除</a></span></div>';
  },
  find(id){ return Store.get('products').items.find(p => p.id === id); },
  edit(id){
    const p = id ? this.find(id) : {cat: this.curCat, name: '', price: '', member: '', staff: '', unit: '元', formula: '', effect: '', suit: [], avoid: '', people: '', compat: '', herb: '', desc: '', note: ''};
    if(!p) return;
    openModal('<h3>' + (id ? '编辑产品' : '新增产品') + '</h3>' +
      '<label class="f-label">产品名称 *</label><input autocomplete="off" id="pf-name" value="' + esc(p.name) + '">' +
      '<label class="f-label">所属大类</label><select id="pf-cat">' +
      TCM_DATA.CATS.map(c => '<option ' + (c === p.cat ? 'selected' : '') + '>' + c + '</option>').join('') + '</select>' +
      '<div class="three-col">' +
      '<div><label class="f-label">原价（元，留空=面议）</label><input autocomplete="off" id="pf-price" type="number" min="0" step="0.01" value="' + (p.price==null?'':p.price) + '"></div>' +
      '<div><label class="f-label">会员价（元）</label><input autocomplete="off" id="pf-member" type="number" min="0" step="0.01" value="' + (p.member==null?'':p.member) + '"></div>' +
      '<div><label class="f-label">职工价（元）</label><input autocomplete="off" id="pf-staff" type="number" min="0" step="0.01" value="' + (p.staff==null?'':p.staff) + '"></div></div>' +
      '<label class="f-label">单位（如：元 / 元/盒（15包））</label><input autocomplete="off" id="pf-unit" value="' + esc(p.unit || '元') + '">' +
      '<label class="f-label">配料 / 组成 / 香方</label><textarea id="pf-formula" rows="2">' + esc(p.formula || '') + '</textarea>' +
      '<label class="f-label">功效（如：温养头皮、理气安神、滋养发根、舒缓紧绷）</label><textarea id="pf-effect" rows="2">' + esc(p.effect || '') + '</textarea>' +
      '<label class="f-label">适宜体质（点选，用于体质匹配与节气文案）</label>' +
      '<div class="chips" id="pf-suit">' + TCM_DATA.BODY_TYPES.map(bt =>
        '<span class="chip' + ((p.suit || []).indexOf(bt) >= 0 ? ' on' : '') + '" data-bt="' + bt + '" onclick="this.classList.toggle(\'on\')">' + bt + '</span>').join('') + '</div>' +
      '<label class="f-label">禁忌 / 慎用人群</label><textarea id="pf-avoid" rows="2">' + esc(p.avoid || '') + '</textarea>' +
      '<label class="f-label">适宜人群（如：气虚疲惫、久坐头部紧绷人群）</label><textarea id="pf-people" rows="2">' + esc(p.people || '') + '</textarea>' +
      '<label class="f-label">和合配伍（君/臣/佐/使，合香专用）</label><textarea id="pf-compat" rows="3">' + esc(p.compat || '') + '</textarea>' +
      '<label class="f-label">本草实录（合香专用）</label><textarea id="pf-herb" rows="3">' + esc(p.herb || '') + '</textarea>' +
      '<label class="f-label">卖点</label><textarea id="pf-desc" rows="2">' + esc(p.desc || '') + '</textarea>' +
      '<label class="f-label">备注</label><input autocomplete="off" id="pf-note" value="' + esc(p.note || '') + '">' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="ProdMod.save(\'' + (id || '') + '\')">保存</button></div>', 'wide');
  },
  save(id){
    const name = $('#pf-name').value.trim();
    if(!name){ toast('请填写产品名称', false); return; }
    const suit = $$('#pf-suit .chip.on').map(c => c.dataset.bt);
    const pr = $('#pf-price').value.trim(), mb = $('#pf-member').value.trim(), sf = $('#pf-staff').value.trim();
    const obj = {
      cat: $('#pf-cat').value, name,
      price: pr === '' ? null : (+pr || 0),
      member: mb === '' ? null : (+mb || 0),
      staff: sf === '' ? null : (+sf || 0),
      unit: $('#pf-unit').value.trim() || '元',
      formula: $('#pf-formula').value.trim(),
      effect: $('#pf-effect').value.trim(),
      suit,
      avoid: $('#pf-avoid').value.trim(),
      people: $('#pf-people').value.trim(),
      compat: $('#pf-compat').value.trim(),
      herb: $('#pf-herb').value.trim(),
      desc: $('#pf-desc').value.trim(),
      note: $('#pf-note').value.trim()
    };
    if(id){ Object.assign(this.find(id), obj); }
    else { obj.id = uid(); obj.del = false; Store.get('products').items.push(obj); }
    Store.markDirty('products'); closeModal();
    this.curCat = obj.cat; this.render(); toast('已保存');
  },
  remove(id){
    const p = this.find(id); if(!p) return;
    if(!confirm('确定删除产品「' + p.name + '」？')) return;
    p.del = true; Store.markDirty('products'); this.render(); toast('已删除');
  }
};
