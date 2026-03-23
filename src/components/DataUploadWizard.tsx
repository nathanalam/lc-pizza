import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Loader2, ChevronRight, ChevronLeft, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STEPS = [
  { id: 'summary', name: '{Data Export} Summary', source: 'LCE Gateway Data Export' },
  { id: 'items', name: '{Data Export} Summary Items', source: 'LCE Gateway Data Export' },
  { id: 'txns', name: '{Data Export} Summary Transactions', source: 'LCE Gateway Data Export' },
  { id: 'sales', name: '{Data Export} Summary Sales', source: 'LCE Gateway Data Export' },
  { id: 'inventory', name: '{Data Export} Inventory', source: 'LCE Gateway Data Export' },
  { id: 'invoices', name: 'Altametrics Food Invoice', source: 'Altametrics' },
  { id: 'labor', name: 'Altametrics Labor', source: 'Altametrics' },
];

interface DataUploadWizardProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  onSuccess: () => void;
}

export default function DataUploadWizard({ isOpen, onClose, token, onSuccess }: DataUploadWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState<Record<string, any[]>>({
    summary: [], items: [], txns: [], sales: [], inventory: [], invoices: [], labor: []
  });
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setLoading(true);
    const stepObj = STEPS[currentStep];
    const fileType = stepObj.id;

    try {
      let combinedData: any[] = [];

      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        let headerIdx = -1;
        // Find header row based on known column names for robust extraction
        for (let i = 0; i < Math.min(20, rows.length); i++) {
          if (!rows[i] || !rows[i].length) continue;
          
          if (fileType === 'labor' && rows[i].includes('Total Pay')) {
            headerIdx = i; break;
          } else if (fileType === 'invoices' && rows[i].includes('Invoice Total')) {
            headerIdx = i; break;
          } else if (
             rows[i].includes('Franchise Store') || 
             rows[i].includes('Store Number') ||
             rows[i].includes('Store')
          ) {
            headerIdx = i; break;
          }
        }

        if (headerIdx !== -1) {
          const headers = rows[headerIdx];
          for (let i = headerIdx + 1; i < rows.length; i++) {
            if (!rows[i] || !rows[i].length) continue;
            let rowObj: Record<string, any> = {};
            let hasData = false;
            
            headers.forEach((header: string, index: number) => {
              if (header) {
                let val = rows[i][index];
                
                // Format dates safely
                const lowerHeader = header.toLowerCase();
                const isDateCol = lowerHeader.includes('date');
                
                if (val instanceof Date) {
                  if (isDateCol) {
                    val = val.toISOString().split('T')[0];
                  } else {
                    // It's not supposed to be a date (like Store ID), so we can stringify it or keep rough value
                    // e.g. "10-01" became Oct 1st
                    val = isNaN(val.getTime()) ? '' : val.toISOString().split('T')[0];
                  }
                } else if (isDateCol && val) {
                  try { 
                    const parsed = new Date(val);
                    if (!isNaN(parsed.getTime())) {
                       val = parsed.toISOString().split('T')[0]; 
                    }
                  } catch { }
                }
                
                if (val !== undefined && val !== null && val !== '') hasData = true;
                rowObj[header] = val;
              }
            });

            if (!hasData) continue;

            // Standardize store ID across different file formats
            let storeRaw = rowObj['Franchise Store'] || rowObj['Store Number'] || rowObj['Store'];
            if (storeRaw) {
               let str = storeRaw.toString().trim();
               // Excel can mistakenly parse store formats like "3659-08" as DATES (e.g. August, 3659)
               // which our code converts to "3659-08-01".
               let finalNum = "";
               if (str.match(/^\d{4}-\d{2}-01$/)) { 
                 const parts = str.split('-');
                 finalNum = parts[1];
               } else if (str.match(/^\d{4}-\d{1,2}$/)) {
                 const parts = str.split('-');
                 finalNum = parts[1];
               } else {
                 finalNum = str.split('-').pop() || str;
               }
               rowObj['Franchise Store'] = finalNum.padStart(5, '0');
            }
            if (rowObj['Franchise Store']) {
               combinedData.push(rowObj);
            }
          }
        } else {
          toast({ title: 'Invalid File Format', description: `Could not find header row for ${stepObj.name}.`, variant: 'destructive' })
        }
      }

      setParsedData(prev => ({ ...prev, [fileType]: [...prev[fileType], ...combinedData] }));
      setCompletedSteps(prev => ({ ...prev, [currentStep]: true }));
      toast({ title: 'File Parsed', description: `Parsed ${combinedData.length} rows for ${stepObj.name}` });

    } catch (err: any) {
      toast({ title: 'Error processing files', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      const dailyMap: Record<string, any> = {};
      
      const registerDay = (row: any, type: string) => {
        // Find best column for date
        let d = row['Business Date'] || row['Date'] || row['Applied Delivery Date'];
        if (!d) d = '1970-01-01'; // Fallback
        
        if (!dailyMap[d]) {
          dailyMap[d] = { business_date: d, data: { summary: [], items: [], txns: [], sales: [], inventory: [], invoices: [], labor: [] } };
        }
        dailyMap[d].data[type].push(row);
      };

      parsedData.summary.forEach(r => registerDay(r, 'summary'));
      parsedData.items.forEach(r => registerDay(r, 'items'));
      parsedData.txns.forEach(r => registerDay(r, 'txns'));
      parsedData.sales.forEach(r => registerDay(r, 'sales'));
      parsedData.inventory.forEach(r => registerDay(r, 'inventory'));
      parsedData.invoices.forEach(r => registerDay(r, 'invoices'));
      parsedData.labor.forEach(r => registerDay(r, 'labor'));

      const reportsToUpload = Object.values(dailyMap);

      if (reportsToUpload.length === 0) {
        toast({ title: 'No Data', description: 'No valid data found to upload.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: reportsToUpload })
      });
      if (!res.ok) throw new Error((await res.json()).error);

      toast({ title: 'Upload Successful', description: 'Data processed and saved to database' });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: 'Upload Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-card w-full max-w-2xl border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Data Upload Wizard</h2>
            <p className="text-sm text-muted-foreground mt-1">Extract specific file types sequentially.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <div className="flex gap-4">
            <div className="w-1/3 border-r border-border pr-4">
              <nav className="space-y-1">
                {STEPS.map((step, idx) => (
                  <button
                    key={step.id}
                    onClick={() => setCurrentStep(idx)}
                    className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${currentStep === idx ? 'bg-primary/20 text-primary font-bold' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    <span className="truncate">{step.name}</span>
                    {completedSteps[idx] && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 ml-2" />}
                  </button>
                ))}
              </nav>
            </div>
            
            <div className="w-2/3 pl-2 flex flex-col items-center justify-center text-center">
              <ShieldAlert className="w-10 h-10 text-primary/50 mb-4" />
              <h3 className="text-lg font-bold mb-1">{STEPS[currentStep].name}</h3>
              <p className="text-sm text-muted-foreground mb-6">Source: {STEPS[currentStep].source}</p>
              
              <label className="cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-6 rounded-lg transition-colors flex items-center gap-2">
                 {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                 {loading ? 'Processing...' : `Upload ${STEPS[currentStep].name} (.xlsx, .csv)`}
                 <input type="file" multiple accept=".csv,.xlsx" className="hidden" onChange={handleFileUpload} disabled={loading} />
              </label>

              {parsedData[STEPS[currentStep].id].length > 0 && (
                 <div className="mt-6 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-500 text-sm flex items-center gap-2">
                   <CheckCircle2 className="w-4 h-4" />
                   Loaded {parsedData[STEPS[currentStep].id].length} records
                 </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-muted/30 flex justify-between items-center">
           <button
             onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
             disabled={currentStep === 0}
             className="px-4 py-2 border border-border rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-muted flex items-center gap-1"
           >
             <ChevronLeft className="w-4 h-4" /> Prev
           </button>
           
           {currentStep < STEPS.length - 1 ? (
             <button
               onClick={() => setCurrentStep(prev => Math.min(STEPS.length - 1, prev + 1))}
               className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 flex items-center gap-1"
             >
               Next <ChevronRight className="w-4 h-4" />
             </button>
           ) : (
             <button
               onClick={handleFinish}
               disabled={loading}
               className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 flex items-center gap-2"
             >
               {loading && <Loader2 className="w-4 h-4 animate-spin" />}
               Save to Database
             </button>
           )}
        </div>
      </div>
    </div>
  );
}
