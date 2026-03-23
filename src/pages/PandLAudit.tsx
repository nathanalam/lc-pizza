import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import * as XLSX from 'xlsx';
import { Upload, AlertCircle, Save, ChevronRight, Database, ArrowLeft, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

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

// Map commonly seen Quickbooks P&L account names to our manual categories
const KEY_MAP: Record<string, string> = {
  'Store Rent': 'rent',
  'Electric': 'util',
  'Gas': 'util',
  'Water': 'util',
  'Waste Removal': 'util',
  'DSL/Internet': 'util',
  'Repairs': 'maint',
  'Maintenance': 'maint',
  'Bank Service Charges': 'sga',
  'Credit Card Fees': 'sga',
  'Professional Fees': 'sga',
  'Contract Labor': 'sga',
  'Sales': 'qbNetSales',
  'Total Sales': 'qbNetSales',
  'Total Income': 'qbNetSales',
  'Total for Income': 'qbNetSales',
  'Income': 'qbNetSales',
  'Cost of Goods Sold': 'qbCogs',
  'Total Cost of Goods Sold': 'qbCogs',
  'Total for Cost of Goods Sold': 'qbCogs',
  'Total COGS': 'qbCogs',
  'Purchases': 'qbCogs',
  'Payroll Expenses': 'qbLabor',
  'Total Payroll Expenses': 'qbLabor',
  'Total for Payroll Expenses': 'qbLabor',
  'Salaries & Wages': 'qbLabor',
  'Total Salaries & Wages': 'qbLabor',
  'Labor Crew': 'qbLabor',
  "Labor Officer's Salary": 'qbLabor',
  'Payroll Taxes': 'qbLabor',
  'Telephone': 'util',
  'Grease trap': 'maint',
  'Pest Control': 'maint'
};

export default function PandLAudit() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [dataLoading, setDataLoading] = useState(true);
  const [raw, setRaw] = useState<any>({ summary: [], inventory: [], invoices: [], labor: [] });
  const [manual, setManual] = useState<Record<string, StoreManualAdjustment>>({});
  const [stores, setStores] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'wizard' | 'compare'>('wizard');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [parsedData, setParsedData] = useState<{ weekEndDate: string; startDate: string; rawLabel: string; rent: number; util: number; maint: number; sga: number; payouts: number; capex: number; qbNetSales: number; qbCogs: number; qbLabor: number; }[]>([]);
  const [loading, setLoading] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  type AmortStrategy = 'actual' | 'monthly' | 'uniform' | 'runrate';
  const [amortization, setAmortization] = useState<Record<'rent' | 'util' | 'maint' | 'sga', AmortStrategy>>({
    rent: 'runrate',
    util: 'runrate',
    maint: 'actual',
    sga: 'actual'
  });

  useEffect(() => {
    if (!user) navigate('/login');
    else if (!user.is_admin) navigate('/dashboard');
    else fetchData();
  }, [user, navigate, token]);

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const res = await fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newStateRaw = { summary: [], items: [], txns: [], sales: [], inventory: [], invoices: [], labor: [] };
      const uniqueStores = new Set<string>();

      data.reports?.forEach((r: any) => {
        const payload = r.data;
        if (payload.summary) newStateRaw.summary.push(...payload.summary);
        if (payload.inventory) newStateRaw.inventory.push(...payload.inventory);
        if (payload.invoices) newStateRaw.invoices.push(...payload.invoices);
        if (payload.labor) newStateRaw.labor.push(...payload.labor);
      });

      const newManual: Record<string, StoreManualAdjustment> = {};
      [...newStateRaw.summary, ...newStateRaw.inventory, ...newStateRaw.invoices, ...newStateRaw.labor].forEach((row: any) => {
        const storeStr = (row['Franchise Store'] || '').toString().trim();
        if (storeStr) {
          uniqueStores.add(storeStr);
          if (!newManual[storeStr]) newManual[storeStr] = { rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0 };
        }
      });

      data.adjustments?.forEach((adj: any) => {
        if (uniqueStores.has(adj.store_id)) {
          newManual[adj.store_id] = { ...newManual[adj.store_id], ...adj.data };
        }
      });

      setRaw(newStateRaw);
      setManual(newManual);
      setStores(Array.from(uniqueStores).sort());
    } catch (e: any) {
      toast({ title: 'Error fetching data', description: e.message, variant: 'destructive' });
    } finally {
      setDataLoading(false);
    }
  };

  // We parse the file into columns
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      // header: 1 means array of arrays
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const dateRangeRegex = /([A-Za-z]{3}\s+\d{1,2}(?:\s+\d{4})?)\s*-\s*([A-Za-z]{3}\s+\d{1,2}(?:\s+\d{4})?)/;
      
      let headerRowIndex = -1;
      let dateCols: { colIndex: number; rawLabel: string; weekEndDate: string; startDate: string; }[] = [];

      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if (!row) continue;
        
        let foundDate = false;
        row.forEach((cell, idx) => {
          if (typeof cell === 'string' && dateRangeRegex.test(cell)) {
             foundDate = true;
             const match = cell.match(dateRangeRegex);
             if (match && match[1] && match[2]) {
                const endStr = match[2];
                let startStr = match[1];

                const endDateObj = new Date(endStr);
                const year = endDateObj.getFullYear();
                
                if (!/\d{4}/.test(startStr)) {
                   startStr = `${startStr} ${year}`;
                }
                const startDateObj = new Date(startStr);

                if (!isNaN(endDateObj.getTime()) && !isNaN(startDateObj.getTime())) {
                  dateCols.push({
                    colIndex: idx,
                    rawLabel: cell,
                    weekEndDate: endDateObj.toISOString().split('T')[0],
                    startDate: startDateObj.toISOString().split('T')[0]
                  });
                }
             }
          }
        });

        if (foundDate) {
           headerRowIndex = i;
           break;
        }
      }

      if (dateCols.length === 0) {
        // Fallback: If no date columns, try to track down the "Total" column
        let foundCol = rows[0]?.length - 1 || 1;
        for (let j = rows[0].length - 1; j >= 0; j--) {
           if (rows[0][j] && String(rows[0][j]).toLowerCase().includes('total')) {
               foundCol = j;
               break;
           }
        }
        dateCols.push({
           colIndex: foundCol,
           rawLabel: 'Custom Date Range',
           startDate: '',
           weekEndDate: ''
        });
        headerRowIndex = 0;
      }

      const periodsMap: Record<string, any> = {};
      dateCols.forEach(dc => {
        periodsMap[dc.weekEndDate] = {
           weekEndDate: dc.weekEndDate,
           startDate: dc.startDate,
           rawLabel: dc.rawLabel,
           rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0,
           qbNetSales: 0, qbCogs: 0, qbLabor: 0
        };
      });

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
         const row = rows[i];
         const accountName = String(row[0] || '').trim();
         
         if (!accountName || accountName === 'Total') continue;

         const cat = KEY_MAP[accountName];
         if (!cat) continue;

         dateCols.forEach(dc => {
            const val = parseFloat(String(row[dc.colIndex]).replace(/,/g, '').replace('$', ''));
            if (!isNaN(val)) {
                periodsMap[dc.weekEndDate][cat] += val;
            }
         });
      }

      const parsedArray = Object.values(periodsMap).sort((a: any, b: any) => new Date(a.weekEndDate).getTime() - new Date(b.weekEndDate).getTime());
      
      setParsedData(parsedArray);
      setStep(2);

    } catch (err: any) {
      toast({ title: 'Upload Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const currentManual = manual[selectedStore] || { rent: 0, util: 0, maint: 0, sga: 0, capex: 0, payouts: 0, weekly: {} };
  const existingWeekly = currentManual.weekly || {};

  const computedData = useMemo(() => {
    if (!parsedData.length) return [];
    
    const result = parsedData.map(p => ({ ...p }));
    
    (['rent', 'util', 'maint', 'sga'] as const).forEach(metric => {
       const strategy = amortization[metric];
       
       if (strategy === 'uniform') {
         const total = result.reduce((sum, p) => sum + p[metric], 0);
         const avg = total / result.length;
         result.forEach(p => p[metric] = avg);
       } else if (strategy === 'monthly' || strategy === 'runrate') {
         const monthlyTotals: Record<string, number> = {};
         const monthlyCounts: Record<string, number> = {};
         
         result.forEach(p => {
           const yyyymm = p.weekEndDate.substring(0, 7);
           monthlyTotals[yyyymm] = (monthlyTotals[yyyymm] || 0) + p[metric];
           monthlyCounts[yyyymm] = (monthlyCounts[yyyymm] || 0) + 1;
         });
         
         const validTotals = Object.values(monthlyTotals).filter(v => v > 0);
         const runRateMonthly = validTotals.length > 0 ? validTotals.reduce((a,b)=>a+b, 0) / validTotals.length : 0;
         const trueWeekly = runRateMonthly > 0 ? (runRateMonthly * 12) / 52 : 0;
         
         if (strategy === 'runrate') {
           result.forEach(p => p[metric] = trueWeekly);
         } else {
           result.forEach(p => {
             const yyyymm = p.weekEndDate.substring(0, 7);
             if (monthlyTotals[yyyymm] === 0 && runRateMonthly > 0) {
               p[metric] = trueWeekly;
             } else {
               p[metric] = monthlyTotals[yyyymm] / monthlyCounts[yyyymm];
             }
           });
         }
       }
    });
    
    return result;
  }, [parsedData, amortization]);

  const dbComparison = useMemo(() => {
    if (!selectedStore || !parsedData.length || !raw?.summary) return [];
    
    return parsedData.map(p => {
      // Respect explicit user overrides over the parsed period limits
      const startStr = customStart || p.startDate;
      const endStr = customEnd || p.weekEndDate;

      const inRange = (row: any) => {
        if (!startStr || !endStr) return false;
        const bd = (row['Business Date'] || row['Date'] || '').toString();
        const s = (row['Franchise Store'] || '').toString().trim();
        return (selectedStore === 'ALL' || s === selectedStore) && bd >= startStr && bd <= endStr;
      };

      let gross = 0, tax = 0;
      (raw.summary || []).filter(inRange).forEach((r: any) => {
        gross += Number(r['Gross Sales']) || 0;
        tax += Number(r['Sales Tax']) || 0;
      });
      const netSales = gross - tax;

      let labor = 0;
      (raw.labor || []).filter(inRange).forEach((r: any) => {
        labor += Number(r['Total Pay']) || 0;
      });

      let invUsage = 0;
      (raw.inventory || []).filter(inRange).forEach((r: any) => {
        invUsage += Number(r['Used Value']) || 0;
      });

      let invoice = 0;
      (raw.invoices || []).filter(inRange).forEach((r: any) => {
        invoice += Number(r['Invoice Total']) || 0;
      });

      const cogs = invUsage > 0 ? invUsage : invoice;

      const diffSales = netSales - (p.qbNetSales || 0);
      const pctSales = p.qbNetSales > 0 ? Math.abs(diffSales) / p.qbNetSales : 0;
      
      const diffCogs = cogs - (p.qbCogs || 0);
      const pctCogs = p.qbCogs > 0 ? Math.abs(diffCogs) / p.qbCogs : 0;
      
      const diffLabor = labor - (p.qbLabor || 0);
      const pctLabor = p.qbLabor > 0 ? Math.abs(diffLabor) / p.qbLabor : 0;

      return { 
        weekEndDate: p.weekEndDate, 
        rawLabel: p.rawLabel,
        dbNetSales: netSales, dbCogs: cogs, dbLabor: labor,
        qbNetSales: p.qbNetSales || 0, qbCogs: p.qbCogs || 0, qbLabor: p.qbLabor || 0,
        qbRent: p.rent || 0, qbUtil: p.util || 0, qbMaint: p.maint || 0, qbSga: p.sga || 0,
        diffSales, pctSales, diffCogs, pctCogs, diffLabor, pctLabor
      };
    });
  }, [parsedData, selectedStore, raw]);

  const aggregateComparison = useMemo(() => {
    if (!dbComparison.length) return null;
    return dbComparison.reduce((acc, curr) => {
      acc.dbNetSales += curr.dbNetSales;
      acc.dbCogs += curr.dbCogs;
      acc.dbLabor += curr.dbLabor;
      acc.qbNetSales += curr.qbNetSales;
      acc.qbCogs += curr.qbCogs;
      acc.qbLabor += curr.qbLabor;
      acc.qbRent += curr.qbRent;
      acc.qbUtil += curr.qbUtil;
      acc.qbMaint += curr.qbMaint;
      acc.qbSga += curr.qbSga;
      return acc;
    }, { dbNetSales: 0, dbCogs: 0, dbLabor: 0, qbNetSales: 0, qbCogs: 0, qbLabor: 0, qbRent: 0, qbUtil: 0, qbMaint: 0, qbSga: 0 });
  }, [dbComparison]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const updatedWeekly = { ...existingWeekly };
      
      computedData.forEach(p => {
         updatedWeekly[p.weekEndDate] = {
           weekEndDate: p.weekEndDate,
           rent: p.rent,
           util: p.util,
           maint: p.maint,
           sga: p.sga,
           payouts: p.payouts,
           capex: p.capex
         };
      });

      const nextData = { ...currentManual, weekly: updatedWeekly };
      
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ adjustments: [{ store_id: selectedStore, data: nextData }] })
      });

      if (!res.ok) throw new Error('Failed to save to database');

      toast({ title: 'Success', description: `Saved ${computedData.length} weekly periods for ${selectedStore}` });
      setStep(1);
      setParsedData([]);
      setSelectedStore('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const formatCur = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);

  if (!user?.is_admin) return null;

  return (
    <div className="h-screen bg-background flex flex-col text-foreground font-sans">
      <header className="flex justify-between items-center bg-card border-b border-border p-4 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
               P&L Audit Wizard
            </h1>
            <p className="text-muted-foreground text-xs">Map Quickbooks P&L actuals over exact time periods to adjust the operations dashboard dynamically.</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="max-w-4xl w-full">
          {dataLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl shadow-sm p-6">
              
              <div className="flex justify-center mb-8">
                <div className="bg-secondary/50 p-1.5 rounded-xl inline-flex">
                  <button 
                    onClick={() => { setActiveTab('wizard'); setStep(1); setParsedData([]); setSelectedStore(''); }} 
                    className={`px-5 py-2.5 text-sm font-medium rounded-lg transition ${activeTab === 'wizard' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Overrides Wizard
                  </button>
                  <button 
                    onClick={() => { setActiveTab('compare'); setStep(1); setParsedData([]); setSelectedStore(''); }} 
                    className={`px-5 py-2.5 text-sm font-medium rounded-lg transition ${activeTab === 'compare' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Side-by-Side Comparison
                  </button>
                </div>
              </div>

              {activeTab === 'wizard' ? (
                <>
                  <div className="flex items-center gap-2 mb-8 border-b border-border pb-4">
                    <div className={`flex flex-col flex-1 border-b-2 pb-2 ${step >= 1 ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
                      <span className="text-xs font-bold uppercase tracking-wider">Step 1</span>
                      <span className="text-sm font-medium">Upload File</span>
                    </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
                <div className={`flex flex-col flex-1 border-b-2 pb-2 ${step >= 2 ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
                  <span className="text-xs font-bold uppercase tracking-wider">Step 2</span>
                  <span className="text-sm font-medium">Select Store & Review</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
                <div className={`flex flex-col flex-1 border-b-2 pb-2 ${step >= 3 ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
                  <span className="text-xs font-bold uppercase tracking-wider">Step 3</span>
                  <span className="text-sm font-medium">Confirm Setup</span>
                </div>
              </div>

              {step === 1 && (
                <div className="space-y-4">
                  <div className="border border-dashed border-border rounded-xl p-16 text-center bg-background/50 flex flex-col items-center">
                    <Upload className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-xl font-medium text-foreground mb-2">Upload Quickbooks P&L</h3>
                    <p className="text-sm text-muted-foreground mb-8 max-w-sm">
                      Must contain time periods grouped by columns (e.g. "Dec 23 - Dec 28 2025") and standard expense headers.
                    </p>
                    <input
                      type="file"
                      id="pl-upload"
                      className="hidden"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      disabled={loading}
                    />
                    <button
                      onClick={() => document.getElementById('pl-upload')?.click()}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-xl font-medium transition-colors cursor-pointer flex items-center gap-2"
                      disabled={loading}
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {loading ? 'Processing...' : 'Select File'}
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4 bg-secondary/50 p-4 rounded-xl border border-border">
                    <AlertCircle className="w-6 h-6 text-blue-400 shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-foreground">Extracted {parsedData.length} periods</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Select a store to apply the actuals as overrides to its static manual adjustments.</p>
                    </div>
                    <select
                      value={selectedStore}
                      onChange={e => setSelectedStore(e.target.value)}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary min-w-[200px]"
                    >
                      <option value="" disabled>Select Store...</option>
                      {stores.map(s => <option key={s} value={s}>{manual[s]?.nickname || `Store ${s.split('-').pop()}`}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-background p-4 rounded-xl border border-border">
                    {(['rent', 'util', 'maint', 'sga'] as const).map(metric => (
                      <div key={metric} className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase">{metric}</label>
                        <select
                          value={amortization[metric]}
                          onChange={e => setAmortization(prev => ({ ...prev, [metric]: e.target.value as AmortStrategy }))}
                          className="bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary w-full"
                        >
                          <option value="actual">Actuals (Spiky)</option>
                          <option value="monthly">Amortize Monthly (Smart)</option>
                          <option value="uniform">Amortize All Weeks (Average)</option>
                          <option value="runrate">True Run-Rate (Fixed Costs)</option>
                        </select>
                      </div>
                    ))}
                  </div>

                  <ScrollArea className="h-[300px] border border-border rounded-xl">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="text-xs text-muted-foreground uppercase bg-background/50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3">Period</th>
                          <th className="px-4 py-3 text-right">Rent</th>
                          <th className="px-4 py-3 text-right">Utilities</th>
                          <th className="px-4 py-3 text-right">Maintenance</th>
                          <th className="px-4 py-3 text-right">SG&A</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {computedData.map((p, i) => (
                          <tr key={i} className="hover:bg-muted/50 transition">
                            <td className="px-4 py-2">
                              <div className="font-medium text-foreground">{p.rawLabel}</div>
                              <div className="text-xs text-muted-foreground">Ends {p.weekEndDate}</div>
                            </td>
                            <td className="px-4 py-2 text-right">{formatCur(p.rent)}</td>
                            <td className="px-4 py-2 text-right">{formatCur(p.util)}</td>
                            <td className="px-4 py-2 text-right">{formatCur(p.maint)}</td>
                            <td className="px-4 py-2 text-right">{formatCur(p.sga)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>

                  {selectedStore && dbComparison.length > 0 && (
                    <div className="mt-8 space-y-4">
                      <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-primary" />
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Database vs QuickBooks Health Check</h3>
                      </div>
                      <ScrollArea className="h-[400px] border border-border rounded-xl">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                          <thead className="text-xs text-muted-foreground uppercase bg-background/50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3">Period</th>
                              <th className="px-4 py-3 text-right">Net Sales (DB)</th>
                              <th className="px-4 py-3 text-right">Net Sales (QB)</th>
                              <th className="px-4 py-3 text-right">Δ Sales</th>
                              <th className="px-4 py-3 text-right">COGS (DB)</th>
                              <th className="px-4 py-3 text-right">COGS (QB)</th>
                              <th className="px-4 py-3 text-right">Δ COGS</th>
                              <th className="px-4 py-3 text-right">Labor (DB)</th>
                              <th className="px-4 py-3 text-right">Labor (QB)</th>
                              <th className="px-4 py-3 text-right">Δ Labor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {dbComparison.map((p, i) => (
                              <tr key={i} className="hover:bg-muted/50 transition">
                                <td className="px-4 py-2">
                                  <div className="font-medium text-foreground">{p.rawLabel}</div>
                                  <div className="text-xs text-muted-foreground">Ends {p.weekEndDate}</div>
                                </td>
                                <td className="px-4 py-2 text-right">{formatCur(p.dbNetSales)}</td>
                                <td className="px-4 py-2 text-right">{formatCur(p.qbNetSales)}</td>
                                <td className={`px-4 py-2 text-right font-medium ${Math.abs(p.diffSales) > 100 ? 'text-rose-400' : 'text-green-500'}`}>
                                  {p.diffSales > 0 ? '+' : ''}{formatCur(p.diffSales)}
                                  <span className="text-[10px] ml-1 opacity-70">({(p.pctSales * 100).toFixed(1)}%)</span>
                                </td>
                                <td className="px-4 py-2 text-right">{formatCur(p.dbCogs)}</td>
                                <td className="px-4 py-2 text-right">{formatCur(p.qbCogs)}</td>
                                <td className={`px-4 py-2 text-right font-medium ${Math.abs(p.diffCogs) > 100 ? 'text-rose-400' : 'text-green-500'}`}>
                                  {p.diffCogs > 0 ? '+' : ''}{formatCur(p.diffCogs)}
                                  <span className="text-[10px] ml-1 opacity-70">({(p.pctCogs * 100).toFixed(1)}%)</span>
                                </td>
                                <td className="px-4 py-2 text-right">{formatCur(p.dbLabor)}</td>
                                <td className="px-4 py-2 text-right">{formatCur(p.qbLabor)}</td>
                                <td className={`px-4 py-2 text-right font-medium ${Math.abs(p.diffLabor) > 100 ? 'text-rose-400' : 'text-green-500'}`}>
                                  {p.diffLabor > 0 ? '+' : ''}{formatCur(p.diffLabor)}
                                  <span className="text-[10px] ml-1 opacity-70">({(p.pctLabor * 100).toFixed(1)}%)</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </ScrollArea>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-border">
                    <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-lg text-sm font-medium bg-secondary text-foreground hover:bg-secondary/80">Back</button>
                    <button 
                      onClick={() => setStep(3)} 
                      disabled={!selectedStore}
                      className="px-6 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Confirm Mapping
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                   <div className="bg-green-500/10 border border-green-500/20 text-green-500 p-12 rounded-xl text-center space-y-4">
                     <Save className="w-12 h-12 mx-auto opacity-80" />
                     <h3 className="text-xl font-bold">Ready to Commit Overrides</h3>
                     <p className="text-sm opacity-80 max-w-md mx-auto">
                       Applying {computedData.length} weekly adjustments to {manual[selectedStore]?.nickname || `Store ${selectedStore.split('-').pop()}`}.
                       <br /><br />These changes will automatically map to the daily P&L when computing profit periods on the dashboard.
                     </p>
                   </div>

                   <div className="flex justify-end gap-3 pt-6 border-t border-border">
                      <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-lg text-sm font-medium bg-secondary text-foreground hover:bg-secondary/80">Back</button>
                      <button 
                        onClick={handleSave} 
                        disabled={loading}
                        className="px-6 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                      >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? 'Saving...' : 'Save & Replace Overrides'}
                      </button>
                   </div>
                </div>
              )}
                </>
              ) : (
                <div className="space-y-8">
                  <div className="border border-dashed border-border rounded-xl p-16 text-center bg-background/50 flex flex-col items-center">
                    <Upload className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-xl font-medium text-foreground mb-2">Upload Quickbooks P&L for Comparison</h3>
                    <p className="text-sm text-muted-foreground mb-8 max-w-sm">
                      We'll map actuals alongside the database predictions exactly over your uploaded dates.
                    </p>
                    <input type="file" id="pl-upload-compare" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={loading} />
                    <button onClick={() => document.getElementById('pl-upload-compare')?.click()} className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-xl font-medium transition-colors cursor-pointer flex items-center gap-2" disabled={loading}>
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />} {loading ? 'Processing...' : 'Select File'}
                    </button>
                  </div>

                  {parsedData.length > 0 && (
                    <>
                      <div className="flex items-center gap-4 bg-secondary/50 p-4 rounded-xl border border-border">
                        <AlertCircle className="w-6 h-6 text-blue-400 shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-foreground">Extracted {parsedData.length} periods</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">Select a store to calculate the database's historical view over the exact same date span.</p>
                        </div>
                        <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)} className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary min-w-[200px]">
                          <option value="" disabled>Select Store...</option>
                          <option value="ALL">All Network Stores</option>
                          {stores.map(s => <option key={s} value={s}>{manual[s]?.nickname || `Store ${s.split('-').pop()}`}</option>)}
                        </select>
                      </div>

                      {selectedStore && aggregateComparison && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <h3 className="text-lg font-bold">Aggregate P&L Summary</h3>
                            <div className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-lg border border-border">
                              <div className="text-xs text-muted-foreground font-medium px-2">DB Window:</div>
                              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-background border border-border rounded-md px-2 py-1 text-xs focus:border-primary" />
                              <span className="text-muted-foreground text-xs">to</span>
                              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-background border border-border rounded-md px-2 py-1 text-xs focus:border-primary" />
                            </div>
                          </div>
                          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-sm text-left">
                              <thead className="text-xs text-muted-foreground uppercase bg-secondary/30 border-b border-border">
                                <tr>
                                  <th className="px-6 py-4">Account Category</th>
                                  <th className="px-6 py-4 text-right">QuickBooks (Actuals)</th>
                                  <th className="px-6 py-4 text-right">Database (Predicted)</th>
                                  <th className="px-6 py-4 text-right">Variance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60">
                                {([
                                  { label: 'Net Sales', qb: aggregateComparison.qbNetSales, db: aggregateComparison.dbNetSales, showIfZero: true },
                                  { label: 'Cost of Goods Sold', qb: aggregateComparison.qbCogs, db: aggregateComparison.dbCogs, showIfZero: true },
                                  { label: 'Total Labor', qb: aggregateComparison.qbLabor, db: aggregateComparison.dbLabor, showIfZero: true },
                                  { label: 'Store Rent', qb: aggregateComparison.qbRent, db: (manual[selectedStore]?.rent || 0) * parsedData.length, showIfZero: false },
                                  { label: 'Utilities', qb: aggregateComparison.qbUtil, db: (manual[selectedStore]?.util || 0) * parsedData.length, showIfZero: false },
                                  { label: 'Maintenance', qb: aggregateComparison.qbMaint, db: (manual[selectedStore]?.maint || 0) * parsedData.length, showIfZero: false },
                                  { label: 'SG&A', qb: aggregateComparison.qbSga, db: (manual[selectedStore]?.sga || 0) * parsedData.length, showIfZero: false }
                                ]).filter(item => item.showIfZero || item.qb > 0 || item.db > 0).map(row => {
                                  const diff = row.db - row.qb;
                                  const pct = row.qb > 0 ? Math.abs(diff) / row.qb : 0;
                                  return (
                                    <tr key={row.label} className="hover:bg-muted/50 transition">
                                      <td className="px-6 py-4 font-medium">{row.label}</td>
                                      <td className="px-6 py-4 text-right">{formatCur(row.qb)}</td>
                                      <td className="px-6 py-4 text-right">{formatCur(row.db)}</td>
                                      <td className={`px-6 py-4 text-right font-medium ${Math.abs(diff) > 100 ? 'text-rose-400' : 'text-green-500'}`}>
                                        {diff > 0 ? '+' : ''}{formatCur(diff)}
                                        <span className="text-[10px] ml-1.5 opacity-70">({(pct * 100).toFixed(1)}%)</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
