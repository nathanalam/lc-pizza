import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Upload, AlertCircle, Save, CalendarIcon, ChevronRight } from 'lucide-react';
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

type PandLAuditWizardProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  stores: string[];
  manual: Record<string, StoreManualAdjustment>;
  token: string | null;
  onSaved: () => void;
};

// Map commonly seen Quickbooks P&L account names to our manual categories
const KEY_MAP: Record<string, keyof StoreManualAdjustment> = {
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
  'Contract Labor': 'sga'
};

export default function PandLAuditWizard({ isOpen, onOpenChange, stores, manual, token, onSaved }: PandLAuditWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [parsedData, setParsedData] = useState<{ weekEndDate: string; rawLabel: string; rent: number; util: number; maint: number; sga: number; payouts: number; capex: number }[]>([]);
  const [loading, setLoading] = useState(false);

  type AmortStrategy = 'actual' | 'monthly' | 'uniform';
  const [amortization, setAmortization] = useState<Record<'rent' | 'util' | 'maint' | 'sga', AmortStrategy>>({
    rent: 'monthly',
    util: 'monthly',
    maint: 'actual',
    sga: 'actual'
  });

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

      // Find the header row by looking for strings that match a date range pattern
      // e.g., "Dec 23 - Dec 28 2025" or similar
      const dateRangeRegex = /([A-Za-z]{3}\s+\d{1,2}(?:\s+\d{4})?)\s*-\s*([A-Za-z]{3}\s+\d{1,2}(?:\s+\d{4})?)/;
      
      let headerRowIndex = -1;
      let dateCols: { colIndex: number; rawLabel: string; weekEndDate: string }[] = [];

      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if (!row) continue;
        
        let foundDate = false;
        row.forEach((cell, idx) => {
          if (typeof cell === 'string' && dateRangeRegex.test(cell)) {
             foundDate = true;
             const match = cell.match(dateRangeRegex);
             if (match && match[2]) {
                const endDateStr = match[2];
                const d = new Date(endDateStr);
                if (!isNaN(d.getTime())) {
                  dateCols.push({
                    colIndex: idx,
                    rawLabel: cell,
                    weekEndDate: d.toISOString().split('T')[0]
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
        throw new Error("Could not find date range columns (e.g. 'Jan 5 - Jan 11 2026') in the first 20 rows of the sheet.");
      }

      // Now map expenses
      // For each period, aggregate rent, util, maint, sga
      const periodsMap: Record<string, any> = {};
      dateCols.forEach(dc => {
        periodsMap[dc.weekEndDate] = {
           weekEndDate: dc.weekEndDate,
           rawLabel: dc.rawLabel,
           rent: 0, util: 0, maint: 0, sga: 0, payouts: 0, capex: 0
        };
      });

      // Start reading rows below header
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
         const row = rows[i];
         const accountName = String(row[0] || '').trim();
         
         if (!accountName || accountName === 'Total' || accountName.toLowerCase().includes('total for')) continue;

         const cat = KEY_MAP[accountName];
         if (!cat) continue;

         // Read the values for each date column
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
       } else if (strategy === 'monthly') {
         // Group by YYYY-MM
         const monthlyTotals: Record<string, number> = {};
         const monthlyCounts: Record<string, number> = {};
         
         result.forEach(p => {
           const yyyymm = p.weekEndDate.substring(0, 7);
           monthlyTotals[yyyymm] = (monthlyTotals[yyyymm] || 0) + p[metric];
           monthlyCounts[yyyymm] = (monthlyCounts[yyyymm] || 0) + 1;
         });
         
         result.forEach(p => {
           const yyyymm = p.weekEndDate.substring(0, 7);
           p[metric] = monthlyTotals[yyyymm] / monthlyCounts[yyyymm];
         });
       }
    });
    
    return result;
  }, [parsedData, amortization]);

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
      onSaved();
      onOpenChange(false);
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

  return (
    <Dialog open={isOpen} onOpenChange={open => {
      onOpenChange(open);
      if (!open) { setTimeout(() => { setStep(1); setParsedData([]); setSelectedStore(''); }, 200); }
    }}>
      <DialogContent className="sm:max-w-[800px] border-border bg-card text-foreground">
        <DialogHeader>
          <DialogTitle>P&L Audit Wizard</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Map Quickbooks P&L actuals over exact time periods to adjust the operations dashboard dynamically.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="flex items-center gap-2 mb-6">
            <div className={`flex flex-col flex-1 border-b-2 pb-2 ${step >= 1 ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
              <span className="text-xs font-bold uppercase tracking-wider">Step 1</span>
              <span className="text-sm font-medium">Upload File</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
            <div className={`flex flex-col flex-1 border-b-2 pb-2 ${step >= 2 ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
              <span className="text-xs font-bold uppercase tracking-wider">Step 2</span>
              <span className="text-sm font-medium">Select Store & Review</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
            <div className={`flex flex-col flex-1 border-b-2 pb-2 ${step >= 3 ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
              <span className="text-xs font-bold uppercase tracking-wider">Step 3</span>
              <span className="text-sm font-medium">Confirm Setup</span>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div className="border border-dashed border-border rounded-xl p-12 text-center bg-background/50 flex flex-col items-center">
                <Upload className="w-10 h-10 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Upload Quickbooks P&L</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm">
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
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-lg font-medium transition-colors cursor-pointer"
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Select File'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
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
                      <option value="monthly">Amortize Monthly</option>
                      <option value="uniform">Amortize All Weeks</option>
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

              <div className="flex justify-end gap-3">
                <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-foreground hover:bg-secondary/80">Back</button>
                <button 
                  onClick={() => setStep(3)} 
                  disabled={!selectedStore}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Confirm Mapping
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
               <div className="bg-green-500/10 border border-green-500/20 text-green-500 p-6 rounded-xl text-center space-y-2">
                 <Save className="w-10 h-10 mx-auto opacity-80" />
                 <h3 className="text-lg font-bold">Ready to Commit Overrides</h3>
                 <p className="text-sm opacity-80 max-w-sm mx-auto">
                   Applying {computedData.length} weekly adjustments to {manual[selectedStore]?.nickname || `Store ${selectedStore.split('-').pop()}`}.
                   <br />These changes will automatically map to the daily P&L when computing profit periods.
                 </p>
               </div>

               <div className="flex justify-end gap-3">
                  <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-foreground hover:bg-secondary/80">Back</button>
                  <button 
                    onClick={handleSave} 
                    disabled={loading}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                  >
                    {loading ? 'Saving...' : 'Save & Replace Overrides'}
                  </button>
               </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
