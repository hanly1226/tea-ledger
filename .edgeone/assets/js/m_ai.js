'use strict';
// ============ 9️⃣ 中医AI助手（内置知识 + 产品精准匹配 + 大模型兜底）============
// 症状 → 体质 关键词映射
const TCM_AI_SYMPTOM = [
  {bt:['阳虚质'], kw:['怕冷','手脚凉','手脚冷','畏寒','凉','寒','阳虚','温阳','暖身','小腹冷','痛经畏寒']},
  {bt:['气虚质'], kw:['疲劳','没精神','乏力','易累','困乏','犯困','气短','提不起劲','气虚','没力气','没劲']},
  {bt:['阴虚质'], kw:['口干','眼干','熬夜','上火','燥','阴虚','皮肤干','潮热','盗汗','咽干','阴虚']},
  {bt:['痰湿质'], kw:['湿气','湿重','困重','舌苔厚','胖','痰','水肿','痰湿','身沉','虚胖','肉松','沉重']},
  {bt:['湿热质'], kw:['长痘','油腻','口苦','湿热','痘痘','痤疮','面油','口臭','湿热']},
  {bt:['血瘀质'], kw:['色斑','气色暗','血块','血瘀','暗沉','唇暗','痛经血块','血瘀']},
  {bt:['气郁质'], kw:['郁闷','情绪低落','压力大','压力','疏肝','气郁','心烦','焦虑','爱叹气','压抑','闷闷不乐','舒缓','安神','宁静','解郁','郁结','情绪不畅','不开心','紧绷']},
  {bt:['特禀质'], kw:['过敏','鼻炎','特禀','荨麻疹','易过敏','特禀']},
  {bt:['平和质'], kw:['日常','养生','保健','平和','调理','不知道','亚健康']}
];
// 产品分类别名 → 标准分类名（用于"推荐合香产品""来点奶茶"等按分类推荐）
const TCM_AI_CAT_ALIAS = {
  '合香':'合香产品', '合香产品':'合香产品',
  '奶茶':'奶茶咖啡', '咖啡':'奶茶咖啡', '奶茶咖啡':'奶茶咖啡',
  '药食':'药食同源食品', '药食同源':'药食同源食品', '药食同源食品':'药食同源食品',
  '袋泡':'袋泡茶饮', '袋泡茶':'袋泡茶饮', '袋泡茶饮':'袋泡茶饮',
  '膏方':'膏方',
  '药枕':'药枕香囊', '香囊':'药枕香囊', '药枕香囊':'药枕香囊'
};
// 店铺运营 / 中医 / 膳食 常见问题知识库（命中关键词即答）
const TCM_AI_KB = [
  {cat:'中医', kw:['湿气','祛湿','水肿','舌苔厚','湿重','困重'], a:'祛湿先健脾。本店可用「芪薏轻湿饮」（茯苓、炒薏苡仁、炙黄芪、陈皮），适合身体困重、舌苔厚、久坐人群；配合少吃生冷油腻、适度出汗。若伴明显乏力可加「元气参芪颂」补气。'},
  {cat:'中医', kw:['上火','口腔溃疡','咽喉','牙龈','喉咙痛','虚火'], a:'实火宜清，可饮「冬酿乌梅饮」（乌梅、陈皮、生山楂、桑葚、薄荷）生津清热；熬夜引起的虚火（口干舌红）更适合「玉润桑杞饮」（桑葚、枸杞、玉竹）滋阴。忌辛辣烧烤，多喝水。'},
  {cat:'中医', kw:['失眠','睡不好','多梦','心烦失眠','睡不着'], a:'养心安神为主。「花颜洛神神赋」（玫瑰、洛神花、麦冬、红枣、枸杞）疏肝安神；「玉润桑杞饮」滋阴润燥也助眠。睡前少看手机、温水泡脚、避免浓茶咖啡。'},
  {cat:'中医', kw:['气血不足','气虚','乏力','没精神','气短'], a:'补气养血。「元气参芪颂」（西洋参、党参、黄芪、龙眼肉）益气提神；「暖姜红茶乳」温养气血；面色苍白可配「亮颜七白饮」养气血润肤。'},
  {cat:'中医', kw:['脾胃','没胃口','饭后胀','饱胀','犯困','消化'], a:'健脾助运。「脾安茯麦饮」（党参、茯苓、炒麦芽、大枣）专司没胃口、饭后饱胀、总犯困；配「芪薏轻湿饮」祛湿醒脾。饮食七分饱、细嚼慢咽。'},
  {cat:'中医', kw:['怕冷','手脚凉','阳虚','痛经畏寒','小腹冷'], a:'温阳暖身。「暖姜红茶乳」（生姜、红糖、牛奶）日常暖身；经期小腹冷痛可热饮并保暖。冬季可常备，「元气参芪颂」也温补气血。'},
  {cat:'中医', kw:['长痘','痤疮','油腻','湿热','口苦','面油'], a:'清利湿热。「冬酿乌梅饮」清热生津；「鲜萃柠檬饮」清爽解腻；忌辛辣甜腻、少熬夜。面部油多可配「玉润桑杞饮」滋阴平衡。'},
  {cat:'膳食', kw:['皮肤干燥','口干眼干','熬夜','阴虚','皮肤干'], a:'滋阴润燥。「玉润桑杞饮」（桑葚、枸杞、玉竹）润燥；「养发五黑饮」滋肾润发；「亮颜七白饮」养肤。多吃银耳百合，少熬夜。'},
  {cat:'中医', kw:['气色暗','色斑','血瘀','血块','唇暗'], a:'行气活血。「花颜洛神神赋」（玫瑰、洛神花、麦冬）疏肝活血养颜；经期暗沉血块可温饮「暖姜红茶乳」。保持心情舒畅、适度运动。'},
  {cat:'中医', kw:['郁闷','压力大','情绪','气郁','焦虑','叹气'], a:'疏肝解郁。「花颜洛神神赋」疏肝理气；可泡玫瑰陈皮水。多户外活动、少生闷气。'},
  {cat:'中医', kw:['过敏','鼻炎','特禀','荨麻疹'], a:'固表防敏。平时可饮「玉润桑杞饮」养阴固表；换季少接触花粉尘螨。症状明显请遵医嘱，不擅自停药。'},
  {cat:'膳食', kw:['减肥','控糖','减脂','怕甜','降糖','血糖'], a:'选低糖基底。「鲜萃柠檬饮」「冬酿乌梅饮」均可用木糖醇基底（控糖友好）；「芪薏轻湿饮」健脾祛湿助代谢。配合饮食与运动，不盲目节食。'},
  {cat:'中医', kw:['九种体质','体质辨识','体质分辨','什么体质'], a:'中医将体质分为平和、气虚、阳虚、阴虚、痰湿、湿热、血瘀、气郁、特禀九种。可在「🧭 体质匹配」里按症状自测，我会据此精准推荐产品。'},
  {cat:'中医', kw:['孕妇','哺乳期','怀孕','喂奶'], a:'孕期、哺乳期及慢性病人群建议先咨询医生或药师，不宜自行药食调理；本店产品多为药食同源，仍须遵医嘱。'},
  {cat:'中医', kw:['小孩','儿童','孩子'], a:'儿童脾胃娇嫩，建议减量或咨询医师；含咖啡因的咖啡类不建议儿童饮用。'},
  {cat:'膳食', kw:['怎么泡','泡茶','冲泡','怎么喝','养生茶'], a:'代茶饮温水冲泡、现泡现饮为佳；温阳类（如暖姜红茶乳）趁热喝，滋阴类（玉润桑杞饮）温饮即可。每日1-2杯，坚持更见效果。'},
  {cat:'运营', kw:['会员价','价格','多少钱','价位','价格表'], a:'本店产品有门市价与会员价（多数会员价更优惠，如奶茶咖啡类会员价约8元）。具体以店内公示为准，可让顾客加会员享专属价。'},
  {cat:'运营', kw:['嫌贵','说贵','贵了','太贵','怎么应对','客户拒绝'], a:'话术参考：先共情——"理解，养生是长期投资"；再讲价值——"咱家是药食同源真材实料，一杯会员价才几元，比外面奶茶还划算，还能调理身体"；可推会员或组合。重点是专业可信、不硬推销。'},
  {cat:'运营', kw:['发朋友圈','引流','宣传','推广','怎么做活动'], a:'说"写一条朋友圈养生文案"我直接帮你生成。通用思路：结合当令节气 + 一个痛点 + 一款产品 + 门店信息，配图温暖真实，别硬广。'},
  {cat:'运营', kw:['台账','运营台账','对账','记账','csv'], a:'「📒 运营台账」含团购、委托加工、零方/挂号/食堂卡等多本账，每笔订单可记产品、数量、金额、收款方式，支持导出CSV，月底对账方便。'},
  {cat:'运营', kw:['库存','产品资料','产品库','怎么改产品'], a:'「📚 产品资料」是本店完整产品库（6大类、百款），可增改；改完全店即时同步。'},
  {cat:'中医', kw:['感冒','风寒','喉咙不舒服','受凉'], a:'风寒初起可热饮「暖姜红茶乳」驱寒；风热咽痛用「冬酿乌梅饮」清热。症状重或发烧请就医，茶饮仅作日常辅助。'},
  {cat:'膳食', kw:['三高','血压','血脂','心血管'], a:'控糖选木糖醇基底产品（冬酿乌梅饮、鲜萃柠檬饮）；饮食少盐少油。具体用药请遵医嘱，茶饮不替代药物。'},
  {cat:'中医', kw:['空调病','暑湿','夏天怕冷','暑热'], a:'暑湿可用「芪薏轻湿饮」健脾祛湿；空调房怕冷饮「暖姜红茶乳」暖身。空调温度别过低、多补水。'},
  {cat:'膳食', kw:['合香','香疗','熏香','香牌','香丸','香囊'], a:'合香属中医香疗范畴，本店合香产品可用于环境熏香、安神醒脑、驱蚊避秽、化湿醒脾。想看具体产品请说"推荐合香产品"，我按本店产品库精准列出；也可在「📚 产品资料」里查看合香分类。'}
];

// 大模型厂商预设（选厂商自动填好地址与默认模型；密钥存云端、全店共享）
const AI_VENDORS = {
  '':      {name: '自定义 / 手动填写', base: '', model: ''},
  'deepseek': {name: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat'},
  'doubao': {name: '豆包（火山方舟）', base: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-1-6-250615'},
  'aliyun': {name: '阿里云百炼（通义千问）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus'},
  'zhipu':  {name: '智谱 AI（GLM）', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4'},
  'openai': {name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o'}
};

const AiMod = {
  msgs: null,
  // 优先读云端共享 settings 分片（全店通用），localStorage 仅作离线兜底
  cfg(){
    try {
      const s = Store.get('settings');
      if(s && s.ai && (s.ai.base || s.ai.key)) return s.ai;
    } catch(e){}
    try { return JSON.parse(localStorage.getItem('tcmws_ai_cfg') || '{}'); } catch(e){ return {}; }
  },
  // 写入云端 settings 分片（全店共享），并保留 localStorage 作为离线兜底
  saveCfg(c){
    const s = Store.get('settings') || {};
    s.ai = c;
    Store.data['settings'] = s;
    Store.markDirty('settings');
    try { localStorage.setItem('tcmws_ai_cfg', JSON.stringify(c)); } catch(e){}
  },
  // 旧版仅存本机的配置 → 迁移到云端共享分片（仅首次）
  migrateLegacy(){
    try {
      const s = Store.get('settings') || {};
      if(!s.ai){
        const legacy = JSON.parse(localStorage.getItem('tcmws_ai_cfg') || 'null');
        if(legacy && (legacy.base || legacy.key)){
          s.ai = legacy; Store.data['settings'] = s; Store.markDirty('settings');
        }
      }
    } catch(e){}
  },
  // 根据当前 base 反查匹配的厂商 key（用于下拉默认选中）
  vendorKeyOf(c){
    if(!c || !c.base) return '';
    for(const k in AI_VENDORS){ if(k && AI_VENDORS[k].base === c.base) return k; }
    return '';
  },
  // 切换厂商时自动填好地址与默认模型
  applyVendor(k){
    const v = AI_VENDORS[k]; if(!v) return;
    const b = $('#ai-base'), m = $('#ai-model');
    if(b && v.base) b.value = v.base;
    if(m && v.model) m.value = v.model;
  },
  loadChat(){ try { return JSON.parse(localStorage.getItem('tcmws_ai_chat') || '[]'); } catch(e){ return []; } },
  saveChat(){ try { localStorage.setItem('tcmws_ai_chat', JSON.stringify((this.msgs || []).slice(-60))); } catch(e){} },
  render(){
    if(this.msgs === null) this.msgs = this.loadChat();
    const el = $('#content');
    el.innerHTML =
      '<div class="mod-head"><h2>🤖 中医AI助手</h2>' +
      '<span class="mod-ops">' +
      '<button class="btn sm ghost" onclick="AiMod.openSummary()">📝 写汇报总结</button>' +
      '<button class="btn sm ghost" onclick="AiMod.clearChat()">清空</button>' +
      '<button class="btn sm ghost" onclick="AiMod.openBackup()">☁️ 数据备份</button>' +
      '<button class="btn sm ghost" onclick="AiMod.openSettings()">⚙️ 大模型设置</button></span></div>' +
      '<div class="hint">精通中医 · 中药 · 膳食 · 店铺运营：可精准推荐本店产品、解答常见疑问、按店内情况（节气/天气/产品库）写材料。点「🚀 发送给大模型」可<b>直接调用你配置的大模型</b>自由回答或生成内容（跳过内置知识库）。</div>' +
      '<div id="ai-chat" class="ai-chat"></div>' +
      '<div class="ai-input">' +
      '<input autocomplete="off" name="ai-prompt" id="ai-text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="例如：我湿气重又爱长痘，推荐点什么？ / 写一条今天朋友圈养生文案" onkeydown="if(event.key===\'Enter\')AiMod.send(false)">' +
      '<button class="btn" onclick="AiMod.send(false)">发送</button>' +
      '<button class="btn ai-llm" onclick="AiMod.send(true)" title="直接调用你配置的大模型回答/生成，跳过内置知识库">🚀 发送给大模型</button></div>';
    this.renderMsgs();
    const t = $('#ai-text'); if(t) t.focus();
  },
  clearChat(){ this.msgs = []; this.saveChat(); this.renderMsgs(); },
  renderMsgs(){
    const box = $('#ai-chat'); if(!box) return;
    if(!this.msgs || !this.msgs.length){
      box.innerHTML = '<div class="ai-empty">👋 你好，我是本店中医养生AI助手。试着问我："湿气重推荐什么"、"熬夜上火喝哪款"、"写一条朋友圈养生文案"、"客户嫌贵怎么应对"。</div>';
      return;
    }
    box.innerHTML = this.msgs.map(m => this.msgHTML(m)).join('');
    box.scrollTop = box.scrollHeight;
  },
  msgHTML(m){
    if(m.role === 'user') return '<div class="ai-msg user"><div class="bubble">' + esc(m.text) + '</div></div>';
    let body;
    if(m.pending) body = '<div class="bubble typing">' + esc(m.text || '思考中…') + '</div>';
    else if(m.type === 'rec'){
      const focus = [].concat(m.consts || [], m.cats || []);
      body = '<div class="bubble"><div class="rec-h">🍵 为你精准推荐' +
        (focus.length ? '（侧重：' + esc(focus.join('、')) + '）' : '') + '：</div>' + this.hitsHTML(m.hits) + '</div>';
    } else if(m.type === 'material'){
      body = '<div class="bubble"><div class="rec-h">📝 ' + esc(m.title) + '</div><pre class="mat">' + esc(m.text) +
        '</pre><button class="btn sm ghost" data-copy="' + enc(m.text) + '" onclick="AiMod.copyThis(this)">复制</button></div>';
    } else if(m.type === 'kb'){
      body = '<div class="bubble"><span class="kb-cat">' + esc(m.cat || '知识') + '</span>' + esc(m.text) +
        '<button class="btn sm ghost" data-copy="' + enc(m.text) + '" onclick="AiMod.copyThis(this)">复制</button></div>';
    } else if(m.type === 'fallback'){
      body = '<div class="bubble">' + esc(this.fallbackText()) + '</div>';
    } else {
      body = '<div class="bubble">' + esc(m.text || '') +
        (m.text ? '<button class="btn sm ghost" data-copy="' + enc(m.text) + '" onclick="AiMod.copyThis(this)">复制</button>' : '') + '</div>';
    }
    return '<div class="ai-msg ai">' + body + '</div>';
  },
  copyThis(btn){ copyText(decodeURIComponent(btn.dataset.copy || '')); },
  hitsHTML(hits){
    return (hits || []).map(h => '<div class="rec-mini"><b>' + esc(h.p.name) + '</b> <span class="rcat">' + esc(h.p.cat) +
      '</span><div class="reff">' + (h.p.effect ? '功效：' + esc(h.p.effect) : '') + '</div>' +
      (h.p.formula ? '<div class="rfor">配方：' + esc(h.p.formula) + '</div>' : '') +
      (h.reasons && h.reasons.length ? '<div class="rwhy">匹配：' + esc(h.reasons.join('、')) + '</div>' : '') + '</div>').join('');
  },
  // ===== 意图识别 =====
  isRecIntent(q){
    if(TCM_AI_SYMPTOM.some(s => s.kw.some(k => q.indexOf(k) >= 0))) return true;
    return ['推荐','适合','喝什么','喝啥','买','调理','吃点','泡','养生茶','什么好','选','配','调一调','改善','哪款','哪个好','来点']
      .some(k => q.indexOf(k) >= 0);
  },
  detectMaterial(q){
    if(/(写|生成|来|给我|帮写|拟|起草|编|说一段|拟一段|来一段)/.test(q) &&
       /(文案|朋友圈|社群|海报|宣传|小报|养生报|通知|公告|话术|回访|跟进|早安|晚安|发圈|介绍|简介|门店|店铺|本店|品牌|招牌|推文)/.test(q)){
      if(/介绍|简介|门店|店铺|本店|品牌|招牌|推文/.test(q)) return {kind:'intro', title:'门店介绍 / 品牌简介'};
      if(/朋友圈|社群|发圈|早安|晚安|宣传|文案/.test(q)) return {kind:'moments', title:'朋友圈 / 社群养生文案'};
      if(/小报|养生报|节气/.test(q)) return {kind:'report', title:(this.termName()) + '节气养生小报'};
      if(/通知|公告/.test(q)) return {kind:'notice', title:'店内通知'};
      if(/话术|回访|跟进/.test(q)) return {kind:'followup', title:'客户回访话术'};
      return {kind:'moments', title:'养生文案'};
    }
    return null;
  },
  // ===== 产品精准匹配 =====
  detectCats(q){
    const out = new Set();
    (TCM_DATA.CATS || []).forEach(c => { if(q.indexOf(c) >= 0) out.add(c); });
    Object.keys(TCM_AI_CAT_ALIAS).forEach(a => { if(q.indexOf(a) >= 0) out.add(TCM_AI_CAT_ALIAS[a]); });
    return out;
  },
  recommendProducts(q){
    const consts = new Set();
    TCM_AI_SYMPTOM.forEach(s => { if(s.kw.some(k => q.indexOf(k) >= 0)) s.bt.forEach(b => consts.add(b)); });
    const cats = this.detectCats(q);
    const prods = Store.get('products').items.filter(p => !p.del);
    const scored = prods.map(p => {
      let s = 0; const reasons = [];
      if(cats.has(p.cat)){ s += 3; if(reasons.indexOf(p.cat) < 0 && reasons.length < 4) reasons.push(p.cat); }
      (p.suit || []).forEach(b => { if(consts.has(b)){ s += 3; if(reasons.indexOf(b) < 0 && reasons.length < 4) reasons.push(b); } });
      const hay = [p.name, p.effect, p.formula, p.people, p.herb, p.compat, p.note].filter(Boolean).join(' ').toLowerCase();
      TCM_AI_SYMPTOM.forEach(sm => sm.kw.forEach(k => {
        if(q.indexOf(k) >= 0 && hay.indexOf(k.toLowerCase()) >= 0){
          s += 1; if(reasons.indexOf(k) < 0 && reasons.length < 4) reasons.push(k);
        }
      }));
      return {p, s, reasons};
    }).filter(x => x.s > 0);
    scored.sort((a, b) => b.s - a.s);
    return {consts: [...consts], cats: [...cats], hits: scored.slice(0, 6)};
  },
  matchKB(q){ for(const e of TCM_AI_KB){ if(e.kw.some(k => q.indexOf(k) >= 0)) return e; } return null; },
  termName(){ const t = WellMod.getTerm(todayStr()); return t ? t.name : ''; },
  pickProducts(n){
    const prods = Store.get('products').items.filter(p => !p.del);
    const t = WellMod.getTerm(todayStr()) || {};
    let pool = prods;
    if(t.focus && t.focus.length){
      const mapped = prods.filter(p => (p.suit || []).some(s => t.focus.some(f => s.indexOf(f) >= 0 || f.indexOf(s) >= 0)));
      if(mapped.length) pool = mapped;
    }
    return pool.slice(0, n).map(p => p.name + '（' + (p.effect || '') + '）').join('、') || '多款应季养生茶饮';
  },
  // ===== 材料生成 =====
  genMaterial(kind, q){
    const t = WellMod.getTerm(todayStr()) || {};
    const shop = TCM_CONFIG.shopName, city = TCM_CONFIG.city;
    const feat = t.feat || '', tips = t.tips || '', diet = t.diet || '', avoid = t.avoid || '';
    const prods = this.pickProducts(3);
    if(kind === 'moments'){
      return '【' + shop + ' · 今日养生】\n' + (t.name ? t.name + '时节，' : '') + feat + '\n' + diet + '\n今天为大家推荐：' + prods + '。\n温一杯养生茶，把健康喝进日常。🍵 到店即享会员价～';
    }
    if(kind === 'intro'){
      const cats = (TCM_DATA.CATS || []).join('、');
      const sig = this.pickProducts(4);
      return '【' + shop + ' · 门店介绍】\n' +
        shop + '是一家扎根' + city + '、以「药食同源」为理念的中医养生茶饮店，把中医调理智慧融入日常一杯茶。\n' +
        '🌿 我们提供 ' + (cats || '多类') + ' 等百余款产品，覆盖祛湿、安神、温阳、润燥、疏肝等调理方向，从代茶饮、膏方到合香香疗一应俱全。\n' +
        '🍵 招牌推荐：' + sig + '。\n' +
        '📍 坚持真材实料、现配现饮，并提供会员专属价，让养生更简单、更日常。欢迎到店品鉴～';
    }
    if(kind === 'report'){
      return '《' + shop + ' ' + (t.name || '当令') + '节气养生小报》\n' +
        '📅 节气特点：' + feat + '\n💡 养生要点：' + tips + '\n🍲 饮食参考：' + diet + '\n⚠️ 起居提醒：' + avoid + '\n' +
        '🍵 本店推荐：' + prods + '\n温馨提示：以上仅供日常养生参考，具体问题请线下咨询医师或药师。';
    }
    if(kind === 'notice'){
      return '【' + shop + ' 店内通知】\n各位顾客：当前正值' + (t.name || '当令') + '，' + (feat || '天气渐变') +
        '。店内已上新应季养生茶饮，会员享专属价；营业时间正常，欢迎到店品鉴。\n——' + shop + ' 敬上';
    }
    if(kind === 'followup'){
      return '【客户回访话术】\n您好，我是' + shop + '的小助手~ 看您之前关注养生调理，最近' + (t.name || '当令') +
        '时节，' + (feat || '') + (diet || '') + '\n想回访下您最近睡得好吗、身体有没有什么想改善的？我们按您的情况配了合适的茶饮，方便的话到店聊聊呀😊';
    }
    return '【' + shop + ' 养生文案】\n' + (t.name ? t.name + '：' : '') + diet + '\n推荐：' + prods;
  },
  fallbackText(){
    return '这个问题我内置知识暂时覆盖不到。你可以：\n① 点击下方「⚙️ 大模型设置」填入 API Key，我就能联网调用大模型自由回答；\n② 换种说法，比如描述具体症状（如"湿气重、爱长痘"）让我精准推荐产品，或说"写一条朋友圈文案"让我帮你写材料。';
  },
  // ===== 回复主流程 =====
  async send(force){
    const inp = $('#ai-text'); if(!inp) return;
    const text = inp.value.trim();
    if(!text) return;
    inp.value = '';
    if(this.msgs === null) this.msgs = this.loadChat();
    this.msgs.push({role:'user', text});
    this.msgs.push({role:'ai', pending:true, text:'思考中…'});
    this.saveChat(); this.renderMsgs();
    const res = await this.respond(text, force);
    const last = this.msgs[this.msgs.length - 1];
    Object.assign(last, res, {pending:false});
    this.saveChat(); this.renderMsgs();
  },
  async respond(q, force){
    const forceLLM = /问大模型|用大模型|请问ai|问问ai|问ai|联网|deepseek|gpt|chatgpt/i.test(q);
    if(!force){
      const mat = this.detectMaterial(q);
      if(mat) return {type:'material', title: mat.title, text: this.genMaterial(mat.kind, q)};
      if(this.isRecIntent(q) || this.detectCats(q).size){
        const rec = this.recommendProducts(q);
        if(rec.hits.length) return {type:'rec', consts: rec.consts, cats: rec.cats, hits: rec.hits};
      }
      const kb = this.matchKB(q);
      if(kb) return {type:'kb', cat: kb.cat, text: kb.a};
    }
    if(forceLLM || force || this.cfg().key){
      const r = await this.callLLM(q);
      if(r.err) return {type:'text', text: '⚠️ 大模型调用失败：' + r.err + '\n请检查「⚙️ 大模型设置」中的地址/密钥，或稍后重试。'};
      return {type:'text', text: r.text};
    }
    return {type:'fallback'};
  },
  // ===== 大模型兜底（密钥仅存本机，浏览器直连厂商）=====
  async callLLM(text){
    const cfg = this.cfg();
    if(!cfg.key || !cfg.base) return {err:'未配置大模型API'};
    const products = Store.get('products').items.filter(p => !p.del)
      .map(p => p.name + '｜' + p.cat + '｜' + (p.effect || '') + '｜' + (p.suit || []).join('/')).join('\n');
    const term = WellMod.getTerm(todayStr()) || {};
    const sys = '你是「' + TCM_CONFIG.shopName + '」店的中医养生AI助手，精通中医、中药、膳食养生与店铺运营。' +
      '店铺所在城市：' + TCM_CONFIG.city + '。当前节气：' + (term.name || '') + '。' +
      '本店产品资料库如下（推荐时仅从其中选择）：\n' + products + '\n' +
      '请基于上述产品库精准推荐，并给出专业、合规的中医养生与店铺运营建议；不提供医疗诊断，涉及病症提醒就医。用简体中文、分点清晰回答。';
    const body = {model: cfg.model || 'deepseek-chat', messages: [
      {role:'system', content: sys},
      {role:'user', content: text}
    ], temperature: 0.7, stream: false};
    try {
      const r = await fetch(cfg.base.replace(/\/$/, '') + '/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + cfg.key},
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if(j.error) return {err: (j.error.message || 'API错误')};
      return {text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '(空回复)'};
    } catch(e){ return {err: ('网络/请求错误：' + (e && e.message ? e.message : e))}; }
  },
  openSettings(){
    const c = this.cfg();
    const curVendor = this.vendorKeyOf(c);
    const opts = Object.keys(AI_VENDORS).map(k =>
      '<option value="' + k + '"' + (curVendor === k ? ' selected' : '') + '>' + esc(AI_VENDORS[k].name) + '</option>').join('');
    openModal('<h3>⚙️ 大模型设置（全店共享）</h3>' +
      '<div class="hint">选择厂商可自动填好地址与默认模型。配置一次即保存到<b>云端</b>，本店所有设备、所有人打开都能直接用，<b>无需每台重新填写</b>。密钥仅用于你的浏览器直连厂商，不经我们服务器。</div>' +
      '<label class="f-label">选择厂商（自动填好地址与默认模型）</label>' +
      '<select id="ai-vendor" onchange="AiMod.applyVendor(this.value)">' + opts + '</select>' +
      '<label class="f-label">API 地址（含 /v1）</label><input autocomplete="off" id="ai-base" value="' + esc(c.base || '') + '">' +
      '<label class="f-label">模型名</label><input autocomplete="off" id="ai-model" value="' + esc(c.model || '') + '">' +
      '<label class="f-label">API Key</label><input autocomplete="off" id="ai-key" type="password" placeholder="sk-..." value="' + esc(c.key || '') + '">' +
      '<div class="hint">提示：豆包/火山方舟的「模型名」需填你的推理接入点 ID（如 doubao-*** 或 ep-xxxx）；智谱可填 glm-4 / glm-4-plus；阿里云可填 qwen-plus / qwen-max。</div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="AiMod.saveSettings()">保存</button></div>');
  },
  saveSettings(){
    const cfg = {
      base: $('#ai-base').value.trim(),
      model: $('#ai-model').value.trim(),
      key: $('#ai-key').value.trim()
    };
    this.saveCfg(cfg);
    closeModal(); toast('已保存大模型设置（已同步到云端，全店通用）');
  },
  // ===== 数据双写备份（果创云 YesApi）设置 =====
  openBackup(){
    const y = (Store.get('settings') || {}).yes || {};
    openModal('<h3>☁️ 数据双写备份（果创云 YesApi）</h3>' +
      '<div class="hint">配置后，每次保存都会<b>同时写入 textdb.online 和你的果创云 YesApi</b>，两家互为备份，数据更稳妥。配置一次即存入云端，全店设备通用。密钥仅用于浏览器直连 YesApi，不经我们服务器。国产服务、国内速度快。</div>' +
      '<label class="f-label">API 接口域名（在「系统设置 → 我的套餐」查看，形如 https://xxxx.api.yesapi.cn）</label><input autocomplete="off" id="yes-domain" value="' + esc(y.domain || '') + '">' +
      '<label class="f-label">App Key（应用 key）</label><input autocomplete="off" id="yes-appkey" type="password" value="' + esc(y.appKey || '') + '">' +
      '<label class="f-label">数据表名（在控制台新建「自由数据表/数据模型」，默认 tcm_shard）</label><input autocomplete="off" id="yes-model" value="' + esc(y.model || 'tcm_shard') + '">' +
      '<div class="hint">步骤：① 去 <a href="https://www.yesapi.cn" target="_blank" rel="noopener">yesapi.cn</a> 免费注册；② 在「系统设置 → 我的套餐」复制你的<b>接口域名</b>和<b>App Key</b>；③ 在控制台新建一个「自由数据表（数据模型）」，名称填 <b>tcm_shard</b>（你已建好即可，无需手动加字段——程序会自动用表的 <b>content</b> 字段存分片名、<b>ext_data</b> 字段存数据、<b>device/t/rev</b> 存设备/时间/版本）；④ 进入「接口签名设置」保持<b>关闭签名</b>即可。保存后会立即试写一次验证连接。</div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="AiMod.saveBackup()">保存</button></div>');
  },
  saveBackup(){
    const yes = {
      domain: $('#yes-domain').value.trim(),
      appKey: $('#yes-appkey').value.trim(),
      model: $('#yes-model').value.trim() || 'tcm_shard'
    };
    const s = Store.get('settings') || {}; s.yes = yes; Store.data['settings'] = s; Store.markDirty('settings');
    if(yes.domain && yes.appKey) Store.yesapiPush('settings'); // 立即试写一次，验证连接
    closeModal(); toast('已保存备份设置（已同步云端，全店通用）');
  },
  // ===== 写汇报总结：按时间段汇总「重要已办事项」=====
  openSummary(){
    const today = todayStr();
    openModal('<h3>📝 写汇报总结（重要已办事项）</h3>' +
      '<div class="hint">选择起始日期（含），结束日期默认今天。将汇总该时间段内「重要待办工作」中已完成的条目，生成汇报草稿，可复制或交给大模型润色。</div>' +
      '<div class="add-row">' +
      '<label style="font-size:13px">起始日期<input autocomplete="off" id="sum-start" type="date" value="' + today + '"></label>' +
      '<label style="font-size: 13px">结束日期<input autocomplete="off" id="sum-end" type="date" value="' + today + '"></label>' +
      '</div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="AiMod.genSummary()">生 成总结</button></div>', 'wide');
  },
  genSummary(){
    const s = $('#sum-start').value, e = $('#sum-end').value || todayStr();
    if(!s){ toast('请选择起始日期', false); return; }
    const from = parseDate(s), to = parseDate(e);
    if(from > to){ toast('起始日期不能晚于结束日期', false); return; }
    const items = (Store.get('todo').items || []).filter(i =>
      i.type === 'daily' && i.done && i.doneDate &&
      parseDate(i.doneDate) >= from && parseDate(i.doneDate) <= to);
    const byDate = {};
    items.forEach(i => { (byDate[i.doneDate] = byDate[i.doneDate] || []).push(i); });
    const dates = Object.keys(byDate).sort();
    let text = '【工作汇报】\n汇报周期：' + s + ' ~ ' + e + '\n整理时间：' + todayStr() + '\n\n';
    if(!dates.length){
      text += '该周期内暂无「重要待办工作」的已完成记录。';
    } else {
      dates.forEach(d => {
        text += '📅 ' + d + ' ' + weekdayCn(d) + '\n';
        byDate[d].forEach(i => { text += '  • ' + i.text + '\n'; });
        text += '\n';
      });
      text += '— 本期共完成 ' + items.length + ' 项重要工作。';
    }
    openModal('<h3>📝 汇报总结（' + s + ' ~ ' + e + '）</h3>' +
      '<pre class="mat" id="sum-out">' + esc(text) + '</pre>' +
      '<div class="modal-btns">' +
      '<button class="btn ghost" onclick="closeModal()">关闭</button>' +
      '<button class="btn ghost" data-copy="' + enc(text) + '" onclick="AiMod.copyThis(this)">复制</button>' +
      '<button class="btn" onclick="AiMod.polishSummary()">🚀 大模型润色</button></div>', 'wide');
  },
  async polishSummary(){
    const out = $('#sum-out'); if(!out) return;
    const text = out.textContent;
    if(!this.cfg().key){ toast('请先在「⚙️ 大模型设置」配置密钥后再润色', false); return; }
    const r = await this.callLLM(r.text);
    if(r.err){ toast('润色失败：' + r.err, false); return; }
    openModal('<h3>✨ 润色后的汇报</h3><pre class="mat">' + esc(r.text) + '</pre>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">关闭</button>' +
      '<button class="btn" data-copy="' + enc(r.text) + '" onclick="AiMod.copyThis(this)">复制</button></div>', 'wide');
  }
};
function enc(s){ return encodeURIComponent(s == null ? '' : String(s)); }
