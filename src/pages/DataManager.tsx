import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Save, Trash2, ArrowLeft, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = ['summary', 'items', 'txns', 'sales', 'inventory', 'invoices', 'labor'] as const;

export default function DataManager() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<typeof CATEGORIES[number]>('summary');
  
  const [localArray, setLocalArray] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) navigate('/login');
    else if (!user.is_admin) navigate('/dashboard');
    else fetchData();
  }, [user, navigate, token]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      const sorted = (data.reports || []).sort((a: any, b: any) => b.business_date.localeCompare(a.business_date));
      setReports(sorted);
      if (sorted.length > 0 && !selectedDate) {
        setSelectedDate(sorted[0].business_date);
      }
    } catch (err: any) {
      toast({ title: 'Error fetching data', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const currentReport = useMemo(() => reports.find(r => r.business_date === selectedDate), [reports, selectedDate]);

  useEffect(() => {
    setSelectedRows(new Set());
    if (currentReport && currentReport.data) {
      const arr = currentReport.data[activeTab] || [];
      // create a deep copy for safe local editing
      setLocalArray(JSON.parse(JSON.stringify(arr)));
    } else {
      setLocalArray([]);
    }
  }, [selectedDate, activeTab, currentReport]);

  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    localArray.forEach(obj => {
      Object.keys(obj).forEach(k => keys.add(k));
    });
    return Array.from(keys);
  }, [localArray]);

  const updateCell = (rowIndex: number, key: string, value: string) => {
    setLocalArray(prev => {
      const newArr = [...prev];
      let parsedValue: any = value;
      if (!isNaN(Number(value)) && value.trim() !== '') {
        parsedValue = Number(value);
      }
      newArr[rowIndex] = { ...newArr[rowIndex], [key]: parsedValue };
      return newArr;
    });
  };

  const addRow = () => {
    const newRow: Record<string, any> = {};
    allKeys.forEach(k => { newRow[k] = ''; });
    setLocalArray(prev => [newRow, ...prev]);
  };

  const removeRow = (rowIndex: number) => {
    setLocalArray(prev => prev.filter((_, i) => i !== rowIndex));
  };

  const toggleRowSelection = (rIdx: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rIdx)) next.delete(rIdx);
      else next.add(rIdx);
      return next;
    });
  };

  const handleBulkRemoveRows = () => {
    if (selectedRows.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedRows.size} selected records?`)) return;
    setLocalArray(prev => prev.filter((_, i) => !selectedRows.has(i)));
    setSelectedRows(new Set());
  };
  
  const handleSelectAllRows = () => {
    if (selectedRows.size === localArray.length && localArray.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(localArray.map((_, i) => i)));
    }
  };

  const toggleDaySelection = (day: string) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleBulkDeleteDays = async () => {
    if (selectedDays.size === 0) return;
    if (!confirm(`Are you sure you want to OVERWRITE AND DELETE ${selectedDays.size} days? This cannot be undone.`)) return;

    try {
      setLoading(true);
      const res = await fetch('/api/data', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: Array.from(selectedDays) })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      
      toast({ title: 'Success', description: `Deleted ${selectedDays.size} days` });
      
      if (selectedDate && selectedDays.has(selectedDate)) setSelectedDate(null);
      setSelectedDays(new Set());
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error deleting days', description: err.message, variant: 'destructive' });
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentReport) return;
    
    setIsSaving(true);
    try {
      const updatedData = { ...currentReport.data, [activeTab]: localArray };
      const reportPayload = {
        business_date: currentReport.business_date,
        data: updatedData
      };

      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: [reportPayload] })
      });

      if (!res.ok) throw new Error((await res.json()).error);
      
      toast({ title: 'Success', description: `Updated ${activeTab} for ${currentReport.business_date}` });
      
      setReports(prev => prev.map(r => r.business_date === currentReport.business_date ? { ...r, data: updatedData } : r));
    } catch (err: any) {
      toast({ title: 'Error saving', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

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
               Data Manager
            </h1>
            <p className="text-muted-foreground text-xs">Directly manipulate row-level database records.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setLocalArray(JSON.parse(JSON.stringify(currentReport?.data?.[activeTab] || [])))}
            className="px-4 py-2 text-sm font-medium hover:bg-secondary text-foreground rounded-lg border border-border transition-colors"
          >
            Discard Changes
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 flex items-center gap-2 transition"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save {activeTab.toUpperCase()}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-1/5 min-w-[200px] border-r border-border bg-card/50 flex flex-col z-10">
          <div className="p-3 border-b border-border flex justify-between items-center bg-muted/10">
            <span className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Business Dates</span>
            {selectedDays.size > 0 && (
              <button onClick={handleBulkDeleteDays} className="text-rose-500 hover:text-rose-400 text-xs font-bold transition-colors">
                 Delete ({selectedDays.size})
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {loading && reports.length === 0 ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : reports.map(r => (
              <div key={r.business_date} className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${selectedDate === r.business_date ? 'bg-primary/20' : 'hover:bg-muted'}`}>
                <input 
                  type="checkbox" 
                  checked={selectedDays.has(r.business_date)}
                  onChange={() => toggleDaySelection(r.business_date)}
                  className="rounded border-border bg-background flex-shrink-0 cursor-pointer w-4 h-4"
                />
                <button
                  onClick={() => setSelectedDate(r.business_date)}
                  className={`flex-1 text-left text-sm truncate ${selectedDate === r.business_date ? 'text-primary font-bold' : 'text-foreground'}`}
                >
                  {r.business_date === '1970-01-01' ? 'Unknown (1970-01-01)' : r.business_date}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
          <div className="flex overflow-x-auto border-b border-border bg-card/50 px-2 pt-2 custom-scrollbar flex-none">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === cat ? 'border-primary text-primary bg-background rounded-t-lg shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
              >
                {cat.toUpperCase()}
                <span className="ml-2 text-xs bg-secondary/50 px-2 py-0.5 rounded-full text-foreground font-mono">
                  {currentReport?.data?.[cat]?.length || 0}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4 custom-scrollbar">
            {!selectedDate ? (
               <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Select a date to begin</div>
            ) : (
              <div className="h-full flex flex-col space-y-4">
                 <div className="flex justify-between items-center bg-muted/40 p-3 rounded-lg border border-border flex-none">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-foreground">Editing <strong className="text-primary">{localArray.length}</strong> records</span>
                      {selectedRows.size > 0 && (
                        <button onClick={handleBulkRemoveRows} className="flex items-center gap-1.5 text-xs font-semibold bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-3 py-1.5 rounded-md border border-rose-500/20 transition-colors">
                           <Trash2 className="w-3.5 h-3.5" /> Delete {selectedRows.size} Records
                        </button>
                      )}
                    </div>
                    <button onClick={addRow} className="flex items-center gap-1.5 text-sm font-medium bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-md border border-border transition-colors shadow-sm">
                       <PlusCircle className="w-4 h-4 text-emerald-500" /> Add Row
                    </button>
                 </div>

                 {localArray.length === 0 ? (
                   <div className="flex-1 flex items-center justify-center">
                     <div className="text-center py-12 px-8 text-muted-foreground border-2 border-dashed border-border rounded-xl bg-card/50">
                       <p className="mb-2">No records for this category.</p>
                       <button onClick={addRow} className="text-primary hover:underline text-sm font-medium">Click here to add the first row.</button>
                     </div>
                   </div>
                 ) : (
                   <div className="rounded-xl border border-border overflow-hidden bg-card flex-1 flex flex-col shadow-sm">
                     <div className="overflow-auto custom-scrollbar flex-1">
                       <table className="w-full text-sm text-left whitespace-nowrap">
                         <thead className="bg-muted text-xs uppercase text-muted-foreground sticky top-0 z-20 shadow-sm">
                            <tr>
                              <th className="px-3 py-3 w-10 text-center sticky left-0 bg-muted z-30 border-r border-border">
                                <input
                                   type="checkbox"
                                   checked={selectedRows.size === localArray.length && localArray.length > 0}
                                   onChange={handleSelectAllRows}
                                   className="rounded border-border bg-background cursor-pointer w-4 h-4"
                                />
                              </th>
                              <th className="px-3 py-3 w-10 text-center sticky left-10 bg-muted z-30 border-r border-border">Act</th>
                              {allKeys.map(k => (
                                <th key={k} className="px-4 py-3 font-medium border-b border-border">{k}</th>
                              ))}
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-border">
                            {localArray.map((row, rIdx) => (
                               <tr key={rIdx} className={`transition-colors group ${selectedRows.has(rIdx) ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                                  <td className="px-3 py-1.5 sticky left-0 bg-card group-hover:bg-muted/30 z-10 border-r border-border text-center">
                                    <input
                                       type="checkbox"
                                       checked={selectedRows.has(rIdx)}
                                       onChange={() => toggleRowSelection(rIdx)}
                                       className="rounded border-border bg-background cursor-pointer w-4 h-4"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5 sticky left-10 bg-card group-hover:bg-muted/30 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-center">
                                     <button onClick={() => removeRow(rIdx)} className="p-1.5 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-md transition-colors" title="Delete record">
                                        <Trash2 className="w-4 h-4" />
                                     </button>
                                  </td>
                                  {allKeys.map(k => (
                                     <td key={k} className="px-2 py-1.5 min-w-[150px]">
                                        <input
                                          type="text"
                                          defaultValue={row[k] ?? ''}
                                          onBlur={(e) => {
                                             if (e.target.value != String(row[k] ?? '')) updateCell(rIdx, k, e.target.value);
                                          }}
                                          className="w-full bg-transparent border border-transparent hover:border-border/50 focus:border-primary px-2 py-1.5 rounded transition-all focus:outline-none focus:bg-background shadow-none focus:shadow-sm"
                                        />
                                     </td>
                                  ))}
                               </tr>
                            ))}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
