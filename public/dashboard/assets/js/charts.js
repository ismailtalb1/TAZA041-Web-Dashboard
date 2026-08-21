/* =====================================================================
   TAZA 041 — Charts System
   assets/js/charts.js
   =====================================================================
   يعتمد على: Chart.js (CDN)
   يجب تضمينه بعد config.js وبعد Chart.js
   ===================================================================== */

   'use strict';

   // ─────────────────────────────────────────────────────────────────────
   // [1] لوحة الألوان — تتغير مع الثيم
   // ─────────────────────────────────────────────────────────────────────
   const ChartColors = {

     get isNight() {
       return document.documentElement.classList.contains('theme-night');
     },

     get isGeneralManager() {
       return document.body?.classList.contains('gm-dashboard') ?? false;
     },

     get isWarmDashboard() {
       return this.isGeneralManager
         || (document.body?.classList.contains('orders-workspace') ?? false)
         || (document.body?.classList.contains('delivery-workspace') ?? false)
         || (document.body?.classList.contains('inventory-workspace') ?? false)
         || (document.body?.classList.contains('communication-workspace') ?? false)
         || (document.body?.classList.contains('finance-workspace') ?? false)
         || (document.body?.classList.contains('driver-workspace') ?? false);
     },

     // الألوان الأساسية للمخططات
     get palette() {
       if (this.isWarmDashboard) {
         return this.isNight
           ? ['#F08A38', '#53AD91', '#74A7B8', '#E3AC4C',
              '#B79A86', '#EF766A', '#C8A2C8', '#79B8A4']
           : ['#D8741F', '#2F7D67', '#4D7F91', '#C98920',
              '#8D6E63', '#B54135', '#9678A8', '#5F9B86'];
       }
       return this.isNight
         ? ['#F59E0B', '#38BDF8', '#34D399', '#F87171',
            '#A78BFA', '#FB923C', '#E879F9', '#2DD4BF']
         : ['#2563EB', '#10B981', '#F59E0B', '#EF4444',
            '#8B5CF6', '#F97316', '#EC4899', '#06B6D4'];
     },

     get primary()   { return this.isWarmDashboard ? (this.isNight ? '#F08A38' : '#D8741F') : (this.isNight ? '#F59E0B' : '#2563EB'); },
     get success()   { return this.isWarmDashboard ? (this.isNight ? '#53AD91' : '#2F7D67') : (this.isNight ? '#34D399' : '#10B981'); },
     get danger()    { return this.isWarmDashboard ? (this.isNight ? '#EF766A' : '#B54135') : (this.isNight ? '#F87171' : '#EF4444'); },
     get warning()   { return this.isWarmDashboard ? (this.isNight ? '#E3AC4C' : '#C98920') : (this.isNight ? '#FBBF24' : '#F59E0B'); },
     get info()      { return this.isWarmDashboard ? (this.isNight ? '#74A7B8' : '#4D7F91') : (this.isNight ? '#38BDF8' : '#3B82F6'); },
     get purple()    { return this.isNight ? '#A78BFA' : '#8B5CF6'; },
     get orange()    { return this.isNight ? '#FB923C' : '#F97316'; },

     // خلفية الكارت
     get cardBg()    { return this.isWarmDashboard ? (this.isNight ? '#17120F' : '#F7F2EB') : (this.isNight ? '#141E2E' : '#FFFFFF'); },
     get textPrimary(){ return this.isWarmDashboard ? (this.isNight ? '#FFF4E8' : '#2B2118') : (this.isNight ? '#E2E8F0' : '#0F172A'); },
     get textSecondary(){ return this.isWarmDashboard ? (this.isNight ? '#CBBCAF' : '#65574B') : (this.isNight ? '#CBD5E1' : '#334155'); },
     get textMuted() { return this.isWarmDashboard ? (this.isNight ? '#AA9B8F' : '#76685D') : (this.isNight ? '#94A3B8' : '#64748B'); },
     get border()    { return this.isWarmDashboard ? (this.isNight ? '#332820' : '#E5D9CE') : (this.isNight ? '#1E293B' : '#E2E8F0'); },
     get gridColor() { return this.isWarmDashboard ? (this.isNight ? 'rgba(255,244,232,0.055)' : 'rgba(93,65,43,0.07)') : (this.isNight ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'); },

     // تدرج لوني لمخطط معين
     gradient(ctx, color, opacity1 = 0.3, opacity2 = 0.0) {
       const gradient = ctx.createLinearGradient(0, 0, 0, 300);
       gradient.addColorStop(0, color + Math.round(opacity1 * 255).toString(16).padStart(2, '0'));
       gradient.addColorStop(1, color + Math.round(opacity2 * 255).toString(16).padStart(2, '0'));
       return gradient;
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [2] الإعدادات الافتراضية العالمية لـ Chart.js
   // ─────────────────────────────────────────────────────────────────────
   function applyChartDefaults() {
     if (!window.Chart) return;

     const lang = TAZA.Lang?.current ?? 'ar';

     Chart.defaults.font.family = lang === 'ar'
       ? "'Cairo', sans-serif"
       : "'DM Sans', sans-serif";
     Chart.defaults.font.size    = 12;
     Chart.defaults.color        = ChartColors.textMuted;
     Chart.defaults.responsive   = true;
     Chart.defaults.maintainAspectRatio = false;
     Chart.defaults.animation.duration = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : 450;
     Chart.defaults.animation.easing = 'easeOutQuart';

     // Plugin defaults
     Chart.defaults.plugins.legend.labels.usePointStyle = true;
     Chart.defaults.plugins.legend.labels.pointStyle    = 'circle';
     Chart.defaults.plugins.legend.labels.padding       = 16;
     Chart.defaults.plugins.legend.labels.font          = {
       size: 12,
       family: Chart.defaults.font.family,
       weight: '600',
     };
     Chart.defaults.plugins.legend.labels.color = ChartColors.textSecondary;

     Chart.defaults.plugins.tooltip.backgroundColor = ChartColors.isNight
       ? 'rgba(20,30,46,0.95)'
       : 'rgba(15,23,42,0.92)';
     Chart.defaults.plugins.tooltip.titleColor  = '#FFFFFF';
     Chart.defaults.plugins.tooltip.bodyColor   = '#CBD5E1';
     Chart.defaults.plugins.tooltip.borderColor = ChartColors.border;
     Chart.defaults.plugins.tooltip.borderWidth = 1;
     Chart.defaults.plugins.tooltip.padding     = 12;
     Chart.defaults.plugins.tooltip.cornerRadius= 8;
     Chart.defaults.plugins.tooltip.titleFont   = { size: 12, weight: '700', family: Chart.defaults.font.family };
     Chart.defaults.plugins.tooltip.bodyFont    = { size: 11, family: Chart.defaults.font.family };
     Chart.defaults.plugins.tooltip.rtl         = lang === 'ar';
   }

   // ─────────────────────────────────────────────────────────────────────
   // [3] مخزن المخططات (لمنع التكرار)
   // ─────────────────────────────────────────────────────────────────────
   const _charts = {};

   function destroyChart(id) {
     if (_charts[id]) {
       _charts[id].destroy();
       delete _charts[id];
     }
   }

   function getChart(id) {
     return _charts[id] ?? null;
   }

   function dataSignature(data = {}) {
     return JSON.stringify({
       labels: data.labels ?? [],
       datasets: (data.datasets ?? []).map(dataset => ({
         label: dataset.label ?? '',
         data: dataset.data ?? [],
         backgroundColor: dataset.backgroundColor ?? null,
         borderColor: dataset.borderColor ?? null,
       })),
     });
   }

   function syncDatasets(chart, sourceDatasets = []) {
     const targetDatasets = chart.data.datasets ?? [];

     sourceDatasets.forEach((source, index) => {
       if (!targetDatasets[index]) {
         targetDatasets.push({ ...source, data: Array.isArray(source.data) ? [...source.data] : source.data });
         return;
       }

       const target = targetDatasets[index];
       Object.keys(target).forEach(key => {
         if (!(key in source) && !key.startsWith('_')) delete target[key];
       });
       Object.assign(target, source);
       if (Array.isArray(source.data)) target.data = [...source.data];
     });

     if (targetDatasets.length > sourceDatasets.length) {
       targetDatasets.splice(sourceDatasets.length);
     }
   }

   /**
    * ينشئ المخطط مرة واحدة فقط، ثم يحدّث بياناته وخياراته داخل الكائن نفسه.
    * بهذا تبقى عناصر Canvas ثابتة ولا يظهر وميض أو إعادة بناء أثناء LiveSync.
    */
   function upsertChart(canvasId, kind, config, metadata = {}) {
     const canvas = document.getElementById(canvasId);
     if (!canvas) return null;

     const signature = dataSignature(config.data);
     let chart = _charts[canvasId];

     if (chart && chart.$tazaKind === kind && chart.config.type === config.type) {
       const changed = chart.$tazaDataSignature !== signature;
       chart.data.labels = Array.isArray(config.data.labels) ? [...config.data.labels] : config.data.labels;
       syncDatasets(chart, config.data.datasets ?? []);
       chart.options = config.options;
       Object.assign(chart, metadata);
       chart.$tazaDataSignature = signature;
       canvas.dataset.chartUpdate = changed ? 'data' : 'silent';
       canvas.dataset.chartRevision = String(Number(canvas.dataset.chartRevision ?? 0) + 1);
       chart.update(changed ? undefined : 'none');
       return chart;
     }

     if (chart) destroyChart(canvasId);
     const ctx = canvas.getContext('2d');
     chart = new Chart(ctx, config);
     chart.$tazaKind = kind;
     chart.$tazaDataSignature = signature;
     Object.assign(chart, metadata);
     canvas.dataset.chartInstance = `${canvasId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
     canvas.dataset.chartRevision = '1';
     canvas.dataset.chartUpdate = 'created';
     _charts[canvasId] = chart;
     return chart;
   }

   function numericValues(values = []) {
     return values.map(value => Number(value) || 0);
   }

   function formatNumber(value) {
     return Number(value ?? 0).toLocaleString((TAZA.Lang?.current ?? 'ar') === 'ar' ? 'ar-SY' : 'en-US');
   }

   function formatMoneyValue(value) {
     return `${formatNumber(value)} ${(TAZA.Lang?.current ?? 'ar') === 'ar' ? 'ل.س' : 'SYP'}`;
   }

   function formatDateLabel(value, options = {}) {
     if (!value) return '';
     const normalized = /^\d{4}-\d{2}$/.test(value) ? `${value}-01T12:00:00` : `${value}T12:00:00`;
     const date = new Date(normalized);
     if (Number.isNaN(date.getTime())) return String(value);
     return date.toLocaleDateString((TAZA.Lang?.current ?? 'ar') === 'ar' ? 'ar-SY' : 'en-US', options);
   }

   function prepareCanvas(canvas, labels = [], datasets = []) {
     const isAr = (TAZA.Lang?.current ?? 'ar') === 'ar';
     const total = datasets.reduce((sum, dataset) =>
       sum + numericValues(dataset.data).reduce((sub, value) => sub + Math.abs(value), 0), 0);
     const title = datasets.map(dataset => dataset.label).filter(Boolean).join('، ');
     canvas.setAttribute('role', 'img');
     canvas.setAttribute('aria-label', title
       ? `${title}. ${isAr ? 'إجمالي القيم' : 'Total values'}: ${total.toLocaleString(isAr ? 'ar-SY' : 'en-US')}`
       : (isAr ? 'مخطط إحصائي' : 'Statistical chart'));
     canvas.dataset.chartHasData = total > 0 && labels.length > 0 ? '1' : '0';
   }

   function emptyStatePlugin(canvasId) {
     return {
       id: `emptyState_${canvasId}`,
       afterDraw(chart) {
         if (chart.canvas.dataset.chartHasData === '1') return;
         const isAr = (TAZA.Lang?.current ?? 'ar') === 'ar';
         const { ctx, chartArea } = chart;
         const area = chartArea ?? { left: 0, right: chart.width, top: 0, bottom: chart.height };
         const x = (area.left + area.right) / 2;
         const y = (area.top + area.bottom) / 2;
         ctx.save();
         ctx.fillStyle = ChartColors.cardBg;
         ctx.globalAlpha = 0.92;
         ctx.fillRect(area.left, area.top, area.right - area.left, area.bottom - area.top);
         ctx.globalAlpha = 1;
         ctx.fillStyle = ChartColors.textMuted;
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.font = `600 13px ${Chart.defaults.font.family}`;
         ctx.fillText(isAr ? 'لا توجد بيانات ضمن الفترة المحددة' : 'No data for the selected period', x, y);
         ctx.restore();
       },
     };
   }

   // ─────────────────────────────────────────────────────────────────────
   // [4] مخطط الخط — Line Chart (إيرادات / مبيعات)
   // ─────────────────────────────────────────────────────────────────────
   function createLineChart(canvasId, { labels, datasets, title, yLabel = '' }) {
     const canvas = document.getElementById(canvasId);
     if (!canvas) return null;

     labels = Array.isArray(labels) ? labels : [];
     datasets = Array.isArray(datasets) ? datasets : [];
     datasets = datasets.map(dataset => ({ ...dataset, data: numericValues(dataset.data) }));
     prepareCanvas(canvas, labels, datasets);
     const ctx   = canvas.getContext('2d');
     const colors = ChartColors.palette;

     const processedDatasets = datasets.map((ds, i) => {
       const color = ds.color ?? colors[i % colors.length];
       return {
         label:                ds.label,
         data:                 ds.data,
         borderColor:          color,
         backgroundColor:      ChartColors.gradient(ctx, color, 0.15, 0.0),
         fill:                 true,
         tension:              0.35,
         cubicInterpolationMode: 'monotone',
         borderWidth:          2.25,
         pointRadius:          ds.data.length > 14 ? 0 : 2.5,
         pointHoverRadius:     5,
         pointBackgroundColor: color,
         pointBorderColor:     ChartColors.cardBg,
         pointBorderWidth:     2,
       };
     });

     return upsertChart(canvasId, 'line', {
       type: 'line',
       data: { labels, datasets: processedDatasets },
       options: {
         responsive: true,
         maintainAspectRatio: false,
         interaction: { mode: 'index', intersect: false },
         plugins: {
           legend: { display: datasets.length > 1, labels: { color: ChartColors.textSecondary } },
           title: title ? {
             display: true,
             text:    title,
             color:   ChartColors.textPrimary,
             font:    { size: 13, weight: '700' },
             padding: { bottom: 16 },
           } : { display: false },
           tooltip: {
             callbacks: {
               label: (ctx) => {
                 const val = ctx.parsed.y;
                 return ` ${ctx.dataset.label}: ${
                   yLabel === 'money'
                     ? formatMoneyValue(val)
                     : val
                 }`;
               },
             },
           },
         },
         scales: {
           x: {
             grid:   { color: ChartColors.gridColor, drawBorder: false },
             ticks:  { color: ChartColors.textMuted, font: { size: 11 } },
             border: { display: false },
           },
           y: {
             grid:    { color: ChartColors.gridColor, drawBorder: false },
             grace:   '15%',
             ticks:   {
               color: ChartColors.textMuted,
               font:  { size: 11 },
               callback: (val) => yLabel === 'money'
                 ? formatNumber(val)
                 : val,
             },
             border:  { display: false },
             beginAtZero: true,
           },
         },
       },
       plugins: [emptyStatePlugin(canvasId)],
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [5] مخطط الدائرة — Donut Chart
   // ─────────────────────────────────────────────────────────────────────
   function createDonutChart(canvasId, { labels, data, title, centerText, colors: customColors }) {
     const canvas = document.getElementById(canvasId);
     if (!canvas) return null;

     labels = Array.isArray(labels) ? labels : [];
     data = numericValues(data);
     prepareCanvas(canvas, labels, [{ label: title, data }]);
     const ctx    = canvas.getContext('2d');
     const colors = customColors?.length ? customColors : ChartColors.palette.slice(0, labels.length);
     const total  = data.reduce((a, b) => a + b, 0);

     // Plugin لعرض النص في المركز
     const centerPlugin = {
       id: 'centerText_' + canvasId,
       beforeDraw(chart) {
         const currentTotal = chart.$tazaTotal ?? total;
         if (currentTotal <= 0) return;
         const { ctx: c } = chart;
         c.save();
         const text    = chart.$tazaCenterText ?? chart.config.options._centerLabel ?? String(currentTotal);
         const subText = chart.config.options._centerSub
           ?? ((TAZA.Lang?.current ?? 'ar') === 'ar' ? 'الإجمالي' : 'Total');
         const arc = chart.getDatasetMeta(0)?.data?.find(item => item && Number.isFinite(item.x));
         const area = chart.chartArea;
         const x = arc?.x ?? ((area.left + area.right) / 2);
         const y = arc?.y ?? ((area.top + area.bottom) / 2);
         const innerRadius = arc?.innerRadius ?? Math.min(area.right - area.left, area.bottom - area.top) * 0.32;
         let valueSize = Math.round(Math.min(54, Math.max(28, innerRadius * 0.55)));
         const labelSize = Math.round(Math.min(15, Math.max(11, innerRadius * 0.16)));

         c.font = `700 ${valueSize}px ${Chart.defaults.font.family}`;
         while (valueSize > 24 && c.measureText(String(text)).width > innerRadius * 1.45) {
           valueSize -= 2;
           c.font = `700 ${valueSize}px ${Chart.defaults.font.family}`;
         }
         c.fillStyle   = ChartColors.textPrimary;
         c.textAlign   = 'center';
         c.textBaseline = 'middle';
         c.fillText(text, x, subText ? y - labelSize * 0.55 : y);

         if (subText) {
           c.font = `500 ${labelSize}px ${Chart.defaults.font.family}`;
           c.fillStyle = ChartColors.textMuted;
           c.fillText(subText, x, y + valueSize * 0.62);
         }
         c.restore();
       },
     };

     return upsertChart(canvasId, 'donut', {
       type: 'doughnut',
       data: {
         labels,
         datasets: [{
           data,
           backgroundColor: colors,
           borderColor:     ChartColors.cardBg,
           borderWidth:     3,
           hoverBorderWidth: 4,
           hoverOffset:     6,
         }],
       },
       options: {
         responsive:          true,
         maintainAspectRatio: false,
         cutout:              '72%',
         plugins: {
           legend: {
             position: 'bottom',
             labels:   {
               color:     ChartColors.textSecondary,
               padding:   12,
               font:      { size: 11 },
               generateLabels: (chart) => {
                 const ds  = chart.data.datasets[0];
                 return chart.data.labels.map((label, i) => ({
                   text:        `${label}  (${ds.data[i]})`,
                   fillStyle:   ds.backgroundColor[i],
                   strokeStyle: ds.backgroundColor[i],
                   fontColor:   ChartColors.textSecondary,
                   hidden:      false,
                   index:       i,
                 }));
               },
             },
           },
           title: title ? {
             display: true, text: title,
             color:   ChartColors.textPrimary,
             font:    { size: 13, weight: '700' },
           } : { display: false },
           tooltip: {
             callbacks: {
               label: (ctx) => {
                 const pct = total > 0
                   ? ((ctx.parsed / total) * 100).toFixed(1)
                   : 0;
                 return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
               },
             },
           },
         },
       },
       plugins: [centerPlugin, emptyStatePlugin(canvasId)],
     }, {
       $tazaTotal: total,
       $tazaCenterText: centerText ?? String(total),
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [6] مخطط الأعمدة — Bar Chart
   // ─────────────────────────────────────────────────────────────────────
   function createBarChart(canvasId, {
     labels, datasets, title, yLabel = '', stacked = false, horizontal = false, suggestedMax,
   }) {
     const canvas = document.getElementById(canvasId);
     if (!canvas) return null;

     labels = Array.isArray(labels) ? labels : [];
     datasets = Array.isArray(datasets) ? datasets : [];
     datasets = datasets.map(dataset => ({ ...dataset, data: numericValues(dataset.data) }));
     prepareCanvas(canvas, labels, datasets);
     const ctx    = canvas.getContext('2d');
     const colors = ChartColors.palette;

     const processedDatasets = datasets.map((ds, i) => {
       const color = ds.color ?? colors[i % colors.length];
       return {
         label:            ds.label,
         data:             ds.data,
         backgroundColor:  color + 'CC',
         hoverBackgroundColor: color,
         borderColor:      color,
         borderWidth:      0,
         borderRadius:     horizontal ? 4 : 6,
         borderSkipped:    false,
       };
     });

     return upsertChart(canvasId, horizontal ? 'horizontal-bar' : 'bar', {
       type: horizontal ? 'bar' : 'bar',
       data: { labels, datasets: processedDatasets },
       options: {
         responsive:          true,
         maintainAspectRatio: false,
         indexAxis:           horizontal ? 'y' : 'x',
         interaction: { mode: 'index', intersect: false },
         plugins: {
           legend: { display: datasets.length > 1, labels: { color: ChartColors.textSecondary } },
           title:  title ? {
             display: true, text: title,
             color:   ChartColors.textPrimary,
             font:    { size: 13, weight: '700' },
           } : { display: false },
           tooltip: {
             callbacks: {
               label: (ctx) => {
                 const val = horizontal ? ctx.parsed.x : ctx.parsed.y;
                 return ` ${ctx.dataset.label}: ${
                   yLabel === 'money'
                     ? formatMoneyValue(val)
                     : val
                 }`;
               },
             },
           },
         },
         scales: {
           x: {
             stacked: stacked,
             grid:    { color: horizontal ? ChartColors.gridColor : 'transparent' },
             $tazaTransparentGrid: !horizontal,
             ticks:   {
               color: ChartColors.textMuted,
               font:  { size: 11 },
               callback: !horizontal && yLabel === 'money'
                 ? (v) => formatNumber(v)
                 : undefined,
             },
             border:  { display: false },
             beginAtZero: true,
             suggestedMax: horizontal ? suggestedMax : undefined,
           },
           y: {
             stacked: stacked,
             grid:    { color: !horizontal ? ChartColors.gridColor : 'transparent' },
             $tazaTransparentGrid: horizontal,
             ticks:   {
               color: ChartColors.textMuted,
               font:  { size: 11 },
               callback: horizontal && yLabel === 'money'
                 ? (v) => formatNumber(v)
                 : undefined,
             },
             border:  { display: false },
             beginAtZero: true,
             suggestedMax: horizontal ? undefined : suggestedMax,
           },
         },
       },
       plugins: [emptyStatePlugin(canvasId)],
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [7] مخطط الأعمدة الأفقي المبسَّط — Top Items
   // ─────────────────────────────────────────────────────────────────────
   function createHorizontalBar(canvasId, {
     labels, data, title, color, valueLabel = '',
   }) {
     return createBarChart(canvasId, {
       labels,
       datasets: [{ label: valueLabel, data, color: color ?? ChartColors.primary }],
       title,
       yLabel: valueLabel === 'money' ? 'money' : '',
       horizontal: true,
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [8] مخطط Radial / نصف دائرة — Gauge
   // ─────────────────────────────────────────────────────────────────────
   function createGaugeChart(canvasId, {
     value, max = 100, label, color,
   }) {
     const canvas = document.getElementById(canvasId);
     if (!canvas) return null;

     const pct     = Math.min(100, Math.round((value / max) * 100));
     const clr     = color ?? (pct >= 90 ? ChartColors.danger : pct >= 70 ? ChartColors.warning : ChartColors.success);
     const ctx     = canvas.getContext('2d');

     // Plugin للنص المركزي
     const gaugePlugin = {
       id: 'gauge_' + canvasId,
       beforeDraw(chart) {
         const { width, height, ctx: c } = chart;
         c.save();
         c.font = `700 ${Math.round(width / 7)}px ${Chart.defaults.font.family}`;
         c.fillStyle    = ChartColors.textPrimary;
         c.textAlign    = 'center';
         c.textBaseline = 'middle';
         const currentPct = chart.$tazaGaugePct ?? pct;
         const currentLabel = chart.$tazaGaugeLabel ?? label;
         c.fillText(`${currentPct}%`, width / 2, height / 2 + 10);
         if (currentLabel) {
           c.font = `500 ${Math.round(width / 14)}px ${Chart.defaults.font.family}`;
           c.fillStyle = ChartColors.textMuted;
           c.fillText(currentLabel, width / 2, height / 2 + 10 + Math.round(width / 8));
         }
         c.restore();
       },
     };

     return upsertChart(canvasId, 'gauge', {
       type: 'doughnut',
       data: {
         datasets: [{
           data:            [pct, 100 - pct],
           backgroundColor: [clr, ChartColors.border],
           borderWidth:     0,
           hoverOffset:     0,
         }],
       },
       options: {
         responsive:          true,
         maintainAspectRatio: false,
         circumference:       180,
         rotation:            -90,
         cutout:              '78%',
         plugins: {
           legend:  { display: false },
           tooltip: { enabled: false },
         },
       },
       plugins: [gaugePlugin],
     }, {
       $tazaGaugePct: pct,
       $tazaGaugeLabel: label,
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [9] مخطط المنطقة المكدّسة — Stacked Area
   // ─────────────────────────────────────────────────────────────────────
   function createStackedAreaChart(canvasId, { labels, datasets, title }) {
     const canvas = document.getElementById(canvasId);
     if (!canvas) return null;

     const ctx    = canvas.getContext('2d');
     const colors = ChartColors.palette;

     const processedDatasets = datasets.map((ds, i) => {
       const color = ds.color ?? colors[i % colors.length];
       return {
         label:           ds.label,
         data:            ds.data,
         borderColor:     color,
         backgroundColor: color + '40',
         fill:            true,
         tension:         0.4,
         borderWidth:     2,
         pointRadius:     0,
         pointHoverRadius:4,
       };
     });

     return upsertChart(canvasId, 'stacked-area', {
       type: 'line',
       data: { labels, datasets: processedDatasets },
       options: {
         responsive:          true,
         maintainAspectRatio: false,
         interaction: { mode: 'index', intersect: false },
         plugins: {
           legend: { display: true, position: 'top', labels: { color: ChartColors.textSecondary } },
           title:  title ? {
             display: true, text: title,
             color:   ChartColors.textPrimary,
             font:    { size: 13, weight: '700' },
           } : { display: false },
         },
         scales: {
           x: {
             stacked: true,
             grid:    { color: ChartColors.gridColor },
             ticks:   { color: ChartColors.textMuted, font: { size: 11 } },
             border:  { display: false },
           },
           y: {
             stacked: true,
             grid:    { color: ChartColors.gridColor },
             ticks:   { color: ChartColors.textMuted, font: { size: 11 } },
             border:  { display: false },
             beginAtZero: true,
           },
         },
       },
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [10] مخطط النقاط — Scatter (للتحليلات المتقدمة)
   // ─────────────────────────────────────────────────────────────────────
   function createScatterChart(canvasId, { datasets, title, xLabel, yLabel }) {
     const canvas = document.getElementById(canvasId);
     if (!canvas) return null;

     const ctx    = canvas.getContext('2d');
     const colors = ChartColors.palette;

     const processedDatasets = datasets.map((ds, i) => ({
       label:           ds.label,
       data:            ds.data,
       backgroundColor: (ds.color ?? colors[i]) + 'BB',
       borderColor:     ds.color ?? colors[i],
       borderWidth:     1,
       pointRadius:     5,
       pointHoverRadius:8,
     }));

     return upsertChart(canvasId, 'scatter', {
       type: 'scatter',
       data: { datasets: processedDatasets },
       options: {
         responsive:          true,
         maintainAspectRatio: false,
         plugins: {
           legend: { display: datasets.length > 1, labels: { color: ChartColors.textSecondary } },
           title:  title ? {
             display: true, text: title,
             color:   ChartColors.textPrimary,
             font:    { size: 13, weight: '700' },
           } : { display: false },
         },
         scales: {
           x: {
             title: xLabel ? { display: true, text: xLabel, color: ChartColors.textMuted } : { display: false },
             grid:  { color: ChartColors.gridColor },
             ticks: { color: ChartColors.textMuted },
             border:{ display: false },
           },
           y: {
             title: yLabel ? { display: true, text: yLabel, color: ChartColors.textMuted } : { display: false },
             grid:  { color: ChartColors.gridColor },
             ticks: { color: ChartColors.textMuted },
             border:{ display: false },
           },
         },
       },
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [11] تحديث مخطط موجود ببيانات جديدة
   // ─────────────────────────────────────────────────────────────────────
   function updateChart(canvasId, { labels, datasets }) {
     const chart = _charts[canvasId];
     if (!chart) return;

     if (labels) chart.data.labels = labels;

     if (datasets) {
       datasets.forEach((ds, i) => {
         if (chart.data.datasets[i]) {
           chart.data.datasets[i].data = ds.data;
           if (ds.label) chart.data.datasets[i].label = ds.label;
         }
       });
     }

     chart.$tazaDataSignature = dataSignature(chart.data);
     chart.canvas.dataset.chartUpdate = 'data';
     chart.canvas.dataset.chartRevision = String(Number(chart.canvas.dataset.chartRevision ?? 0) + 1);
     chart.update();
   }

   function applyThemeToChart(chart) {
     const options = chart.options ?? {};
     const plugins = options.plugins ?? (options.plugins = {});

     if (plugins.legend?.labels) plugins.legend.labels.color = ChartColors.textSecondary;
     if (plugins.title?.display) plugins.title.color = ChartColors.textPrimary;

     Object.values(options.scales ?? {}).forEach(scale => {
       if (!scale) return;
       if (scale.ticks) scale.ticks.color = ChartColors.textMuted;
       if (scale.grid) scale.grid.color = scale.$tazaTransparentGrid ? 'transparent' : ChartColors.gridColor;
       if (scale.title?.display) scale.title.color = ChartColors.textSecondary;
     });

     (chart.data?.datasets ?? []).forEach(dataset => {
       if (chart.config.type === 'doughnut' && Number(dataset.borderWidth ?? 0) > 0) {
         dataset.borderColor = ChartColors.cardBg;
       }
       if ('pointBorderColor' in dataset) dataset.pointBorderColor = ChartColors.cardBg;
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [12] إعادة رسم كل المخططات عند تغيير الثيم
   // ─────────────────────────────────────────────────────────────────────
   function refreshAllCharts() {
     applyChartDefaults();
     Object.values(_charts).forEach(chart => {
       if (!chart) return;
       try {
         applyThemeToChart(chart);
         chart.update('none');
       } catch { /* ignore destroyed */ }
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [13] مخططات جاهزة لكل لوحة تحكم
   // ─────────────────────────────────────────────────────────────────────
   const DashboardCharts = {

     // ── المدير العام ────────────────────────────────────────────────

     // إيرادات 7 أيام
     revenueWeekly(canvasId, data = null) {
       const labels   = data?.labels   ?? [];
       const revenues = data?.revenues ?? [];
       return createLineChart(canvasId, {
         labels,
         datasets: [{ label: TAZA.Lang.current === 'ar' ? 'الإيرادات' : 'Revenue', data: revenues }],
         yLabel: 'money',
       });
     },

     // الطلبات حسب النوع
     ordersByType(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createDonutChart(canvasId, {
         labels: data?.labels ?? [
           isAr ? 'عادي'    : 'Normal',
           isAr ? 'توصيل'  : 'Delivery',
           isAr ? 'حجز'    : 'Reservation',
         ],
         data:       data?.values ?? [0, 0, 0],
         centerText: data?.total,
         colors: [ChartColors.info, ChartColors.success, ChartColors.warning],
       });
     },

     // أفضل المنتجات مبيعاً
     topProducts(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createHorizontalBar(canvasId, {
         labels:     data?.labels ?? [],
         data:       data?.values ?? [],
         valueLabel: isAr ? 'عدد الطلبات' : 'Orders',
         color:      ChartColors.primary,
       });
     },

     // إيرادات شهرية
     revenueMonthly(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createBarChart(canvasId, {
         labels:   data?.labels ?? [],
         datasets: [{
           label: isAr ? 'الإيرادات' : 'Revenue',
           data:  data?.values ?? [],
         }],
         yLabel: 'money',
       });
     },

     // ── مدير الطلبات ────────────────────────────────────────────────

     // حالات الطلبات
     orderStatuses(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createDonutChart(canvasId, {
         labels: data?.labels ?? [
           isAr ? 'معلق'    : 'Pending',
           isAr ? 'مؤكد'   : 'Confirmed',
           isAr ? 'قيد التجهيز' : 'Preparing',
           isAr ? 'مكتمل'  : 'Completed',
           isAr ? 'ملغى'   : 'Cancelled',
         ],
         data: data?.values ?? [0, 0, 0, 0, 0],
         colors: [ChartColors.warning, ChartColors.info, ChartColors.primary, ChartColors.success, ChartColors.danger],
       });
     },

     // طلبات اليوم بالساعة
     ordersHourly(canvasId, data = null) {
       const isAr  = TAZA.Lang.current === 'ar';
       return createLineChart(canvasId, {
         labels:   data?.labels ?? [],
         datasets: [{
           label: isAr ? 'الطلبات' : 'Orders',
           data:  data?.values ?? [],
         }],
       });
     },

     // مقارنة طلبات عادي/توصيل/حجز
     ordersComparison(canvasId, data = null) {
       const isAr   = TAZA.Lang.current === 'ar';
       const labels = data?.labels ?? [];
       return createStackedAreaChart(canvasId, {
         labels,
         datasets: [
           {
             label: isAr ? 'عادي'   : 'Normal',
             data:  data?.normal    ?? [],
             color: ChartColors.primary,
           },
           {
             label: isAr ? 'توصيل' : 'Delivery',
             data:  data?.delivery  ?? [],
             color: ChartColors.success,
           },
           {
             label: isAr ? 'حجز'   : 'Reservation',
             data:  data?.reservation ?? [],
             color: ChartColors.warning,
           },
         ],
       });
     },

     // ── مدير التوصيل ────────────────────────────────────────────────

     // حالات التوصيل
     deliveryStatuses(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createDonutChart(canvasId, {
         labels: data?.labels ?? [
           isAr ? 'بانتظار السائق' : 'Pending',
           isAr ? 'جاري التوصيل'  : 'In Delivery',
           isAr ? 'تم التسليم'    : 'Delivered',
         ],
         data: data?.values ?? [0, 0, 0],
         colors: [ChartColors.warning, ChartColors.purple, ChartColors.success],
       });
     },

     // تقييمات السائقين
     driverRatings(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createBarChart(canvasId, {
         labels:   data?.names  ?? [],
         datasets: [{
           label: isAr ? 'التقييم' : 'Rating',
           data:  data?.ratings ?? [],
           color: ChartColors.success,
         }],
         suggestedMax: 5,
       });
     },

     // ── مدير المخزون ────────────────────────────────────────────────

     // توزيع المنتجات حسب الفئة
     productsByCategory(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createDonutChart(canvasId, {
         labels: data?.labels ?? [
           isAr ? 'وجبات'     : 'Meals',
           isAr ? 'سندويشات' : 'Sandwiches',
           isAr ? 'مشروبات'  : 'Drinks',
         ],
         data: data?.values ?? [0, 0, 0],
       });
     },

     // مستويات المخزون
     stockLevels(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createHorizontalBar(canvasId, {
         labels: data?.names  ?? [],
         data:   data?.stocks ?? [],
         valueLabel: isAr ? 'المخزون' : 'Stock',
         color: ChartColors.info,
       });
     },

     // ── المدير المالي ────────────────────────────────────────────────

     // توزيع طرق الدفع
     paymentMethods(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createDonutChart(canvasId, {
         labels: data?.labels ?? [
           isAr ? 'كاش'          : 'Cash',
           isAr ? 'سيريتل كاش'  : 'Syriatel Cash',
           isAr ? 'شام كاش'     : 'Sham Cash',
           isAr ? 'نقاط الولاء' : 'Loyalty Points',
         ],
         data: data?.values ?? [0, 0, 0, 0],
       });
     },

     // إيرادات شهرية للمدير المالي
     monthlyRevenue(canvasId, data = null) {
       const isAr = TAZA.Lang.current === 'ar';
       return createLineChart(canvasId, {
         labels: data?.labels ?? [],
         datasets: [{
           label: isAr ? 'الإيرادات الشهرية' : 'Monthly Revenue',
           data:  data?.values ?? [],
         }],
         yLabel: 'money',
       });
     },

     // نسبة امتلاء الحسابات المالية
     accountCapacity(canvasId, percentage, label) {
       return createGaugeChart(canvasId, {
         value: percentage,
         max:   100,
         label,
       });
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [14] مراقبة تغيير الثيم لتحديث المخططات
   // ─────────────────────────────────────────────────────────────────────
   const _themeObserver = new MutationObserver(() => {
     refreshAllCharts();
   });

   _themeObserver.observe(document.documentElement, {
     attributes:      true,
     attributeFilter: ['class'],
   });

   // ─────────────────────────────────────────────────────────────────────
   // [15] تهيئة عند تحميل الصفحة
   // ─────────────────────────────────────────────────────────────────────
   document.addEventListener('DOMContentLoaded', () => {
     if (window.Chart) applyChartDefaults();
   });

   // ─────────────────────────────────────────────────────────────────────
   // [16] Export
   // ─────────────────────────────────────────────────────────────────────
   window.TAZA = window.TAZA ?? {};
   window.TAZA.Charts = {
     Colors:          ChartColors,
     createLine:      createLineChart,
     createDonut:     createDonutChart,
     createBar:       createBarChart,
     createHBar:      createHorizontalBar,
     createGauge:     createGaugeChart,
     createArea:      createStackedAreaChart,
     createScatter:   createScatterChart,
     update:          updateChart,
     destroy:         destroyChart,
     get:             getChart,
     refreshAll:      refreshAllCharts,
     dateLabel:       formatDateLabel,
     dashboard:       DashboardCharts,
   };
