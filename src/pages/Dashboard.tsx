import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Upload, Database, Loader2, Download, Shield, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const COGS_PCT = 0.28;

type RawDataRow = any;

type StoreManualAdjustment = {
  rent: number;
  util: number;
  maint: number;
  sga: number;
  payouts: number;
  capex: number;
  deliveryPct: number;
  royaltyPct: number;
};

type AppState = {
  raw: {
    summary: RawDataRow[];
    items: RawDataRow[];
    txns: RawDataRow[];
    sales: RawDataRow[];
  };
  manual: Record<string, StoreManualAdjustment>;
};

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const [state, setState] = useState<AppState>({
    raw: { summary: [], items: [], txns: [], sales: [] },
    manual: {},
  });

  const [stores, setStores] = useState<string[]>([]);
  const [currentStore, setCurrentStore] = useState('ALL');

  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const res = await fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newState: AppState = { raw: { summary: [], items: [], txns: [], sales: [] }, manual: {} };
      const uniqueStores = new Set<string>();

      let maxDateMs = 0;

      data.reports?.forEach((r: any) => {
        const payload = r.data;
        if (payload.summary) newState.raw.summary.push(...payload.summary);
        if (payload.items) newState.raw.items.push(...payload.items);
        if (payload.txns) newState.raw.txns.push(...payload.txns);
        if (payload.sales) newState.raw.sales.push(...payload.sales);

        const dMs = new Date(r.business_date).getTime();
        if (!isNaN(dMs) && dMs > maxDateMs) maxDateMs = dMs;
      });

      [...newState.raw.summary, ...newState.raw.items, ...newState.raw.txns, ...newState.raw.sales].forEach(row => {
        const storeStr = (row['Franchise Store'] || '').toString().trim();
        if (storeStr) {
          uniqueStores.add(storeStr);
          if (!newState.manual[storeStr]) {
            newState.manual[storeStr] = { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0, deliveryPct: 20, royaltyPct: 10 };
          }
        }
      });

      data.adjustments?.forEach((adj: any) => {
        if (uniqueStores.has(adj.store_id)) {
          newState.manual[adj.store_id] = { ...newState.manual[adj.store_id], ...adj.data };
        }
      });

      setState(newState);
      setStores(Array.from(uniqueStores).sort());

      // Set default 7 day date range
      if (maxDateMs > 0) {
        const endDay = new Date(maxDateMs);
        const startDay = new Date(maxDateMs - 6 * 86400000);
        setDateRange({ start: startDay.toISOString().split('T')[0], end: endDay.toISOString().split('T')[0] });
      }

    } catch (e: any) {
      toast({ title: 'Error fetching data', description: e.message, variant: 'destructive' });
    } finally {
      setDataLoading(false);
    }
  };

  const handleManualChange = (key: keyof StoreManualAdjustment, value: number) => {
    const nextManual = { ...state.manual };
    if (currentStore === 'ALL') {
      stores.forEach(s => {
        if (nextManual[s]) nextManual[s] = { ...nextManual[s], [key]: value };
      });
    } else {
      nextManual[currentStore] = { ...nextManual[currentStore], [key]: value };
    }
    setState(prev => ({ ...prev, manual: nextManual }));
    saveAdjustmentsToDB(nextManual);
  };

  const saveAdjustmentsToDB = async (manualData: Record<string, StoreManualAdjustment>) => {
    try {
      const adjustments = Object.keys(manualData).map(store_id => ({ store_id, data: manualData[store_id] }));
      await fetch('/api/data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustments })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setLoading(true);

    let parsed = { summary: [] as any[], items: [] as any[], txns: [] as any[], sales: [] as any[] };

    try {
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        let headerIdx = -1;
        for (let i = 0; i < Math.min(20, rows.length); i++) {
          if (rows[i] && rows[i].includes('Franchise Store')) { headerIdx = i; break; }
        }

        let data: any[] = [];
        if (headerIdx !== -1) {
          const headers = rows[headerIdx];
          for (let i = headerIdx + 1; i < rows.length; i++) {
            if (!rows[i] || !rows[i].length) continue;
            let rowObj: any = {};
            headers.forEach((header: string, index: number) => {
              if (header) {
                let val = rows[i][index];
                if ((header === 'Business Date' || header === 'Date') && val instanceof Date) {
                  val = val.toISOString().split('T')[0];
                } else if (header === 'Business Date' || header === 'Date') {
                  try { val = new Date(val).toISOString().split('T')[0]; } catch { }
                }
                rowObj[header] = val;
              }
            });
            if (rowObj['Franchise Store']) data.push(rowObj);
          }
        }

        const name = file.name.toLowerCase();
        if (name.includes('items')) parsed.items = data;
        else if (name.includes('transactions')) parsed.txns = data;
        else if (name.includes('sales')) parsed.sales = data;
        else parsed.summary = data;
      }

      const dailyMap: Record<string, any> = {};
      const registerDay = (row: any, type: string) => {
        const d = row['Business Date'] || row['Date'];
        if (!d) return;
        if (!dailyMap[d]) dailyMap[d] = { business_date: d, data: { summary: [], items: [], txns: [], sales: [] } };
        dailyMap[d].data[type].push(row);
      };

      parsed.summary.forEach(r => registerDay(r, 'summary'));
      parsed.items.forEach(r => registerDay(r, 'items'));
      parsed.txns.forEach(r => registerDay(r, 'txns'));
      parsed.sales.forEach(r => registerDay(r, 'sales'));

      const reportsToUpload = Object.values(dailyMap);

      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: reportsToUpload })
      });
      if (!res.ok) throw new Error((await res.json()).error);

      toast({ title: 'Upload Successful', description: 'Data processed and saved to database' });
      await fetchData();

    } catch (err: any) {
      toast({ title: 'Error processing files', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const filteredData = useMemo(() => {
    const fStore = (row: any) => currentStore === 'ALL' || (row['Franchise Store'] || '').toString().trim() === currentStore;
    const fDate = (row: any) => {
      if (!dateRange.start || !dateRange.end) return true;
      const bd = (row['Business Date'] || row['Date'] || '').toString();
      return bd >= dateRange.start && bd <= dateRange.end;
    };
    const f = (row: any) => fStore(row) && fDate(row);

    return {
      summary: state.raw.summary.filter(f),
      items: state.raw.items.filter(f),
      txns: state.raw.txns.filter(f),
      sales: state.raw.sales.filter(f)
    };
  }, [state, currentStore, dateRange]);

  const stats = useMemo(() => {
    let tGross = 0, tTax = 0, tTxns = 0, tVar = 0, v3p = 0, rOblig = 0;

    filteredData.summary.forEach(r => {
      tGross += Number(r['Gross Sales']) || 0;
      tTax += Number(r['Sales Tax']) || 0;
      tTxns += Number(r['Customer Count']) || 0;
      tVar += Number(r['Over Short']) || 0;
      rOblig += Number(r['Royalty Obligation']) || 0;
    });

    filteredData.txns.forEach(r => {
      const m = String(r['Payment Method'] || '').toUpperCase();
      if (m.includes('DOORDASH') || m.includes('UBEREATS') || m.includes('GRUBHUB')) {
        v3p += Number(r['Total Amount']) || 0;
      }
    });

    const tNet = tGross - tTax;
    const cogs = tNet * COGS_PCT;

    let mDel = 0, mRoy = 0, mRent = 0, mUtil = 0, mMaint = 0, mSga = 0, mPayouts = 0, mCapex = 0;

    stores.forEach(s => {
      if (currentStore === 'ALL' || s === currentStore) {
        const man = state.manual[s] || { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0, deliveryPct: 20, royaltyPct: 10 };
        let storeV3p = 0; let storeOblig = 0;

        filteredData.txns.filter(r => (r['Franchise Store'] || '').toString().trim() === s).forEach(r => {
          const m = String(r['Payment Method'] || '').toUpperCase();
          if (m.includes('DOORDASH') || m.includes('UBEREATS') || m.includes('GRUBHUB')) storeV3p += Number(r['Total Amount']) || 0;
        });
        filteredData.summary.filter(r => (r['Franchise Store'] || '').toString().trim() === s).forEach(r => {
          storeOblig += Number(r['Royalty Obligation']) || 0;
        });

        mRent += man.rent || 0;
        mUtil += man.util || 0;
        mMaint += man.maint || 0;
        mSga += man.sga || 0;
        mPayouts += man.payouts || 0;
        mCapex += man.capex || 0;
        mDel += (storeV3p * ((man.deliveryPct || 20) / 100));
        mRoy += (storeOblig * ((man.royaltyPct || 10) / 100));
      }
    });

    const opProfit = tNet - cogs - mDel - mRoy - mRent - mUtil - mMaint - mSga - mPayouts - mCapex;

    let carryout = 0, delivery = 0;
    filteredData.sales.forEach(r => {
      const subArea = String(r['Sub-Area'] || '').toLowerCase();
      const amt = Number(r['Amount']) || 0;
      if (subArea.includes('carryout')) carryout += amt;
      else if (subArea.includes('delivery')) delivery += amt;
    });

    const payMap: Record<string, number> = {};
    filteredData.txns.forEach(r => {
      let m = String(r['Payment Method'] || '').toUpperCase();
      if (!m) return;
      if (m.includes('CREDIT') || m.includes('DEBIT') || m.includes('EPAY')) m = 'CARD / EPAY';
      if (m.includes('DOORDASH') || m.includes('UBEREATS') || m.includes('GRUBHUB')) m = '3RD PARTY APP';
      payMap[m] = (payMap[m] || 0) + (Number(r['Total Amount']) || 0);
    });

    // Generate store mix
    const storeMix = stores.map(s => {
      let gross = 0, tax = 0, sOblig = 0;
      filteredData.summary.filter(r => (r['Franchise Store'] || '').toString().trim() === s).forEach(r => {
        gross += Number(r['Gross Sales']) || 0;
        tax += Number(r['Sales Tax']) || 0;
        sOblig += Number(r['Royalty Obligation']) || 0;
      });
      let sV3p = 0;
      filteredData.txns.filter(r => (r['Franchise Store'] || '').toString().trim() === s).forEach(r => {
        const m = String(r['Payment Method'] || '').toUpperCase();
        if (m.includes('DOORDASH') || m.includes('UBEREATS') || m.includes('GRUBHUB')) sV3p += Number(r['Total Amount']) || 0;
      });

      const man = state.manual[s] || { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0, deliveryPct: 20, royaltyPct: 10 };
      const net = gross - tax;
      const cogsVal = net * COGS_PCT;
      const sDelFee = sV3p * ((man.deliveryPct || 20) / 100);
      const sRoyaltyFee = sOblig * ((man.royaltyPct || 10) / 100);
      const rentUtil = (man.rent || 0) + (man.util || 0);
      const otherExp = (man.maint || 0) + (man.sga || 0) + (man.payouts || 0) + (man.capex || 0);
      const op = net - cogsVal - sDelFee - sRoyaltyFee - rentUtil - otherExp;
      return { s, net, cogs: cogsVal, delFee: sDelFee, royaltyFee: sRoyaltyFee, rentUtil, otherExp, op, marg: net > 0 ? ((op / net) * 100).toFixed(1) : "0.0" };
    }).sort((a, b) => b.op - a.op);

    // Product Mix
    const pMix: Record<string, { qty: number, rev: number }> = {};
    filteredData.items.forEach(r => {
      const item = r['Menu Item Name']; if (!item || item.includes('Fee')) return;
      if (!pMix[item]) pMix[item] = { qty: 0, rev: 0 };
      pMix[item].qty += Number(r['Item Quantity']) || 0;
      pMix[item].rev += (Number(r['Taxable Amount']) || 0) + (Number(r['Non Taxable Amount']) || 0) || Number(r['Royalty Obligation']) || 0;
    });
    const topProducts = Object.entries(pMix).sort((a, b) => b[1].rev - a[1].rev).slice(0, 100).map(([item, d]) => ({ item, ...d }));

    // Variance
    const dailyVar: { date: string, store: string, val: number }[] = [];
    filteredData.summary.forEach(r => {
      const v = Number(r['Over Short']) || 0;
      if (v !== 0) dailyVar.push({ date: r['Business Date'] || r['Date'], store: (r['Franchise Store'] || '').toString().split('-').pop() || '', val: v });
    });
    dailyVar.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Export Map
    const exportMap: Record<string, { netSales: number, custCount: number }> = {};
    let weekEndMs = 0;
    filteredData.summary.forEach(r => {
      const storeNum = (r['Franchise Store'] || '').toString().trim().split('-').pop();
      if (!storeNum) return;
      const dateMs = new Date(r['Business Date'] || r['Date']).getTime();
      if (dateMs > weekEndMs) weekEndMs = dateMs;

      if (!exportMap[storeNum]) exportMap[storeNum] = { netSales: 0, custCount: 0 };
      exportMap[storeNum].netSales += (Number(r['Gross Sales']) || 0) - (Number(r['Sales Tax']) || 0);
      exportMap[storeNum].custCount += Number(r['Customer Count']) || 0;
    });
    const weekEndDateStr = weekEndMs > 0 ? new Date(weekEndMs).toISOString().split('T')[0] : '';
    const exportRows = Object.keys(exportMap).sort().map(s => ({ s, weekEndDateStr, ...exportMap[s] }));

    return {
      tGross, tTax, tNet, cogs, tTxns, tVar, v3p, rOblig,
      mDel, mRoy, mRent, mUtil, mMaint, mSga, mPayouts, mCapex, opProfit,
      margin: tNet > 0 ? (opProfit / tNet) * 100 : 0,
      carryout, delivery,
      payMap, storeMix, topProducts, dailyVar, exportRows
    };
  }, [filteredData, state.manual, currentStore, stores]);

  const activeManual = state.manual[currentStore === 'ALL' ? (stores[0] || 'ALL') : currentStore] || { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0, deliveryPct: 20, royaltyPct: 10 };
  const formatCur = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);

  const handleExportCSV = () => {
    let csv = "Franchise Number,store number,Week End Date,Weekly Sales Amount,Customer Count\n";
    stats.exportRows.forEach(r => {
      csv += `3659,${r.s},${r.weekEndDateStr},${r.netSales.toFixed(2)},${Math.round(r.custCount)}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Weekly_Sales_Export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen p-6 bg-background text-foreground font-sans">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* Header Section */}
        <header className="bg-card border border-border p-6 rounded-2xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shadow-lg shadow-black/20">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">Operations & P&L Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Aggregating raw LCE Gateway exports with period-based manual adjustments.</p>
          </div>

          <div className="flex flex-wrap gap-3 w-full xl:w-auto flex-col sm:flex-row items-center">
            {user?.is_admin && (
              <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors mr-2 whitespace-nowrap">
                <Shield className="w-4 h-4" /> Admin Panel
              </button>
            )}
            <button onClick={logout} className="text-muted-foreground hover:text-foreground text-sm mr-2 transition-colors whitespace-nowrap">Sign out ({user?.email})</button>

            {/* Date Filters */}
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1.5 focus-within:border-blue-500 min-w-[300px]">
              <CalendarIcon className="w-4 h-4 text-muted-foreground ml-1" />
              <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-transparent text-sm text-foreground focus:outline-none w-full cursor-pointer" />
              <span className="text-muted-foreground">-</span>
              <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-transparent text-sm text-foreground focus:outline-none w-full cursor-pointer" />
            </div>

            {user?.is_admin && (
              <label className="cursor-pointer bg-primary/10 hover:bg-primary/20 text-primary transition-colors px-4 py-2 rounded-lg border border-primary/20 flex items-center gap-2 text-sm font-medium whitespace-nowrap">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loading ? 'Processing...' : 'Upload 4 Excel Files'}
                <input type="file" multiple accept=".xlsx,.csv" className="hidden" onChange={handleFileUpload} />
              </label>
            )}
            <select
              value={currentStore}
              onChange={e => setCurrentStore(e.target.value)}
              className="bg-secondary border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Stores (Aggregate)</option>
              {stores.map(s => <option key={s} value={s}>Store {s.split('-').pop()}</option>)}
            </select>
          </div>
        </header>

        {dataLoading && state.raw.summary.length === 0 ? (
          <div className="bg-card border border-border p-12 rounded-2xl text-center flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading historical data from database...</p>
          </div>
        ) : state.raw.summary.length === 0 ? (
          <div className="bg-card border border-border border-dashed p-12 rounded-2xl text-center">
            <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {user?.is_admin 
                ? 'Database is empty. Upload Summary, Items, Transactions, and Sales XLSX files.'
                : 'Database is empty. Please contact an administrator to upload data.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'Gross Sales', val: formatCur(stats.tGross) },
                { label: 'Net Sales', val: formatCur(stats.tNet) },
                { label: 'Operating Profit', val: formatCur(stats.opProfit), textStyle: stats.opProfit >= 0 ? 'text-green-800' : 'text-rose-400', bdr: 'border-t-2 border-primary' },
                { label: 'Total Transactions', val: stats.tTxns.toLocaleString() },
                { label: 'Over/Short', val: formatCur(stats.tVar), textStyle: stats.tVar < 0 ? 'text-rose-400' : 'text-foreground' }
              ].map((k, i) => (
                <div key={i} className={`bg-card border border-border p-5 rounded-2xl shadow-lg ${k.bdr || ''}`}>
                  <p className="text-sm text-muted-foreground font-medium">{k.label}</p>
                  <h2 className={`text-2xl font-bold mt-1 ${k.textStyle || 'text-foreground'}`}>{k.val}</h2>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

              {/* P&L Reconstruction */}
              <div className="bg-card border border-border p-5 rounded-2xl flex flex-col shadow-lg">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">P&L Summary</h3>
                <div className="space-y-2 text-sm flex-1">
                  <div className="flex justify-between text-foreground"><span>Gross Sales</span><span>{formatCur(stats.tGross)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Sales Tax</span><span className="text-rose-400">-{formatCur(stats.tTax)}</span></div>
                  <div className="flex justify-between font-bold text-foreground border-b border-border pb-2"><span>Net Sales</span><span>{formatCur(stats.tNet)}</span></div>

                  {[
                    { l: 'COGS (Est. 28%)', v: stats.cogs },
                    { l: '3rd Party Delivery Fees', v: stats.mDel },
                    { l: 'Franchise & Ad Fees', v: stats.mRoy },
                    { l: 'Rent', v: stats.mRent },
                    { l: 'Utilities', v: stats.mUtil },
                    { l: 'Maintenance', v: stats.mMaint },
                    { l: 'Admin / SG&A', v: stats.mSga },
                    { l: 'Cash Payouts', v: stats.mPayouts },
                    { l: 'Capex', v: stats.mCapex, br: true },
                  ].map((row, i) => (
                    <div key={i} className={`flex justify-between text-muted-foreground ${row.br ? 'border-b border-border pb-2' : ''}`}>
                      <span>{row.l}</span><span className="text-rose-400">-{formatCur(row.v)}</span>
                    </div>
                  ))}

                  <div className="flex justify-between font-bold pt-1 text-base">
                    <span>Operating Profit</span><span className={stats.opProfit >= 0 ? "text-green-800" : "text-rose-400"}>{formatCur(stats.opProfit)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-xs mt-1"><span>OP Margin</span><span>{stats.margin.toFixed(1)}%</span></div>
                </div>
              </div>

              {/* Manual Edits */}
              <div className="bg-card border border-border p-5 rounded-2xl flex flex-col shadow-lg xl:col-span-1">
                <div className="flex flex-col gap-1 mb-4">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Manual Adj.</h3>
                  <p className="text-xs text-primary italic">
                    {currentStore === 'ALL' ? 'Apply baseline to ALL stores' : `Adjusting Store ${currentStore.split('-').pop()}`}
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    { l: 'Delivery Comm. (%)', k: 'deliveryPct', w: 20, p: 20 },
                    { l: 'Franchise/Ad Fee (%)', k: 'royaltyPct', w: 20, p: 10 },
                    { sep: true },
                    { l: 'Rent ($)', k: 'rent', w: 24, p: 1000 },
                    { l: 'Utilities ($)', k: 'util', w: 24, p: 300 },
                    { l: 'Maintenance ($)', k: 'maint', w: 24, p: 75 },
                    { l: 'Admin/SG&A ($)', k: 'sga', w: 24, p: 125 },
                    { l: 'Cash Payouts ($)', k: 'payouts', w: 24, p: 0 },
                    { l: 'Capex ($)', k: 'capex', w: 24, p: 0 },
                  ].map((f: any, i) => f.sep ? <hr key={i} className="border-border" /> : (
                    <div key={i} className="flex justify-between items-center">
                      <label className="text-sm text-muted-foreground">{f.l}</label>
                      <input
                        type="number"
                        value={currentStore === 'ALL' ? '' : (activeManual[f.k as keyof StoreManualAdjustment] || '')}
                        onChange={e => handleManualChange(f.k as keyof StoreManualAdjustment, parseFloat(e.target.value) || 0)}
                        placeholder={(f.p).toString()}
                        className={`bg-background border border-border rounded px-2 py-1 w-${f.w} text-right text-foreground text-sm focus:outline-none focus:border-primary`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Charts Space */}
              <div className="bg-card border border-border p-5 rounded-2xl flex flex-col xl:col-span-2 shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                  <div className="flex flex-col">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Channel Breakdown</h3>
                    <div className="flex-1 min-h-[250px] flex items-center justify-center border border-dashed border-border rounded-xl relative p-4">
                      {(stats.carryout > 0 || stats.delivery > 0) ? (
                        <Doughnut
                          data={{
                            labels: ['Carryout', 'Delivery'],
                            datasets: [{ data: [stats.carryout, stats.delivery], backgroundColor: ['#3b82f6', '#8b5cf6'], borderWidth: 0 }]
                          }}
                          options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#cbd5e1' } } } }}
                        />
                      ) : (
                        <p className="text-muted-foreground text-sm italic">No channel data in this range</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Payment Reliance</h3>
                    <div className="flex-1 min-h-[250px] flex items-center justify-center border border-dashed border-border rounded-xl relative p-4">
                      {Object.keys(stats.payMap).length > 0 ? (
                        <Bar
                          data={{
                            labels: Object.keys(stats.payMap),
                            datasets: [{ data: Object.values(stats.payMap), backgroundColor: '#10b981' }]
                          }}
                          options={{ indexAxis: 'y', plugins: { legend: { display: false } }, maintainAspectRatio: false, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }}
                        />
                      ) : (
                        <p className="text-muted-foreground text-sm italic">No payment data in this range</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Full Store Breakdown */}
            <div className="bg-card border border-border p-5 rounded-2xl flex flex-col overflow-hidden shadow-lg mt-6">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Individual Store Financial Mix</h3>
              <div className="overflow-x-auto relative">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-xs text-muted-foreground uppercase bg-background/50">
                    <tr>
                      <th className="px-4 py-3 rounded-tl-lg">Store</th>
                      <th className="px-4 py-3 text-right">Net Sales</th>
                      <th className="px-4 py-3 text-right">COGS</th>
                      <th className="px-4 py-3 text-right">3rd Pty Fees</th>
                      <th className="px-4 py-3 text-right">Fran. Fee</th>
                      <th className="px-4 py-3 text-right">Rent/Util</th>
                      <th className="px-4 py-3 text-right">Other Exp</th>
                      <th className="px-4 py-3 text-right text-primary">Op Profit</th>
                      <th className="px-4 py-3 text-right rounded-tr-lg">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stats.storeMix.map(row => (
                      <tr key={row.s} className={`hover:bg-muted/50 transition border-l-2 ${row.s === currentStore ? 'border-blue-500 bg-muted' : 'border-transparent'}`}>
                        <td className="px-4 py-2 font-medium">Store {row.s.split('-').pop()}</td>
                        <td className="px-4 py-2 text-right">{formatCur(row.net)}</td>
                        <td className="px-4 py-2 text-right">{formatCur(row.cogs)}</td>
                        <td className="px-4 py-2 text-right text-rose-400">{formatCur(row.delFee)}</td>
                        <td className="px-4 py-2 text-right">{formatCur(row.royaltyFee)}</td>
                        <td className="px-4 py-2 text-right">{formatCur(row.rentUtil)}</td>
                        <td className="px-4 py-2 text-right">{formatCur(row.otherExp)}</td>
                        <td className={`px-4 py-2 text-right font-bold ${row.op >= 0 ? 'text-green-800' : 'text-rose-400'}`}>{formatCur(row.op)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{row.marg}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Additional Tables Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Product Mix */}
              <div className="bg-card border border-border p-5 rounded-2xl flex flex-col shadow-lg max-h-[500px]">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Product Mix (Top 100)</h3>
                <div className="overflow-y-auto pr-2 custom-scrollbar">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-xs text-muted-foreground uppercase bg-background/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-lg">Item</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right rounded-tr-lg">Gross Rev</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {stats.topProducts.map(p => (
                        <tr key={p.item} className="hover:bg-muted/50 transition">
                          <td className="px-4 py-2">{p.item}</td>
                          <td className="px-4 py-2 text-right">{Math.round(p.qty)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCur(p.rev)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Variance & Export Section */}
              <div className="flex flex-col gap-6">
                {/* Daily Variance */}
                <div className="bg-card border border-border p-5 rounded-2xl flex flex-col shadow-lg max-h-[300px]">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Daily Cash Variance</h3>
                  <div className="overflow-y-auto pr-2 custom-scrollbar">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="text-xs text-muted-foreground uppercase bg-background/50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 rounded-tl-lg">Date</th>
                          <th className="px-4 py-3">Store</th>
                          <th className="px-4 py-3 text-right rounded-tr-lg">Over/Short</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {stats.dailyVar.map((v, i) => (
                          <tr key={i} className="hover:bg-muted/50 transition">
                            <td className="px-4 py-2 text-muted-foreground">{v.date}</td>
                            <td className="px-4 py-2">{v.store}</td>
                            <td className={`px-4 py-2 text-right font-medium ${v.val < -0 ? 'text-rose-400' : 'text-foreground'}`}>{formatCur(v.val)}</td>
                          </tr>
                        ))}
                        {stats.dailyVar.length === 0 && (
                          <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No variance found in this range.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Weekly Sales Export Table */}
                <div className="bg-card border border-border p-5 rounded-2xl flex flex-col shadow-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Weekly Sales Export</h3>
                    <button onClick={handleExportCSV} className="bg-primary/20 hover:bg-primary/30 text-primary transition-colors px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 border border-primary/20">
                      <Download className="w-4 h-4" /> Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="text-xs text-muted-foreground uppercase bg-background/50">
                        <tr>
                          <th className="px-4 py-3 rounded-tl-lg">Fran. Number</th>
                          <th className="px-4 py-3">Store</th>
                          <th className="px-4 py-3">Week End Date</th>
                          <th className="px-4 py-3 text-right">Weekly Sales</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {stats.exportRows.map(r => (
                          <tr key={r.s} className="hover:bg-muted/50 transition">
                            <td className="px-4 py-2">3659</td>
                            <td className="px-4 py-2">{r.s}</td>
                            <td className="px-4 py-2 text-muted-foreground">{r.weekEndDateStr}</td>
                            <td className="px-4 py-2 text-right font-medium">{formatCur(r.netSales)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
}
