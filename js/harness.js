const fs = require('fs');
const vm = require('vm');
function makeEl(){
  return new Proxy({
    _html:'', style:{}, classList:{toggle(){}, add(){}, remove(){}, contains(){return false;}},
    dataset:{}, value:'', addEventListener(){}, appendChild(){}, removeChild(){},
    querySelector(){return makeEl();}, querySelectorAll(){return [];},
    set innerHTML(v){this._html=v;}, get innerHTML(){return this._html;},
    setAttribute(){}, getAttribute(){return null;}, focus(){}, click(){},
    textContent:'', checked:false, files:[]
  }, {get(t,p){ if(p in t) return t[p]; return undefined; }, set(t,p,v){t[p]=v;return true;}});
}
const doc = { getElementById(){return makeEl();}, querySelector(){return null;}, querySelectorAll(){return [];}, createElement(){return makeEl();}, addEventListener(){}, body: makeEl(), documentElement: makeEl(), hidden:false };
const ls = { _m:{}, getItem(k){return this._m[k]||null;}, setItem(k,v){this._m[k]=v;}, removeItem(k){delete this._m[k];} };
const win = { addEventListener(){}, speechSynthesis:null, navigator:{}, setTimeout(){}, setInterval(){}, Notification:{permission:'default', requestPermission(){}}, localStorage: ls, location:{href:'', reload(){}}, document: doc, URL:{createObjectURL(){return '';}, revokeObjectURL(){}}, FileReader: function(){}, Blob: function(){}, XLSX: undefined };
const g = { document: doc, window: win, navigator: win.navigator, localStorage: ls, setTimeout:()=>0, setInterval:()=>0, clearInterval:()=>{}, console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, isNaN, parseInt, parseFloat, URL: win.URL, Blob: win.Blob, FileReader: win.FileReader, XLSX: undefined, Notification: win.Notification, speechSynthesis: null, $: ()=>makeEl(), $$: ()=>[] };
g.window = win; g.globalThis = g;
vm.createContext(g);
const files = ['config.js','data.js','data_terms.js','data_work.js','data_products.js','data_match.js','data_hotspots.js','core.js','m_work.js','m_schedule.js','m_ledger.js','m_todo.js'];
for(const f of files){ try { vm.runInContext(fs.readFileSync(f,'utf8'), g, {filename:f}); } catch(e){ console.log('加载失败 '+f+': '+e.message); } }
function run(name, fn){ try { fn(); console.log('OK  '+name); } catch(e){ console.log('ERR '+name+': '+e.message+'\n'+(e.stack||'').split('\n').slice(1,5).join('\n')); } }
run('Store.init', ()=> g.Store.init({work:{logs:{}}, schedule:{overrides:{}, intern:{}}, ledger:{}}));
run('WorkMod.render', ()=> g.WorkMod.render());
run('SchedMod.render', ()=> g.SchedMod.render());
