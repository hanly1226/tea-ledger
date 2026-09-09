# -*- coding: utf-8 -*-
import io, csv, json, os, sys, subprocess, datetime

TD = r"C:\Users\Administrator\.workbuddy\plugins\cache\workbuddy-builtin\tencent-docs-plugin\1.0.0\skills\tencent-docs\tencentdocs.py"
CLOUD = r"C:\Users\Administrator\WorkBuddy\2026-08-19-11-15-33\clone\data_export\cloud"
OUT = r"C:\Users\Administrator\WorkBuddy\2026-08-19-11-15-33\clone\data_export\tdoc_manifest.json"

PY = sys.executable

# ---- category defaults (source of truth: js/m_finance.js) ----
INCOME_CATS = ['支付宝','微信','挂号','食堂卡','小程序','美团','淘宝闪购','院内接待','其他']
EXPENSE_CATS = ['进货','房租','工资','水电燃气','设备维修','办公杂费','提成','其他支出']
MONTHLY_TASKS = [
    '绿植浇水、修剪养护',
    '深度洗制冰机、破壁机、茶桶、全套器具并消毒沥干',
    '设备保养',
    '整理库房',
    '全屋死角消杀',
    '安全隐患排查',
]
STAFF = ['于丹','魏燕征']

def tdoc(service, tool, args=None):
    cmd = [PY, TD, 'tdoc_call', service, tool]
    if args is not None:
        cmd.append(json.dumps(args, ensure_ascii=False))
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    out = (r.stdout or '').strip()
    if not out:
        return {'_raw': '', '_err': r.stderr}
    try:
        outer = json.loads(out)
    except Exception:
        return {'_raw': out, '_err': r.stderr}
    # unwrap JSON-RPC envelope: {result:{content:[{type:'text',text:'<json>'}]}}
    if isinstance(outer, dict):
        if 'result' in outer:
            res = outer['result']
            if isinstance(res, dict) and isinstance(res.get('content'), list):
                texts = [c.get('text', '') for c in res['content']
                         if isinstance(c, dict) and c.get('type') == 'text']
                joined = ''.join(texts)
                try:
                    return json.loads(joined)
                except Exception:
                    return {'_raw': joined, '_err': ''}
            return res
        if 'error' in outer:
            return outer
    return outer

def load(shard):
    return json.load(open(os.path.join(CLOUD, shard + '.json'), encoding='utf-8'))['data']

def ensure_token():
    """若环境未注入 TDOC_OAUTH_ACCESS_TOKEN，则通过宿主 connector-proxy 凭证提供者获取并写入
    当前进程环境，使子进程 tencentdocs.py 复用（避免 ERROR:no_token）。
    原因：插件 1.0.0/1.0.3 的 _load_tokens 仅转发 Authorization，未携带 X-WorkBuddy-MCP-Context，
    而代理要求该头，否则 401 invalid_mcp_context -> 退化为 no_token。此处在脚本层补齐。"""
    if os.environ.get('TDOC_OAUTH_ACCESS_TOKEN') or os.environ.get('TDOC_ONEID_ACCESS_TOKEN'):
        return
    raw = os.environ.get('CODEBUDDY_MCP_CONFIG')
    if not raw:
        return
    try:
        import urllib.request
        cfg = json.loads(raw)
        srv = (cfg.get('mcpServers') or {}).get('connector-proxy') or {}
        gurl = srv.get('url', '')
        hdrs = srv.get('headers') or {}
        auth = hdrs.get('Authorization', '')
        ctx = hdrs.get('X-WorkBuddy-MCP-Context', '')
        if not (gurl.endswith('/mcp') and auth):
            return
        token_url = gurl + '/internal/tencent-docs/tokens'
        req = urllib.request.Request(token_url,
                                     headers={'Authorization': auth, 'X-WorkBuddy-MCP-Context': ctx},
                                     method='GET')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        personal = data.get('personal') or {}
        if personal.get('available') and personal.get('token'):
            os.environ['TDOC_OAUTH_ACCESS_TOKEN'] = str(personal['token'])
            print('  * 已从 connector-proxy 获取腾讯文档凭证并注入环境')
        else:
            print('  ! connector-proxy 未返回可用凭证:', json.dumps(data, ensure_ascii=False)[:200])
    except Exception as e:
        print('  ! 获取腾讯文档凭证失败:', str(e)[:200])

def fetch_cloud():
    """拉取 textdb.online 最新云端数据到本地 cloud 目录（自动同步源）"""
    import urllib.request
    NS = 'tcmgy_ws_v1_'
    shards = ['todo','work','wellness','products','ledger','schedule','settings','memo','finance']
    os.makedirs(CLOUD, exist_ok=True)
    summary = []
    for s in shards:
        try:
            url = 'https://textdb.online/' + NS + s
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')
            with open(os.path.join(CLOUD, s + '.json'), 'w', encoding='utf-8') as f:
                f.write(data)
            summary.append(s + '✓')
        except Exception as e:
            summary.append(s + '✗(' + str(e)[:40] + ')')
    print('云端拉取:', ', '.join(summary))

def fmt_time(ms):
    if not ms:
        return ''
    try:
        return datetime.datetime.fromtimestamp(ms/1000).strftime('%Y-%m-%d %H:%M')
    except Exception:
        return str(ms)

def to_csv(rows):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\n')
    for r in rows:
        w.writerow(['' if v is None else v for v in r])
    return buf.getvalue()

def items_str(items):
    if not items:
        return ''
    parts = []
    for it in items:
        p = it.get('product','') or it.get('name','')
        q = it.get('qty','')
        a = it.get('amount','')
        parts.append(f"{p}×{q}({a}元)")
    return '；'.join(parts)

# ===== 运营台账：账本键 -> 腾讯文档子表名（子表名与已建文档保持一致，勿随意改）=====
LEDGER_BOOKS = [
    ('linfang',    '临方',  '临方中心产品入库登记'),
    ('sales',      '销售',  '中药茶饮销售登记'),
    ('reception',  '接待',  '院内接待推广产品登记'),
    ('bracelet',   '手串',  '合香产品销售登记'),
    ('group',      '团购',  '单位订购产品登记'),
    ('commission', '提成',  '委托加工产品入库登记'),
    ('mooncake',   '月饼',  '月饼订购登记'),
]

# 全字段表头映射（按此顺序输出，仅输出该账本中确实出现过值的字段，避免空列）
LEDGER_FIELDS = [
    ('date','日期'), ('otype','订单类型'), ('unit','单位/渠道'), ('contact','联系人'),
    ('salesman','推销员'), ('processor','加工方'),
    ('product','商品'), ('qty','数量'), ('items','商品明细'),
    ('amount','金额(元)'), ('total','合计(元)'),
    ('deposit','定金(元)'), ('balance','余款(元)'), ('payStatus','付款状态'), ('settle','结账方式'),
    ('pay','收款方式'), ('pays','收款方式(多选)'),
    ('inv','发票'), ('invTitle','发票信息'),
    ('delivery','配送方式'), ('deliveryDate','配送日期'), ('deliveryStatus','配送状态'),
    ('special','特殊要求'), ('flags','标记'), ('note','备注'),
]

FLAG_LABELS = {'invoice': '已开票', 'sent': '已送达', 'paid': '已付款'}

def has_val(v):
    if v is None or v == '' or v == [] or v == {}:
        return False
    return True

def cell(key, v):
    """把任意字段值格式化成表格单元格文本"""
    if v is None:
        return ''
    if key == 'items':
        return items_str(v)
    if isinstance(v, list):
        return '、'.join(str(x) for x in v if x not in (None, ''))
    if isinstance(v, dict):
        on = [FLAG_LABELS.get(k, k) for k, val in v.items() if val]
        return '、'.join(on)
    if isinstance(v, bool):
        return '是' if v else '否'
    return v

def book_amount(rec):
    """单据金额：优先 total，其次 amount"""
    for k in ('total', 'amount'):
        if rec.get(k) not in (None, ''):
            try:
                return float(rec.get(k) or 0)
            except Exception:
                return 0.0
    return 0.0

def build_ledger_file(ledger):
    """运营台账：自动覆盖全部账本（含云端新增账本）+ 全字段 + 商品明细拆行 + 汇总"""
    f = {'title': '中医养生茶饮-运营台账', 'tabs': []}
    books = list(LEDGER_BOOKS)
    known = {b[0] for b in books}
    # 自动发现云端新增账本（未登记的键也一并同步，保证「所有台账」不漏）
    for k, v in (ledger or {}).items():
        if k not in known and isinstance(v, list) and v:
            books.append((k, k, k))
            print('  * 发现未登记账本，已自动纳入同步:', k)

    detail_rows = [['台账', '日期', '单位/联系人', '商品', '单价(元)', '数量', '金额(元)', '记录ID']]
    sum_rows = [['台账', '登记名称', '单据数', '金额合计(元)', '最早日期', '最近日期']]

    for key, tab, title in books:
        recs = [r for r in (ledger.get(key) or []) if isinstance(r, dict) and not r.get('del')]
        recs.sort(key=lambda r: (r.get('date') or '', r.get('t') or 0))
        used = [(fk, lb) for fk, lb in LEDGER_FIELDS
                if any(has_val(r.get(fk)) for r in recs)]
        if not used:  # 空账本也建表头，方便后续自动填充
            used = [('date', '日期'), ('items', '商品明细'), ('total', '合计(元)'), ('note', '备注')]
        rows = [[lb for _, lb in used] + ['记录ID', '登记时间']]
        for r in recs:
            rows.append([cell(fk, r.get(fk)) for fk, _ in used] +
                        [r.get('id', ''), fmt_time(r.get('t'))])
        f['tabs'].append({'name': tab, 'rows': rows})

        # 汇总
        dates = [r.get('date') for r in recs if r.get('date')]
        total = round(sum(book_amount(r) for r in recs), 2)
        sum_rows.append([tab, title, len(recs), total,
                         min(dates) if dates else '', max(dates) if dates else ''])

        # 商品明细拆行（每个商品一行，便于透视分析）
        for r in recs:
            who = r.get('unit') or r.get('contact') or r.get('processor') or ''
            its = r.get('items') or []
            if its:
                for it in its:
                    detail_rows.append([tab, r.get('date', ''), who,
                                        it.get('product', '') or it.get('name', ''),
                                        it.get('price', ''), it.get('qty', ''),
                                        it.get('amount', ''), r.get('id', '')])
            elif r.get('product'):
                detail_rows.append([tab, r.get('date', ''), who, r.get('product', ''),
                                    '', r.get('qty', ''), r.get('amount', ''), r.get('id', '')])

    f['tabs'].append({'name': '商品明细', 'rows': detail_rows})
    grand = round(sum(float(x[3] or 0) for x in sum_rows[1:]), 2)
    sum_rows.append(['合计', '全部台账', sum(int(x[2] or 0) for x in sum_rows[1:]), grand, '', ''])
    sum_rows.append([])
    sum_rows.append(['同步时间', datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), '', '', '', ''])
    f['tabs'].append({'name': '台账汇总', 'rows': sum_rows})
    # ===== 未付款账本（自动汇总四本原始登记的未付款订单，不按月区分）=====
    f['tabs'].append(build_unpaid_tab(ledger))
    return f

# 未付款账本：中药茶饮销售(sales)/合香产品销售(bracelet)/单位订购(group)/月饼订购(mooncake)
# 中未付款订单的自动汇总。判定逻辑与前端 LedgerMod.isUnpaid 保持一致。
UNPAID_BOOKS = [
    ('sales', '中药茶饮销售登记'),
    ('bracelet', '合香产品销售登记'),
    ('group', '单位订购产品登记'),
    ('mooncake', '月饼订购登记'),
]

def is_unpaid(book, rec):
    pays = rec.get('pays') or []
    if book in ('sales', 'bracelet', 'group'):
        return '未付款' in pays
    if book == 'mooncake':
        ps = rec.get('payStatus') or ''   # 空视为「未收款」
        return ps != '全款结清'
    return False

def build_unpaid_tab(ledger):
    rows = [['来源账本', '日期', '产品明细', '数量', '金额(元)', '付款状态', '定金(元)', '尾款(元)', '归属', '备注', '记录ID']]
    n = 0
    for key, title in UNPAID_BOOKS:
        recs = [r for r in (ledger.get(key) or []) if isinstance(r, dict) and not r.get('del')]
        for r in recs:
            if not is_unpaid(key, r):
                continue
            pays = r.get('pays') or []
            its = r.get('items') or []
            detail = items_str(its) if its else (r.get('product', '') or '')
            qty = sum(int(it.get('qty') or 0) for it in its) if its else (r.get('qty') or 0)
            amt = round(book_amount(r), 2)
            # 付款状态：月饼用 payStatus；其余用收款方式中的「未付款」
            if key == 'mooncake':
                pay_txt = r.get('payStatus') or '未收款'
            else:
                pay_txt = '、'.join(p for p in pays if p) or '未付款'
            who = r.get('unit') or r.get('contact') or r.get('processor') or ''
            rows.append([title, r.get('date', ''), detail, qty, amt,
                         pay_txt, r.get('deposit', '') or '', r.get('balance', '') or '',
                         who, r.get('note', ''), r.get('id', '')])
            n += 1
    rows.append([])
    rows.append(['合计', '', '', '', round(sum(float(x[4] or 0) for x in rows[1:-1]), 2), '', '', '', '', '', ''])
    rows.append(['同步时间', datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), '', '', '', '', '', '', '', '', ''])
    print('  * 未付款账本：汇总', n, '条未付款订单')
    return {'name': '未付款账本', 'rows': rows}

def get_sheets(file_id):
    res = tdoc('sheet-mcp', 'get_sheet_info', {'file_id': file_id})
    # try common shapes
    sheets = None
    if isinstance(res, dict):
        sheets = res.get('sheets') or res.get('result', {}).get('sheets') or res.get('data')
    if isinstance(sheets, list):
        return sheets
    # maybe wrapped
    if isinstance(res, dict):
        for k, v in res.items():
            if isinstance(v, list) and v and isinstance(v[0], dict) and ('sheet_id' in v[0] or 'id' in v[0]):
                return v
    print('  ! get_sheet_info unexpected:', json.dumps(res, ensure_ascii=False)[:300])
    return []

def find_sheet(sheets, name):
    for s in sheets:
        if s.get('name') == name:
            return s.get('sheet_id') or s.get('id')
    return None

def write_csv(file_id, sheet_id, rows, max_chars=10000):
    """分块写入，规避 Windows 命令行长度上限（WinError 206 文件名或扩展名太长）。
    create_and_fill 已先 clear_range_all 清空整表，此处按连续行区间逐块
    set_range_value_by_csv 覆盖即可，分块不会互相覆盖。
    返回 dict：全部成功 -> {'ok': True}（通过 caller 的 OK 判定）；
    部分失败 -> 含 'error' 键，caller 判定为非 OK 并打印细节。"""
    acc = []
    base = 0
    errs = []
    for i, r in enumerate(rows):
        acc.append(r)
        # 累计 CSV 超过预算，或已是最后一行 -> 冲刷当前块
        if len(to_csv(acc)) >= max_chars or i == len(rows) - 1:
            csv_data = to_csv(acc)
            res = tdoc('sheet-mcp', 'set_range_value_by_csv', {
                'file_id': file_id,
                'sheet_id': sheet_id,
                'start_row': base,
                'start_col': 0,
                'csv_data': csv_data
            })
            good = isinstance(res, dict) and ('error' not in res) \
                and (res.get('_raw', '').find('error') < 0)
            if not good:
                errs.append({'start_row': base, 'res': res})
            base += len(acc)
            acc = []
    if errs:
        return {'error': 'partial_write', 'chunks_failed': len(errs), 'details': errs[:3]}
    return {'ok': True}

def build_tabs():
    fin = load('finance')
    ledger = load('ledger')
    work = load('work')
    sched = load('schedule')
    todo = load('todo')
    memo = load('memo')

    files = []

    # ===== F1 财务账本 =====
    f1 = {'title': '中医养生茶饮-财务账本', 'tabs': []}
    # 收支明细
    rows = [['日期','周期','类型','分类','金额(元)','备注','状态','记录ID','创建时间']]
    for it in fin.get('items', []):
        if it.get('del'):
            continue
        rows.append([it.get('date',''), it.get('period',''), it.get('type',''),
                     it.get('category',''), it.get('amount',''), it.get('note',''),
                     '有效', it.get('id',''), fmt_time(it.get('createdAt'))])
    f1['tabs'].append({'name': '收支明细', 'rows': rows})
    # 收入分类
    rows = [['序号','收入类型']]
    for i, c in enumerate(INCOME_CATS, 1):
        rows.append([i, c])
    f1['tabs'].append({'name': '收入分类', 'rows': rows})
    # 支出分类
    rows = [['序号','支出类型']]
    for i, c in enumerate(EXPENSE_CATS, 1):
        rows.append([i, c])
    f1['tabs'].append({'name': '支出分类', 'rows': rows})
    files.append(f1)

    # ===== F2 运营台账（全部账本 · 全字段 · 自动发现新账本）=====
    files.append(build_ledger_file(ledger))

    # ===== F3 工作进度台账 =====
    f3 = {'title': '中医养生茶饮-工作进度台账', 'tabs': []}
    # 每日打卡统计
    rows = [['日期','早班完成(项)','晚班完成(项)','专项早完成(项)','专项晚完成(项)']]
    logs = work.get('logs', {})
    for date in sorted(logs.keys()):
        lg = logs[date]
        def cnt(d):
            return sum(1 for v in (d or {}).values() if v)
        rows.append([date, cnt(lg.get('early')), cnt(lg.get('late')),
                     cnt(lg.get('spEarly')), cnt(lg.get('spLate'))])
    f3['tabs'].append({'name': '每日打卡统计', 'rows': rows})
    # 固定任务清单
    rows = [['序号','每月固定任务']]
    for i, t in enumerate(MONTHLY_TASKS, 1):
        rows.append([i, t])
    f3['tabs'].append({'name': '固定任务清单', 'rows': rows})
    # 月度负责人轮换
    rows = [['月份','负责人员','执行日','班次归属规则']]
    for ym in ['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02']:
        y, m = ym.split('-')
        y = int(y); m = int(m)
        diff = (y-2026)*12 + ((m-1)-6)
        idx = ((diff % len(STAFF)) + len(STAFF)) % len(STAFF)
        rows.append([ym, STAFF[idx], '月初1/2日 · 月中15/16日',
                     '整套任务只排入负责人当天的那一个班次（早班→早班；晚班→晚班；全天班/白班→早班；休/未排班→暂归早班），不拆分到两个班次'])
    f3['tabs'].append({'name': '月度负责人轮换', 'rows': rows})
    # 提醒事项
    rows = [['提醒内容','状态','创建时间']]
    for it in work.get('reminders', []):
        if it.get('del'):
            continue
        rows.append([it.get('text',''), '已完成' if it.get('done') else '待办', fmt_time(it.get('createdAt'))])
    f3['tabs'].append({'name': '提醒事项', 'rows': rows})
    files.append(f3)

    # ===== F4 排班表 =====
    f4 = {'title': '中医养生茶饮-排班表', 'tabs': []}
    # 员工排班
    rows = [['日期','员工','班次']]
    for key in sorted(sched.get('overrides', {}).keys()):
        date, staff = key.split('|', 1)
        rows.append([date, staff, sched['overrides'][key]])
    f4['tabs'].append({'name': '员工排班', 'rows': rows})
    # 实习排班
    rows = [['日期','实习生','班次']]
    internNames = sched.get('internNames', [])
    for key in sorted(sched.get('intern', {}).keys()):
        idx, date = key.split('|', 1)
        name = internNames[int(idx)] if idx.isdigit() and int(idx) < len(internNames) else ('实习生'+idx)
        rows.append([date, name, sched['intern'][key]])
    f4['tabs'].append({'name': '实习排班', 'rows': rows})
    files.append(f4)

    # ===== F5 事务台账 (待办+备忘) =====
    f5 = {'title': '中医养生茶饮-事务台账', 'tabs': []}
    # 待办事项
    rows = [['类型','日期','内容','完成','完成日期','状态','记录ID']]
    for it in todo.get('items', []):
        if it.get('del'):
            continue
        rows.append([it.get('type',''), it.get('date',''), it.get('text',''),
                     '是' if it.get('done') else '否', it.get('doneDate',''),
                     '已完成' if it.get('done') else '待办', it.get('id','')])
    f5['tabs'].append({'name': '待办事项', 'rows': rows})
    # 备忘录
    rows = [['内容','状态','记录ID']]
    for it in memo.get('items', []):
        if it.get('del'):
            continue
        rows.append([it.get('text',''), '已完成' if it.get('done') else '待办', it.get('id','')])
    f5['tabs'].append({'name': '备忘录', 'rows': rows})
    files.append(f5)

    return files

# 已创建的文档，跳过重复创建（直接复用）
EXISTING = {
    '中医养生茶饮-财务账本': ('fbaCvHKesgkH', 'https://docs.qq.com/sheet/DZmJhQ3ZIS2VzZ2tI'),
    '中医养生茶饮-运营台账': ('fKDCEuFrzvCq', 'https://docs.qq.com/sheet/DZktEQ0V1RnJ6dkNx'),
    '中医养生茶饮-工作进度台账': ('fzHHqZiCZVsu', 'https://docs.qq.com/sheet/DZnpISHFaaUNaVnN1'),
    '中医养生茶饮-排班表': ('ftXAABtxmaKs', 'https://docs.qq.com/sheet/DZnRYQUFCdHhtYUtz'),
    '中医养生茶饮-事务台账': ('fqTJqAOeobKa', 'https://docs.qq.com/sheet/DZnFUSnFBT2VvYkth'),
}

def create_and_fill(f):
    print('\n=== 处理文件:', f['title'], '===')
    reuse = f['title'] in EXISTING
    if reuse:
        file_id, file_url = EXISTING[f['title']]
        print('  复用已创建 file_id =', file_id)
    else:
        res = tdoc('tencent-docs', 'manage.create_file', {'title': f['title'], 'file_type': 'sheet'})
        file_id = None
        file_url = None
        if isinstance(res, dict):
            file_id = res.get('file_id') or res.get('fileId')
            file_url = res.get('url')
        if not file_id:
            print('  ! create_file 失败:', json.dumps(res, ensure_ascii=False)[:300])
            return None, None
        print('  file_id =', file_id)

    if reuse:
        # 子表已存在，直接取 sheet_id 写入；缺失的子表（新增台账）自动补建
        sheets = get_sheets(file_id)
        idmap = {s.get('sheet_name'): s.get('sheet_id') for s in sheets}
        missing = [t['name'] for t in f['tabs'] if t['name'] not in idmap]
        if missing:
            for name in missing:
                tdoc('sheet-mcp', 'add_sheet', {'file_id': file_id, 'name': name, 'append_index': True})
                print('  + 补建子表:', name)
            sheets = get_sheets(file_id)
            idmap = {s.get('sheet_name'): s.get('sheet_id') for s in sheets}
    else:
        sheets = get_sheets(file_id)
        if not sheets:
            return None, None
        sheet0 = sheets[0]
        sid0 = sheet0.get('sheet_id') or sheet0.get('id')
        # rename sheet0 to tab0
        t0 = f['tabs'][0]
        tdoc('sheet-mcp', 'rename_sheet', {'file_id': file_id, 'sheet_id': sid0, 'name': t0['name']})
        # add remaining tabs
        for tab in f['tabs'][1:]:
            tdoc('sheet-mcp', 'add_sheet', {'file_id': file_id, 'name': tab['name'], 'append_index': True})
        # fetch all sheet ids
        sheets = get_sheets(file_id)
        idmap = {s.get('sheet_name'): s.get('sheet_id') for s in sheets}

    # write each tab (clear first for idempotency on re-run)
    for tab in f['tabs']:
        sid = idmap.get(tab['name'])
        if not sid:
            print('  ! 找不到子表', tab['name'])
            continue
        tdoc('sheet-mcp', 'clear_range_all', {'file_id': file_id, 'sheet_id': sid,
                                             'start_row': 0, 'start_col': 0, 'end_row': 5000, 'end_col': 40})
        r = write_csv(file_id, sid, tab['rows'])
        ok = isinstance(r, dict) and ('error' not in r) and (r.get('_raw', '').find('error') < 0)
        print(f"  写入子表「{tab['name']}」行数={len(tab['rows'])-1} -> {'OK' if ok else json.dumps(r, ensure_ascii=False)[:150]}")
    return file_id, file_url

def main():
    ensure_token()   # 注入腾讯文档凭证，避免子进程 no_token
    fetch_cloud()
    files = build_tabs()
    manifest = {'created_at': datetime.datetime.now().isoformat(timespec='seconds'), 'files': []}
    for f in files:
        fid, furl = create_and_fill(f)
        if fid:
            manifest['files'].append({'title': f['title'], 'file_id': fid,
                                      'url': furl or ('https://docs.qq.com/sheet/' + fid),
                                      'tabs': [t['name'] for t in f['tabs']]})
    json.dump(manifest, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('\n=== 完成，清单已写入', OUT, '===')
    for fm in manifest['files']:
        print(fm['title'], '->', fm['url'])

if __name__ == '__main__':
    main()
