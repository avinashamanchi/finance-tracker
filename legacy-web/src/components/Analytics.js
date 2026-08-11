import React from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { getCat } from '../hooks/useFinance';
import './Analytics.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler);

const tooltipCfg = {
  backgroundColor:'#0f1825', borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
  titleColor:'#f0f6ff', bodyColor:'#8ea4be', padding:12,
};
const scaleCfg = {
  x: { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#4d6380',font:{family:'DM Sans',size:12}} },
  y: { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#4d6380',font:{family:'DM Sans',size:12},callback:v=>'$'+v.toLocaleString()} },
};

export default function Analytics({ monthlyTrend, categoryBreakdown, totalIncome, totalExpenses, netSavings }) {
  const labels = monthlyTrend.map(m => m.month);
  const fmt = v => `$${Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`;

  const barData = {
    labels,
    datasets: [
      { label:'Income', data:monthlyTrend.map(m=>m.income), backgroundColor:'rgba(0,212,170,0.7)', borderRadius:6, borderSkipped:false },
      { label:'Expenses', data:monthlyTrend.map(m=>m.expenses), backgroundColor:'rgba(255,92,92,0.7)', borderRadius:6, borderSkipped:false },
    ],
  };

  const lineData = {
    labels,
    datasets: [{
      label:'Savings', data:monthlyTrend.map(m=>m.savings),
      borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.08)',
      tension:0.4, fill:true, pointRadius:5,
      pointBackgroundColor:'#f59e0b', pointBorderColor:'#05070d', pointBorderWidth:2,
    }],
  };

  const catEntries = Object.entries(categoryBreakdown).sort((a,b)=>b[1]-a[1]);
  const catColors  = catEntries.map(([id]) => getCat(id).color || '#6b7280');
  const doughnutData = {
    labels: catEntries.map(([id]) => getCat(id).label),
    datasets: [{ data:catEntries.map(([,v])=>v), backgroundColor:catColors, borderWidth:0, hoverOffset:8 }],
  };

  const highestMonth = monthlyTrend.reduce((best,m)=>m.savings>(best.savings??-Infinity)?m:best, monthlyTrend[0]||{});
  const avgExpenses  = monthlyTrend.reduce((s,m)=>s+m.expenses,0)/(monthlyTrend.length||1);
  const hasData = catEntries.length > 0;

  return (
    <div className="analytics-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">6-month spending trends & insights</p>
        </div>
      </div>

      <div className="insight-row">
        {[
          { icon:'📈', label:'Best Savings Month', val:`${highestMonth.month||'—'} — ${fmt(highestMonth.savings||0)}`, cls:'gold' },
          { icon:'📊', label:'Avg Monthly Expenses', val:fmt(avgExpenses), cls:'red' },
          { icon:'💰', label:'This Month Net', val:(netSavings>=0?'+':'-')+fmt(Math.abs(netSavings)), cls:netSavings>=0?'accent':'red' },
        ].map(c=>(
          <div key={c.label} className="insight-chip">
            <span className="insight-icon">{c.icon}</span>
            <div className="insight-text">
              <span className="insight-label">{c.label}</span>
              <span className={`insight-val ${c.cls}`}>{c.val}</span>
            </div>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="analytics-empty">
          <div className="ae-icon">📊</div>
          <h3>No data yet</h3>
          <p>Add transactions to see your spending analytics and trends.</p>
        </div>
      ) : (
        <>
          <div className="charts-row-2">
            <div className="chart-card">
              <div className="chart-title">Income vs Expenses — 6 Months</div>
              <div className="chart-container">
                <Bar data={barData} options={{
                  responsive:true, maintainAspectRatio:false,
                  plugins:{
                    legend:{labels:{color:'#8ea4be',font:{family:'DM Sans',size:12},boxWidth:12,padding:16}},
                    tooltip:{...tooltipCfg,callbacks:{label:ctx=>` $${Number(ctx.raw).toLocaleString('en-US',{minimumFractionDigits:0})}`}},
                  },
                  scales:scaleCfg,
                }} />
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-title">Spending by Category</div>
              <div className="chart-container">
                <Doughnut data={doughnutData} options={{
                  responsive:true, maintainAspectRatio:false,
                  plugins:{
                    legend:{position:'bottom',labels:{color:'#8ea4be',font:{family:'DM Sans',size:11},padding:12,boxWidth:10}},
                    tooltip:{...tooltipCfg,callbacks:{label:ctx=>` ${ctx.label}: $${Number(ctx.raw).toFixed(0)}`}},
                  },
                  cutout:'65%',
                }} />
              </div>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">Savings Trend — 6 Months</div>
            <div className="chart-container chart-container-sm">
              <Line data={lineData} options={{
                responsive:true, maintainAspectRatio:false,
                plugins:{
                  legend:{display:false},
                  tooltip:{...tooltipCfg,callbacks:{label:ctx=>{const v=Number(ctx.raw);return ` ${v>=0?'+':'-'}$${Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:0})}`}}},
                },
                scales:{x:scaleCfg.x,y:{...scaleCfg.y,ticks:{...scaleCfg.y.ticks,callback:v=>(v>=0?'+':'-')+'$'+Math.abs(v).toLocaleString()}}},
              }} />
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">Monthly Summary</div>
            <div className="summary-table">
              <div className="summary-header">
                <span>Month</span><span>Income</span><span>Expenses</span><span>Savings</span><span>Rate</span>
              </div>
              {monthlyTrend.slice().reverse().map(m=>{
                const rate = m.income>0?(m.savings/m.income*100):0;
                return (
                  <div key={m.month} className="summary-row">
                    <span className="sum-month">{m.month}</span>
                    <span className="sum-income">{fmt(m.income)}</span>
                    <span className="sum-expense">{fmt(m.expenses)}</span>
                    <span className={`sum-savings ${m.savings>=0?'pos':'neg'}`}>{fmt(m.savings)}</span>
                    <span className={`sum-rate ${rate>=20?'good':rate<0?'bad':''}`}>{rate.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
