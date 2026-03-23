import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Upload, Database, Loader2, Download, Shield, CalendarIcon, KeyRound, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import DataUploadWizard from '@/components/DataUploadWizard';
import PandLAuditWizard from '@/components/PandLAuditWizard';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const ROYALTY_PCT = 0.10;   // Fixed LC franchise rate (6% royalty + 4% ad fund)
const DEL_EST_PCT = 0.20;   // Fallback delivery commission estimate when no actual data

type RawDataRow = any;

type StoreManualAdjustment = {
  rent: number;
  util: number;
  maint: number;
  sga: number;
  payouts: number;
  capex: number;
  nickname?: string;
  weekly?: Record<string, any>;
};

type AppState = {
  raw: {
    summary: RawDataRow[];
    items: RawDataRow[];
    txns: RawDataRow[];
    sales: RawDataRow[];
    inventory: RawDataRow[];
    invoices: RawDataRow[];
    labor: RawDataRow[];
  };
  manual: Record<string, StoreManualAdjustment>;
};

const ManualInput = ({ value, onChange, placeholder, className }: { value: number | string, onChange: (val: number) => void, placeholder: string, className: string }) => {
  const [localValue, setLocalValue] = useState(value.toString());

  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleBlur = () => {
    if (localValue === value.toString()) return;
    const parsed = parseFloat(localValue);
    onChange(isNaN(parsed) ? 0 : parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
    />
  );
};

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const [state, setState] = useState<AppState>({
    raw: { summary: [], items: [], txns: [], sales: [], inventory: [], invoices: [], labor: [] },
    manual: {},
  });

  const [stores, setStores] = useState<string[]>([]);
  const [currentStore, setCurrentStore] = useState('ALL');

  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isUploadWizardOpen, setIsUploadWizardOpen] = useState(false);
  const [isPandLWizardOpen, setIsPandLWizardOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const res = await fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newState: AppState = { raw: { summary: [], items: [], txns: [], sales: [], inventory: [], invoices: [], labor: [] }, manual: {} };
      const uniqueStores = new Set<string>();

      let maxDateMs = 0;

      data.reports?.forEach((r: any) => {
        const payload = r.data;
        if (payload.summary) newState.raw.summary.push(...payload.summary);
        if (payload.items) newState.raw.items.push(...payload.items);
        if (payload.txns) newState.raw.txns.push(...payload.txns);
        if (payload.sales) newState.raw.sales.push(...payload.sales);
        if (payload.inventory) newState.raw.inventory.push(...payload.inventory);
        if (payload.invoices) newState.raw.invoices.push(...payload.invoices);
        if (payload.labor) newState.raw.labor.push(...payload.labor);

        const dMs = new Date(r.business_date).getTime();
        if (!isNaN(dMs) && dMs > maxDateMs) maxDateMs = dMs;
      });

      [
        ...newState.raw.summary,
        ...newState.raw.items,
        ...newState.raw.txns,
        ...newState.raw.sales,
        ...newState.raw.inventory,
        ...newState.raw.invoices,
        ...newState.raw.labor
      ].forEach(row => {
        const storeStr = (row['Franchise Store'] || '').toString().trim();
        if (storeStr) {
          uniqueStores.add(storeStr);
          if (!newState.manual[storeStr]) {
            newState.manual[storeStr] = { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0 };
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

  const handleStringChange = (key: keyof StoreManualAdjustment, value: string) => {
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
    // Replaced by DataUploadWizard
  };

  const filteredData = useMemo(() => {
    const fStore = (row: any) => currentStore === 'ALL' || (row['Franchise Store'] || '').toString().trim() === currentStore;
    const fDate = (row: any) => {
      if (!dateRange.start || !dateRange.end) return true;
      const bd = (row['Business Date'] || row['Date'] || row['Applied Delivery Date'] || '').toString();
      return bd >= dateRange.start && bd <= dateRange.end;
    };
    const f = (row: any) => fStore(row) && fDate(row);

    return {
      summary: state.raw.summary.filter(f),
      items: state.raw.items.filter(f),
      txns: state.raw.txns.filter(f),
      sales: state.raw.sales.filter(f),
      inventory: state.raw.inventory.filter(f),
      invoices: state.raw.invoices.filter(f),
      labor: state.raw.labor.filter(f)
    };
  }, [state, currentStore, dateRange]);

  const stats = useMemo(() => {
    let tGross = 0, tTax = 0, tTxns = 0, tVar = 0, v3p = 0, rOblig = 0;
    let laborCost = 0, invUsageCost = 0, invoiceCost = 0;

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

    filteredData.labor.forEach(r => {
      laborCost += Number(r['Total Pay']) || 0;
    });

    filteredData.inventory.forEach(r => {
      invUsageCost += Number(r['Used Value']) || 0;
    });

    filteredData.invoices.forEach(r => {
      invoiceCost += Number(r['Invoice Total']) || 0;
    });

    const tNet = tGross - tTax;

    // Determine COGS
    let cogs = 0;
    if (invUsageCost > 0) {
      cogs = invUsageCost;
    } else if (invoiceCost > 0) {
      cogs = invoiceCost;
    }

    // Check for actual delivery service fees in summary data
    const getWeekEndString = (dStr: string) => {
      const date = new Date(dStr);
      const day = date.getUTCDay(); // 0 is Sunday
      const toAdd = day === 0 ? 0 : 7 - day;
      const wEnd = new Date(date.getTime() + toAdd * 86400000);
      return wEnd.toISOString().split('T')[0];
    };

    const storeAvgs: Record<string, any> = {};
    const networkTotals = { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0, count: 0 };

    stores.forEach(s => {
      const weekly = state.manual[s]?.weekly || {};
      const weeks = Object.values(weekly) as { rent: number, util: number, maint: number, sga: number, payouts: number, capex: number }[];
      if (weeks.length > 0) {
        const storeTotal = { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0 };
        weeks.forEach(w => {
          storeTotal.rent += w.rent || 0;
          storeTotal.util += w.util || 0;
          storeTotal.maint += w.maint || 0;
          storeTotal.sga += w.sga || 0;
          storeTotal.payouts += w.payouts || 0;
          storeTotal.capex += w.capex || 0;
        });
        storeAvgs[s] = {
          rent: storeTotal.rent / weeks.length,
          util: storeTotal.util / weeks.length,
          maint: storeTotal.maint / weeks.length,
          sga: storeTotal.sga / weeks.length,
          payouts: storeTotal.payouts / weeks.length,
          capex: storeTotal.capex / weeks.length
        };
        networkTotals.rent += storeTotal.rent;
        networkTotals.util += storeTotal.util;
        networkTotals.maint += storeTotal.maint;
        networkTotals.sga += storeTotal.sga;
        networkTotals.payouts += storeTotal.payouts;
        networkTotals.capex += storeTotal.capex;
        networkTotals.count += weeks.length;
      } else {
        storeAvgs[s] = { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0 };
      }
    });

    const netAvg = networkTotals.count > 0 ? {
      rent: networkTotals.rent / networkTotals.count,
      util: networkTotals.util / networkTotals.count,
      maint: networkTotals.maint / networkTotals.count,
      sga: networkTotals.sga / networkTotals.count,
      payouts: networkTotals.payouts / networkTotals.count,
      capex: networkTotals.capex / networkTotals.count,
    } : { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0 };

    const derivationsMap: Record<string, { qb: number, store: number, net: number, static: number }> = {
      rent: { qb: 0, store: 0, net: 0, static: 0 },
      util: { qb: 0, store: 0, net: 0, static: 0 },
      maint: { qb: 0, store: 0, net: 0, static: 0 },
      sga: { qb: 0, store: 0, net: 0, static: 0 },
      payouts: { qb: 0, store: 0, net: 0, static: 0 },
      capex: { qb: 0, store: 0, net: 0, static: 0 },
    };

    const getDailyRate = (metric: keyof typeof derivationsMap, s: string, weeklyObj: any, baseline: number) => {
      const isTracked = currentStore === 'ALL' || currentStore === s;
      if (weeklyObj && weeklyObj[metric] !== undefined) {
        if (isTracked) derivationsMap[metric].qb++;
        return (weeklyObj[metric] || 0) / 7;
      }
      if (storeAvgs[s][metric as 'rent'] > 0) {
        if (isTracked) derivationsMap[metric].store++;
        return storeAvgs[s][metric as 'rent'] / 7;
      }
      if (netAvg[metric as 'rent'] > 0) {
        if (isTracked) derivationsMap[metric].net++;
        return netAvg[metric as 'rent'] / 7;
      }
      if (isTracked) derivationsMap[metric].static++;
      return (baseline || 0) / 7;
    };

    const resolveDerivationLabel = (metric: keyof typeof derivationsMap) => {
      const m = derivationsMap[metric];
      const total = m.qb + m.store + m.net + m.static;
      if (total === 0) return 'No Data';

      if (m.qb > 0 && m.qb === total) return 'QuickBooks Actuals';
      if (m.qb > 0) return `Mixed (Includes QuickBooks)`;
      if (m.store > 0 && m.store === total) return 'Store Historical Avg';
      if (m.store > 0) return `Mixed (Includes Store Avg)`;
      if (m.net > 0 && m.net === total) return 'Network Avg';
      if (m.net > 0) return `Mixed (Includes Network Avg)`;
      return 'Legacy Fallback';
    };

    // Generate store mix
    const storeMix = stores.map(s => {
      let gross = 0, tax = 0, sOblig = 0;
      let sLabor = 0, sInvUsage = 0, sInvoice = 0;
      let sRent = 0, sUtil = 0, sMaint = 0, sSga = 0, sPayouts = 0, sCapex = 0;
      let sActualDelFee = 0;
      const man = state.manual[s] || { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0, weekly: {} };

      filteredData.summary.filter(r => (r['Franchise Store'] || '').toString().trim() === s).forEach(r => {
        gross += Number(r['Gross Sales']) || 0;
        tax += Number(r['Sales Tax']) || 0;
        sOblig += Number(r['Royalty Obligation']) || 0;
        sActualDelFee += Number(r['Delivery Service Fee']) || 0;

        const dStr = (r['Business Date'] || r['Date'] || '').toString();
        if (dStr) {
          const wEnd = getWeekEndString(dStr);
          const weekly = man.weekly?.[wEnd];
          sRent += getDailyRate('rent', s, weekly, man.rent);
          sUtil += getDailyRate('util', s, weekly, man.util);
          sMaint += getDailyRate('maint', s, weekly, man.maint);
          sSga += getDailyRate('sga', s, weekly, man.sga);
          sPayouts += getDailyRate('payouts', s, weekly, man.payouts);
          sCapex += getDailyRate('capex', s, weekly, man.capex);
        }
      });
      let sV3p = 0;
      filteredData.txns.filter(r => (r['Franchise Store'] || '').toString().trim() === s).forEach(r => {
        const m = String(r['Payment Method'] || '').toUpperCase();
        if (m.includes('DOORDASH') || m.includes('UBEREATS') || m.includes('GRUBHUB')) sV3p += Number(r['Total Amount']) || 0;
      });
      filteredData.labor.filter(r => (r['Franchise Store'] || '').toString().trim() === s).forEach(r => {
        sLabor += Number(r['Total Pay']) || 0;
      });
      filteredData.inventory.filter(r => (r['Franchise Store'] || '').toString().trim() === s).forEach(r => {
        sInvUsage += Number(r['Used Value']) || 0;
      });
      filteredData.invoices.filter(r => (r['Franchise Store'] || '').toString().trim() === s).forEach(r => {
        sInvoice += Number(r['Invoice Total']) || 0;
      });

      const net = gross - tax;

      let cogsVal = 0;
      if (sInvUsage > 0) cogsVal = sInvUsage;
      else if (sInvoice > 0) cogsVal = sInvoice;

      const sDelFee = sActualDelFee > 0 ? sActualDelFee : sV3p * DEL_EST_PCT;
      const sRoyaltyFee = sOblig * ROYALTY_PCT;
      const rentUtil = sRent + sUtil;
      const otherExp = sMaint + sSga + sPayouts + sCapex;
      const op = net - cogsVal - sLabor - sDelFee - sRoyaltyFee - rentUtil - otherExp;
      return { s, net, cogs: cogsVal, labor: sLabor, delFee: sDelFee, royaltyFee: sRoyaltyFee, rentUtil, otherExp, sRent, sUtil, sMaint, sSga, sPayouts, sCapex, sV3p, op, marg: net > 0 ? ((op / net) * 100).toFixed(1) : "0.0", sOblig };
    }).sort((a, b) => b.op - a.op);

    // Apply global aggregations
    let mDel = 0, mRoy = 0, mRent = 0, mUtil = 0, mMaint = 0, mSga = 0, mPayouts = 0, mCapex = 0;
    let actualDelFees = 0;
    let totalV3p = 0;

    storeMix.forEach(sm => {
      if (currentStore === 'ALL' || sm.s === currentStore) {
        mRent += sm.sRent;
        mUtil += sm.sUtil;
        mMaint += sm.sMaint;
        mSga += sm.sSga;
        mPayouts += sm.sPayouts;
        mCapex += sm.sCapex;
        mRoy += sm.royaltyFee;
        mDel += sm.delFee;
        totalV3p += sm.sV3p;
        if (sm.delFee !== sm.sV3p * DEL_EST_PCT) actualDelFees += sm.delFee;
      }
    });

    const isDelEstimated = actualDelFees === 0;
    const effectiveDelPct = (!isDelEstimated && totalV3p > 0) ? (actualDelFees / totalV3p) * 100 : null;
    const opProfit = tNet - cogs - laborCost - mDel - mRoy - mRent - mUtil - mMaint - mSga - mPayouts - mCapex;

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

    const derivations = {
      rent: resolveDerivationLabel('rent'),
      util: resolveDerivationLabel('util'),
      maint: resolveDerivationLabel('maint'),
      sga: resolveDerivationLabel('sga'),
      payouts: resolveDerivationLabel('payouts'),
      capex: resolveDerivationLabel('capex')
    };

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
    const dailyVar: { date: string, storeId: string, val: number }[] = [];
    filteredData.summary.forEach(r => {
      const v = Number(r['Over Short']) || 0;
      if (v !== 0) dailyVar.push({ date: r['Business Date'] || r['Date'], storeId: (r['Franchise Store'] || '').toString().trim(), val: v });
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
      tGross, tTax, tNet, cogs, laborCost, tTxns, tVar, v3p, rOblig,
      mDel, isDelEstimated, effectiveDelPct, mRoy, mRent, mUtil, mMaint, mSga, mPayouts, mCapex, opProfit,
      margin: tNet > 0 ? (opProfit / tNet) * 100 : 0,
      carryout, delivery,
      payMap, storeMix, topProducts, dailyVar, exportRows, derivations
    };
  }, [filteredData, state.manual, currentStore, stores]);

  const activeManual = state.manual[currentStore === 'ALL' ? (stores[0] || 'ALL') : currentStore] || { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0 };
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
    <>
      <div className="min-h-screen p-6 bg-background text-foreground font-sans">
        <div className="max-w-[1400px] mx-auto space-y-6">
          {/* Main Dashboard Content below... */}
          <div className="hidden">Placeholder</div>
          {/* I will keep the actual return contents below unmodified by making sure I skip closing div tag properly */}

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
              <button
                onClick={() => setIsPasswordModalOpen(true)}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm mr-2 transition-colors whitespace-nowrap"
              >
                <KeyRound className="w-4 h-4" /> Change Password
              </button>
              <button onClick={logout} className="text-muted-foreground hover:text-foreground text-sm mr-2 transition-colors whitespace-nowrap">Sign out ({user?.email})</button>

              {/* Date Filters */}
              <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2 py-1.5 focus-within:border-blue-500 min-w-[300px]">
                <CalendarIcon className="w-4 h-4 text-muted-foreground ml-1" />
                <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-transparent text-sm text-foreground focus:outline-none w-full cursor-pointer" />
                <span className="text-muted-foreground">-</span>
                <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-transparent text-sm text-foreground focus:outline-none w-full cursor-pointer" />
              </div>

              {user?.is_admin && (
                <>
                  <button
                    onClick={() => navigate('/data')}
                    className="bg-secondary/50 hover:bg-secondary text-foreground text-sm font-medium transition-colors px-4 py-2 rounded-lg border border-border flex items-center gap-2 whitespace-nowrap"
                  >
                    <Database className="w-4 h-4" /> Manage Data
                  </button>
                  <button
                    onClick={() => setIsUploadWizardOpen(true)}
                    className="bg-primary/10 hover:bg-primary/20 text-primary transition-colors px-4 py-2 rounded-lg border border-primary/20 flex items-center gap-2 text-sm font-medium whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4" /> Upload Excel Files
                  </button>
                  <button
                    onClick={() => setIsPandLWizardOpen(true)}
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 transition-colors px-4 py-2 rounded-lg border border-amber-500/20 flex items-center gap-2 text-sm font-medium whitespace-nowrap"
                  >
                    <AlertCircle className="w-4 h-4" /> P&L Audit
                  </button>
                </>
              )}
              <select
                value={currentStore}
                onChange={e => setCurrentStore(e.target.value)}
                className="bg-secondary border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary max-w-[200px]"
              >
                <option value="ALL">All Stores (Aggregate)</option>
                {stores.map(s => <option key={s} value={s}>{state.manual[s]?.nickname || `Store ${s.split('-').pop()}`}</option>)}
              </select>
            </div>
          </header>

          {dataLoading && state.raw.summary.length === 0 && state.raw.labor.length === 0 && state.raw.invoices.length === 0 && state.raw.inventory.length === 0 ? (
            <div className="bg-card border border-border p-12 rounded-2xl text-center flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Loading historical data from database...</p>
            </div>
          ) : state.raw.summary.length === 0 && state.raw.labor.length === 0 && state.raw.invoices.length === 0 && state.raw.inventory.length === 0 ? (
            <div className="bg-card border border-border border-dashed p-12 rounded-2xl text-center">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {user?.is_admin
                  ? 'Database is empty. Upload LCE Gateway and Altametrics files.'
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
                      { l: 'COGS', v: stats.cogs },
                      ...(stats.laborCost > 0 ? [{ l: 'Labor', v: stats.laborCost }] : []),
                      { l: stats.isDelEstimated ? `3rd Party Del. Fees (Est. ${DEL_EST_PCT * 100}%)` : '3rd Party Del. Fees (Actual)', v: stats.mDel },
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

                <div className="bg-card border border-border p-5 rounded-2xl flex flex-col shadow-lg xl:col-span-1">
                  <div className="flex flex-col gap-1 mb-4">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Cost Sourcing</h3>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      When Quickbooks P&L audit data is absent for specific weeks, variables gracefully inherit store or global historical averages.
                    </p>
                  </div>

                  <div className="flex justify-between items-center text-sm mb-4 pb-4 border-b border-border">
                    <label className="text-sm font-bold text-muted-foreground mr-4 whitespace-nowrap">Store Nickname</label>
                    <input
                      type="text"
                      value={currentStore === 'ALL' ? '' : (activeManual.nickname || '')}
                      onChange={e => handleStringChange('nickname', e.target.value)}
                      placeholder={currentStore === 'ALL' ? 'Select a specific store' : 'e.g. Odenton'}
                      disabled={currentStore === 'ALL'}
                      className="bg-background border border-border rounded px-2 py-1.5 w-full text-right text-foreground text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                    />
                  </div>

                  {stats.effectiveDelPct !== null && (
                    <div className="flex justify-between items-center text-sm mb-2 pb-2 border-b border-border">
                      <span className="text-muted-foreground">Eff. Delivery Commission</span>
                      <span className="font-medium text-foreground">{stats.effectiveDelPct.toFixed(1)}%</span>
                    </div>
                  )}

                  <div className="space-y-4 mt-2">
                    {[
                      { l: 'Rent', k: 'rent', val: stats.mRent },
                      { l: 'Utilities', k: 'util', val: stats.mUtil },
                      { l: 'Maintenance', k: 'maint', val: stats.mMaint },
                      { l: 'Admin/SG&A', k: 'sga', val: stats.mSga },
                      { l: 'Cash Payouts', k: 'payouts', val: stats.mPayouts },
                      { l: 'Capex', k: 'capex', val: stats.mCapex },
                    ].map((f: any, i) => (
                      <div key={i} className="flex flex-col gap-1.5 pb-3 border-b border-border/50 last:border-0 last:pb-0">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">{f.l}</span>
                          <span className="font-medium text-foreground">{formatCur(f.val)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground/60">Data Source:</span>
                          <span className={`text-[9px] uppercase px-2 py-0.5 rounded font-bold tracking-wider ${stats.derivations[f.k as keyof typeof stats.derivations].includes('QuickBooks') ? 'bg-green-500/10 text-green-500' : stats.derivations[f.k as keyof typeof stats.derivations].includes('Legacy') ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'}`}>
                            {stats.derivations[f.k as keyof typeof stats.derivations]}
                          </span>
                        </div>
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
                            options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#000000' } } } }}
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
                        {stats.laborCost > 0 && <th className="px-4 py-3 text-right">Labor</th>}
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
                          <td className="px-4 py-2 font-medium">{state.manual[row.s]?.nickname || `Store ${row.s.split('-').pop()}`}</td>
                          <td className="px-4 py-2 text-right">{formatCur(row.net)}</td>
                          <td className="px-4 py-2 text-right">{formatCur(row.cogs)}</td>
                          {stats.laborCost > 0 && <td className="px-4 py-2 text-right">{formatCur(row.labor)}</td>}
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
                              <td className="px-4 py-2">{state.manual[v.storeId]?.nickname || `Store ${v.storeId.split('-').pop()}`}</td>
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
                              <td className="px-4 py-2">{state.manual[r.s]?.nickname || `Store ${r.s.split('-').pop()}`}</td>
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

        <ChangePasswordModal
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
          userId={user?.id as string}
        />
        {user?.is_admin && (
          <>
            <DataUploadWizard
              isOpen={isUploadWizardOpen}
              onClose={() => setIsUploadWizardOpen(false)}
              token={token}
              onSuccess={fetchData}
            />
            <PandLAuditWizard
              isOpen={isPandLWizardOpen}
              onOpenChange={setIsPandLWizardOpen}
              stores={stores}
              manual={state.manual}
              token={token}
              onSaved={fetchData}
            />
          </>
        )}
      </div>
    </>
  );
}
