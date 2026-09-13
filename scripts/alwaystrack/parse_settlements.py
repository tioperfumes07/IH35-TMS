import os,re,json,glob
TXT="/home/claude/st/_st_txt"
def money(s):
    s=s.replace(",","").replace("$","").strip()
    if s in("","-"):return None
    neg=s.startswith("(") and s.endswith(")")
    if neg:s=s[1:-1]
    try:v=float(s)
    except:return None
    return -v if neg else v
def num(s):
    try:return float(s.replace(",",""))
    except:return None
SEC=["CUSTOMER CHARGES","DRIVER PAYMENT","FUEL PURCHASES","EXPENSES","REVENUE"]
def sections(lines):
    idx=[(i,l.strip()) for i,l in enumerate(lines) if l.strip() in SEC]
    out={}
    for k,(i,s) in enumerate(idx):
        j=idx[k+1][0] if k+1<len(idx) else len(lines)
        out.setdefault(s,[]).extend(lines[i+1:j])
    return out
NUMTOK=re.compile(r"^-?[\d,]+\.\d+$")
def parse_company(path):
    raw=open(path,errors="replace").read(); lines=raw.split("\n")
    d={"doc":os.path.basename(path),"kind":"company"}
    m=re.search(r"Company Settlement No\.\s*(\d+)",raw); d["settlement_no"]=m.group(1) if m else None
    m=re.search(r"Start Date:\s*([\d-]+)",raw); d["start_date"]=m.group(1) if m else None
    m=re.search(r"End Date:\s*([\d-]+)",raw); d["end_date"]=m.group(1) if m else None
    m=re.search(r"^\s*(IH35 [A-Za-z]+, LLC|USMCA[^\n]*?)\s{2,}",raw,re.M); d["entity"]=m.group(1).strip() if m else None
    d["loads"]=sorted(set(re.findall(r"^Load (\d+)",raw,re.M)))
    sec=sections(lines)
    # customer charges
    cc=[];cl=cu=None
    for t in sec.get("CUSTOMER CHARGES",[]):
        t=t.rstrip()
        if not t.strip():continue
        m=re.match(r"\s*Load (\d+)\s*/\s*(.+?)\s*$",t)
        if m: cl,cu=m.group(1),m.group(2).strip(); continue
        if "Total Line Haul" in t: continue
        p=re.split(r"\s{2,}",t.strip())
        if len(p)>=2 and money(p[-1]) is not None:
            nums=[x for x in p if NUMTOK.match(x)]
            row={"load":cl,"customer":cu,"item":p[0],"description":p[1] if len(p)>2 else p[0],
                 "miles":None,"rate":None,"amount":money(p[-1])}
            if len(nums)>=4:
                row["miles"]=num(nums[-4]); row["rate"]=num(nums[-3])
            cc.append(row)
    d["customer_charges"]=cc
    # driver payment
    dp=[];cl=cd=None;dt=None
    for t in sec.get("DRIVER PAYMENT",[]):
        t=t.rstrip()
        if not t.strip():continue
        m=re.match(r"\s*Load (\d+)\s*/\s*(.+?)\s*$",t)
        if m: cl,cd=m.group(1),m.group(2).strip(); continue
        m=re.search(r"Totals:\s*([\d,\.\-\(\)\$]+)\s*$",t)
        if m: dt=money(m.group(1)); continue
        p=re.split(r"\s{2,}",t.strip())
        if len(p)>=2 and money(p[-1]) is not None and cl:
            dp.append({"load":cl,"driver":cd,"item":p[0],"detail":p[1] if len(p)>2 else "","amount":money(p[-1])})
    d["driver_payment"]=dp; d["driver_payment_total"]=dt
    # fuel
    fu=[];cl=None;ft=None
    for t in sec.get("FUEL PURCHASES",[]):
        s=t.strip()
        if not s:continue
        m=re.match(r"Load (\d+)\s*/\s*(.+)$",s)
        if m: cl=m.group(1); continue
        p=re.split(r"\s{2,}",s)
        nums=[]
        for seg in p:
            for tok in seg.split():
                if NUMTOK.match(tok): nums.append(tok)
        if s.startswith("Totals:") and len(nums)>=7:
            g,c,r,f,dc,dpg,a=nums[-7:]
            ft={"gallons":num(g),"cpg":num(c),"receipt":money(r),"fees":money(f),"disc":money(dc),"discpg":num(dpg),"actual":money(a)}
            continue
        if re.match(r"^\d{4}-\d{2}-\d{2}",s) and len(nums)>=7:
            g,c,r,f,dc,dpg,a=nums[-7:]
            head=p[0].split(None,1)
            inv=None
            for seg in p[1:]:
                if re.match(r"^\d{4,}$",seg.strip()): inv=seg.strip()
            fu.append({"load":cl,"date":head[0],"vendor":head[1] if len(head)>1 else "",
                       "location":p[1] if len(p)>1 else "","invoice":inv,
                       "gallons":num(g),"cpg":num(c),"receipt":money(r),"fees":money(f),
                       "disc":money(dc),"discpg":num(dpg),"actual":money(a)})
    d["fuel_purchases"]=fu; d["fuel_totals"]=ft
    # expenses w/ column positions
    hdr=None
    for l in lines:
        if "Reimb." in l and "Amount" in l: hdr=l; break
    pR=hdr.index("Reimb.") if hdr else None
    pC=hdr.index("Comp.") if hdr and "Comp." in hdr else None
    ex=[];et=None
    for t in sec.get("EXPENSES",[]):
        s=t.strip()
        if not s: continue
        m=re.match(r"Totals:\s+([\d,\.\-\(\)\$]+)\s*$",s)
        if m: et=money(m.group(1)); continue
        if not re.match(r"^\d{4}-\d{2}-\d{2}",s): continue
        p=re.split(r"\s{2,}",s)
        amt=money(p[-1])
        if amt is None: continue
        reimb=comp=""
        for mm in re.finditer(r"\b([YN])\b",t):
            pos=mm.start()
            if pR is not None and abs(pos-pR)<=6: reimb=mm.group(1)
            elif pC is not None and abs(pos-pC)<=14: comp=mm.group(1)
        body=[x for x in p if not re.fullmatch(r"[YN]",x.strip())]
        head=body[0].split(None,1)
        ex.append({"date":head[0],"vendor":head[1] if len(head)>1 else (body[1] if len(body)>1 else ""),
                   "description":body[-2] if len(body)>=3 else "","invoice":"",
                   "reimb":reimb,"comp":comp,"amount":amt,"raw":s})
    d["expenses"]=ex; d["expenses_total"]=et
    rev={}
    for k,pat in [("invoiced",r"Invoiced\s+([\d,\.\-\(\)\$]+)"),
                  ("driver_salary",r"Driver Salary\s+\S+\s+\S+ p/m\s+([\d,\.\-\(\)\$]+)"),
                  ("fuel",r"\bFuel\s+\S+\s+\S+ p/m\s+([\d,\.\-\(\)\$]+)"),
                  ("company_expenses",r"Company Expenses\s+\S+\s+\S+ p/m\s+([\d,\.\-\(\)\$]+)"),
                  ("net_revenue",r"Net Revenue\s+\S+\s+\S+ p/m\s+([\d,\.\-\(\)\$]+)")]:
        m=re.search(pat,raw); rev[k]=money(m.group(1)) if m else None
    m=re.search(r"Miles \(([\d,\.]+)mi\.\)",raw); rev["miles"]=num(m.group(1)) if m else None
    m=re.search(r"M\.P\.G\.\s+([\d\.]+)",raw); rev["mpg"]=num(m.group(1)) if m else None
    d["revenue"]=rev
    return d
def parse_driver(path):
    raw=open(path,errors="replace").read()
    d={"doc":os.path.basename(path),"kind":"driver"}
    m=re.search(r"Driver Settlement No\.\s*(\d+)",raw); d["settlement_no"]=m.group(1) if m else None
    m=re.search(r"Start Date:\s*([\d-]+)",raw); d["start_date"]=m.group(1) if m else None
    m=re.search(r"End Date:\s*([\d-]+)",raw); d["end_date"]=m.group(1) if m else None
    m=re.search(r"^\s*(IH35 [A-Za-z]+, LLC|USMCA[^\n]*?)\s{2,}(.+?)\s*$",raw,re.M)
    d["entity"]=m.group(1).strip() if m else None; d["driver"]=m.group(2).strip() if m else None
    d["loads"]=sorted(set(re.findall(r"^Load (\d+)",raw,re.M)))
    for k,pat in [("total_loaded_miles",r"Total Loaded Miles\s+([\d,\.]+)"),
                  ("total_empty_miles",r"Total Empty Miles\s+([\d,\.]+)"),
                  ("total_miles",r"Total Miles\s+([\d,\.]+)")]:
        m=re.search(pat,raw); d[k]=num(m.group(1)) if m else None
    for k,pat in [("salary",r"Salary:\s+([\d,\.\-\(\)\$]+)"),
                  ("deductions_total",r"Deductions:\s+([\d,\.\-\(\)\$]+)"),
                  ("reimbursements_total",r"Reimbursements?:\s+([\d,\.\-\(\)\$]+)"),
                  ("total_due",r"TOTAL DUE:\s*([\d,\.\-\(\)\$]+)")]:
        m=re.search(pat,raw); d[k]=money(m.group(1)) if m else None
    pay=[];ded=[];cl=None
    for ln in raw.split("\n"):
        s=ln.strip()
        if not s: continue
        m=re.match(r"^Load (\d+)\s+Truck\s+(\S+)\s*/\s*Trailer\s+(\S+)",s)
        if m: cl=m.group(1); continue
        m=re.match(r"^Load\s+(\d+)\s{2,}(\d{4}-\d{2}-\d{2})\s*-\s*(.+?)\s{2,}([\d,\.\-\(\)\$]+)$",s)
        if m: ded.append({"load":m.group(1),"date":m.group(2),"description":m.group(3).strip(),"amount":money(m.group(4))}); continue
        m=re.match(r"^(Loaded Miles|Empty Miles|Deadhead Miles)\s+([\d,\.]+)\s*@\s*\$([\d\.]+)\s+([\d,\.\-\(\)\$]+)$",s)
        if m and cl: pay.append({"load":cl,"item":m.group(1),"miles":num(m.group(2)),"rate":num(m.group(3)),"amount":money(m.group(4))}); continue
        m=re.match(r"^(\d+)\s+(Picks|Drops|Stops)\s+\$([\d\.]+)\s+After\s+(\d+)\s+([\d,\.\-\(\)\$]+)$",s)
        if m and cl: pay.append({"load":cl,"item":f"{m.group(1)} {m.group(2)}","miles":None,"rate":num(m.group(3)),"amount":money(m.group(5))})
    d["pay_lines"]=pay; d["deductions"]=ded
    return d
out={"company":[],"driver":[]}
seen=set()
for p in sorted(glob.glob(TXT+"/Company_Settlement_*.txt")):
    r=parse_company(p)
    if r["settlement_no"] in seen: continue
    seen.add(r["settlement_no"]); out["company"].append(r)
seen=set()
for p in sorted(glob.glob(TXT+"/Driver_Settlement_*.txt")):
    r=parse_driver(p)
    if r["settlement_no"] in seen: continue
    seen.add(r["settlement_no"]); out["driver"].append(r)
json.dump(out,open("/home/claude/st/truth.json","w"),indent=1)
print("company",len(out["company"]),"driver",len(out["driver"]))
