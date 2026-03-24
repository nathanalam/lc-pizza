import React, { useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Printer } from 'lucide-react';
import SVGLineChart, { ChartSeries } from '@/components/SVGLineChart';

type StoreMixRow = {
  s: string;
  net: number;
  cogs: number;
  labor: number;
  delFee: number;
  royaltyFee: number;
  rentUtil: number;
  otherExp: number;
  op: number;
  marg: string;
};

type TopProduct = {
  item: string;
  qty: number;
  rev: number;
};

type ExportRow = {
  s: string;
  weekEndDateStr: string;
  netSales: number;
  custCount: number;
};

type DailyChartData = {
  dates: string[];
  storeDaily: Record<string, Record<string, { gross: number; net: number; opProfit: number }>>;
};

type Stats = {
  tGross: number;
  tTax: number;
  tNet: number;
  cogs: number;
  laborCost: number;
  tTxns: number;
  tVar: number;
  mDel: number;
  isDelEstimated: boolean;
  mRoy: number;
  mRent: number;
  mUtil: number;
  mMaint: number;
  mSga: number;
  mPayouts: number;
  mCapex: number;
  opProfit: number;
  margin: number;
  storeMix: StoreMixRow[];
  topProducts: TopProduct[];
  exportRows: ExportRow[];
  dailyChartData: DailyChartData;
};

type Manual = Record<string, { nickname?: string }>;

interface PrintReportProps {
  isOpen: boolean;
  onClose: () => void;
  stats: Stats;
  manual: Manual;
  dateRange: { start: string; end: string };
  currentStore: string;
  formatCur: (n: number) => string;
  DEL_EST_PCT: number;
}

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
  '#ec4899', '#14b8a6',
];

export default function PrintReport({
  isOpen,
  onClose,
  stats,
  manual,
  dateRange,
  currentStore,
  formatCur,
  DEL_EST_PCT,
}: PrintReportProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const storeName = (id: string) => manual[id]?.nickname || `Store ${id.split('-').pop()}`;

  const handlePrint = () => window.print();

  const pl = [
    { l: 'Gross Sales', v: stats.tGross, positive: true },
    { l: 'Sales Tax', v: -stats.tTax },
    { l: 'Net Sales', v: stats.tNet, bold: true, border: true },
    { l: 'COGS', v: -stats.cogs },
    ...(stats.laborCost > 0 ? [{ l: 'Labor', v: -stats.laborCost }] : []),
    { l: stats.isDelEstimated ? `3rd Party Del. Fees (Est. ${DEL_EST_PCT * 100}%)` : '3rd Party Del. Fees (Actual)', v: -stats.mDel },
    { l: 'Franchise & Ad Fees', v: -stats.mRoy },
    { l: 'Rent', v: -stats.mRent },
    { l: 'Utilities', v: -stats.mUtil },
    { l: 'Maintenance', v: -stats.mMaint },
    { l: 'Admin / SG&A', v: -stats.mSga },
    { l: 'Cash Payouts', v: -stats.mPayouts },
    { l: 'Capex', v: -stats.mCapex, border: true },
    { l: 'Operating Profit', v: stats.opProfit, bold: true, highlight: true },
    { l: 'OP Margin', v: null, pct: stats.margin },
  ];

  const top20 = stats.topProducts.slice(0, 20);

  // Build chart series per store
  const { dates, storeDaily } = stats.dailyChartData;
  const chartStores = Object.keys(storeDaily).sort();

  const grossSeries: ChartSeries[] = chartStores.map((s, i) => ({
    name: storeName(s),
    color: CHART_COLORS[i % CHART_COLORS.length],
    data: Object.fromEntries(
      Object.entries(storeDaily[s]).map(([d, v]) => [d, v.gross])
    ),
  }));

  const netSeries: ChartSeries[] = chartStores.map((s, i) => ({
    name: storeName(s),
    color: CHART_COLORS[i % CHART_COLORS.length],
    data: Object.fromEntries(
      Object.entries(storeDaily[s]).map(([d, v]) => [d, v.net])
    ),
  }));

  const opSeries: ChartSeries[] = chartStores.map((s, i) => ({
    name: storeName(s),
    color: CHART_COLORS[i % CHART_COLORS.length],
    data: Object.fromEntries(
      Object.entries(storeDaily[s]).map(([d, v]) => [d, v.opProfit])
    ),
  }));

  const reportBody = (
    <div className="p-8 bg-white text-black font-sans">
            {/* Report Header */}
            <div className="mb-6 pb-4 border-b-2 border-gray-300">
              <h1 className="text-2xl font-bold text-gray-900">Operations &amp; P&amp;L Report</h1>
              <div className="flex gap-6 mt-1 text-sm text-gray-500">
                <span>
                  Period: <strong className="text-gray-800">{dateRange.start} – {dateRange.end}</strong>
                </span>
                <span>
                  Store:{' '}
                  <strong className="text-gray-800">
                    {currentStore === 'ALL' ? 'All Stores (Aggregate)' : storeName(currentStore)}
                  </strong>
                </span>
                <span className="ml-auto text-gray-400">Generated {new Date().toLocaleDateString()}</span>
              </div>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-5 gap-3 mb-6">
              {[
                { label: 'Gross Sales', val: formatCur(stats.tGross) },
                { label: 'Net Sales', val: formatCur(stats.tNet) },
                { label: 'Op. Profit', val: formatCur(stats.opProfit), color: stats.opProfit >= 0 ? '#166534' : '#be123c' },
                { label: 'Transactions', val: stats.tTxns.toLocaleString() },
                { label: 'OP Margin', val: `${stats.margin.toFixed(1)}%`, color: stats.margin >= 0 ? '#166534' : '#be123c' },
              ].map((k, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 text-center bg-gray-50">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{k.label}</p>
                  <p className="text-lg font-bold mt-0.5" style={{ color: k.color || '#111827' }}>{k.val}</p>
                </div>
              ))}
            </div>

            {/* Two column: P&L + Weekly Sales */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* P&L Summary */}
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3 border-b border-gray-200 pb-1">
                  P&amp;L Summary
                </h2>
                <table className="w-full text-sm">
                  <tbody>
                    {pl.map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          borderTop: row.border ? '1px solid #e5e7eb' : undefined,
                          borderBottom: row.border ? '1px solid #e5e7eb' : undefined,
                          backgroundColor: row.highlight ? '#f0fdf4' : undefined,
                        }}
                      >
                        <td className="py-1 pr-4" style={{ fontWeight: row.bold ? 700 : 400, color: '#374151' }}>
                          {row.l}
                        </td>
                        <td
                          className="py-1 text-right"
                          style={{
                            fontWeight: row.bold ? 700 : 400,
                            color: row.v !== null && row.v !== undefined && row.v < 0
                              ? '#be123c'
                              : row.highlight
                              ? (stats.opProfit >= 0 ? '#166534' : '#be123c')
                              : '#111827',
                          }}
                        >
                          {row.pct !== undefined
                            ? `${row.pct.toFixed(1)}%`
                            : row.v !== null && row.v !== undefined
                            ? formatCur(Math.abs(row.v as number))
                            : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Weekly Sales per Store */}
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3 border-b border-gray-200 pb-1">
                  Weekly Sales per Store
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase">
                      <th className="text-left py-1 pr-2">Store</th>
                      <th className="text-right py-1 pr-2">Week End</th>
                      <th className="text-right py-1 pr-2">Net Sales</th>
                      <th className="text-right py-1">Txns</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.exportRows.map((r) => (
                      <tr key={r.s}>
                        <td className="py-1 pr-2 font-medium">{storeName(r.s)}</td>
                        <td className="py-1 pr-2 text-right text-gray-500">{r.weekEndDateStr}</td>
                        <td className="py-1 pr-2 text-right font-medium">{formatCur(r.netSales)}</td>
                        <td className="py-1 text-right text-gray-600">{Math.round(r.custCount).toLocaleString()}</td>
                      </tr>
                    ))}
                    {stats.exportRows.length === 0 && (
                      <tr><td colSpan={4} className="py-4 text-center text-gray-400 text-xs">No data</td></tr>
                    )}
                  </tbody>
                  {stats.exportRows.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 font-bold">
                        <td className="py-1 pr-2">Total</td>
                        <td />
                        <td className="py-1 pr-2 text-right">{formatCur(stats.exportRows.reduce((s, r) => s + r.netSales, 0))}</td>
                        <td className="py-1 text-right">{Math.round(stats.exportRows.reduce((s, r) => s + r.custCount, 0)).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Daily Trend Charts */}
            {dates.length > 0 && (
              <div className="mb-6 pb-6 border-b border-gray-200">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-4 border-b border-gray-200 pb-1">
                  Daily Trends — by Store
                </h2>
                <div className="space-y-5">
                  <SVGLineChart title="Gross Sales" dates={dates} series={grossSeries} />
                  <SVGLineChart title="Net Sales" dates={dates} series={netSeries} />
                  <SVGLineChart title="Operating Profit (Estimated)" dates={dates} series={opSeries} />
                </div>
              </div>
            )}

            {/* Store Financial Mix — full width, no scroll */}
            <div className="mb-6" style={{ pageBreakInside: 'avoid' }}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3 border-b border-gray-200 pb-1">
                Individual Store Financial Mix
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase bg-gray-50">
                    <th className="text-left px-2 py-2">Store</th>
                    <th className="text-right px-2 py-2">Net Sales</th>
                    <th className="text-right px-2 py-2">COGS</th>
                    {stats.laborCost > 0 && <th className="text-right px-2 py-2">Labor</th>}
                    <th className="text-right px-2 py-2">Del. Fees</th>
                    <th className="text-right px-2 py-2">Fran. Fee</th>
                    <th className="text-right px-2 py-2">Rent/Util</th>
                    <th className="text-right px-2 py-2">Other Exp</th>
                    <th className="text-right px-2 py-2">Op Profit</th>
                    <th className="text-right px-2 py-2">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.storeMix.map((row) => (
                    <tr key={row.s}>
                      <td className="px-2 py-1.5 font-medium">{storeName(row.s)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(row.net)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(row.cogs)}</td>
                      {stats.laborCost > 0 && <td className="px-2 py-1.5 text-right">{formatCur(row.labor)}</td>}
                      <td className="px-2 py-1.5 text-right text-red-700">{formatCur(row.delFee)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(row.royaltyFee)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(row.rentUtil)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(row.otherExp)}</td>
                      <td className={`px-2 py-1.5 text-right font-bold ${row.op >= 0 ? 'text-green-800' : 'text-red-700'}`}>{formatCur(row.op)}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{row.marg}%</td>
                    </tr>
                  ))}
                </tbody>
                {stats.storeMix.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 font-bold bg-gray-50">
                      <td className="px-2 py-1.5">Total</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(stats.tNet)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(stats.cogs)}</td>
                      {stats.laborCost > 0 && <td className="px-2 py-1.5 text-right">{formatCur(stats.laborCost)}</td>}
                      <td className="px-2 py-1.5 text-right text-red-700">{formatCur(stats.mDel)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(stats.mRoy)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(stats.mRent + stats.mUtil)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCur(stats.mMaint + stats.mSga + stats.mPayouts + stats.mCapex)}</td>
                      <td className={`px-2 py-1.5 text-right font-bold ${stats.opProfit >= 0 ? 'text-green-800' : 'text-red-700'}`}>{formatCur(stats.opProfit)}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{stats.margin.toFixed(1)}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Top 20 Items */}
            <div style={{ pageBreakInside: 'avoid' }}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3 border-b border-gray-200 pb-1">
                Top 20 Most Popular Items
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase bg-gray-50">
                    <th className="text-left px-2 py-2">#</th>
                    <th className="text-left px-2 py-2">Item</th>
                    <th className="text-right px-2 py-2">Qty Sold</th>
                    <th className="text-right px-2 py-2">Gross Revenue</th>
                    <th className="text-right px-2 py-2">% of Item Rev</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {top20.map((p, i) => {
                    const totalItemRev = stats.topProducts.reduce((s, x) => s + x.rev, 0);
                    return (
                      <tr key={p.item}>
                        <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                        <td className="px-2 py-1.5 font-medium">{p.item}</td>
                        <td className="px-2 py-1.5 text-right">{Math.round(p.qty).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right">{formatCur(p.rev)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">
                          {totalItemRev > 0 ? ((p.rev / totalItemRev) * 100).toFixed(1) : '0.0'}%
                        </td>
                      </tr>
                    );
                  })}
                  {top20.length === 0 && (
                    <tr><td colSpan={5} className="py-4 text-center text-gray-400 text-xs">No item data in this range</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 flex justify-between">
              <span>LC Pizza Operations Dashboard</span>
              <span>Confidential — Internal Use Only</span>
            </div>
          </div>
  );

  return (
    <>
      {/* Screen overlay — modal preview */}
      <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-8">
        <div className="bg-white text-black rounded-xl shadow-2xl w-full max-w-4xl mx-4 relative">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl sticky top-0 z-10">
            <h2 className="text-base font-bold text-gray-800">Print Report Preview</h2>
            <div className="flex gap-3">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                <Printer className="w-4 h-4" /> Print / Save as PDF
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm px-3 py-2 rounded-lg border border-gray-200 transition"
              >
                <X className="w-4 h-4" /> Close
              </button>
            </div>
          </div>
          {/* Preview */}
          {reportBody}
        </div>
      </div>

      {/* Print portal — direct child of <body> so CSS isolation works cleanly */}
      {ReactDOM.createPortal(
        <div id="print-portal-root" style={{ display: 'none' }}>
          {reportBody}
        </div>,
        document.body
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(#print-portal-root) { display: none !important; }
          #print-portal-root {
            display: block !important;
            background: white;
            color: black;
          }
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
        }
      `}</style>
    </>
  );
}
