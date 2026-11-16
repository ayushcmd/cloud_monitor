import React, {useEffect, useState, useRef} from 'react';

const palette = ['#12b8ad', '#489fe8', '#a87ae9', '#e9a443', '#e57898', '#47b987', '#6a8fe7'];
const labelKeys = ['endpoint', 'status_code', 'device', 'mountpoint', 'cpu', 'instance', 'job', 'container'];

export function seriesName(labels = {}, index = 0) {
  const parts = labelKeys.filter(key => labels[key]).map(key => key === 'status_code' ? `HTTP ${labels[key]}` : String(labels[key]));
  return parts.slice(0, 2).join(' · ') || labels.__name__ || labels.display_name || 'Aggregate';
}

function number(value) {
  if (!Number.isFinite(value)) return '—';
  if (value !== 0 && Math.abs(value) < .01) return value.toPrecision(3);
  return Math.abs(value) >= 1000 ? value.toLocaleString(undefined, {maximumFractionDigits: 1}) : value.toLocaleString(undefined, {maximumFractionDigits: value < 10 ? 2 : 1});
}

export function latestPoint(series) {
  const point = series?.points?.at(-1);
  return point && Number.isFinite(point[1]) ? point : undefined;
}

export default function MetricChart({panel, start, end, primary = false, refreshInterval = 10}) {
  const cardRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(500);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setChartWidth(Math.max(220, entry.contentRect.width)));
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = event => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const rawSeries = panel.series || [];
  const peak = Math.max(0, ...rawSeries.flatMap(item => item.points.map(([,value]) => Number.isFinite(value) ? Math.abs(value) : 0)));
  const rateScale = panel.unit === 'MiB/s' && peak > 0 && peak < 1 ? (peak * 1024 < 1 ? 1048576 : 1024) : 1;
  const unit = rateScale === 1048576 ? 'B/s' : rateScale === 1024 ? 'KiB/s' : panel.unit;
  const series = rawSeries.map(item => ({...item, labels:Object.keys(item.labels || {}).length ? item.labels : {display_name:panel.title}, points:item.points.map(([time,value]) => [time, Number.isFinite(value) ? value * rateScale : null])}));
  const values = series.flatMap(item => item.points.map(([, value]) => value)).filter(Number.isFinite);
  const hasData = values.length > 0;
  const latestSampleTime = Math.max(0, ...series.flatMap(item => item.points.filter(([,value]) => Number.isFinite(value)).map(([time]) => time)));
  const updated = latestSampleTime ? new Date(latestSampleTime * 1000) : null;
  const stale = updated && Date.now() - updated.getTime() > Math.max(30, refreshInterval * 2) * 1000;
  const plot = (large = false) => {
    const width = large ? Math.min(1140, window.innerWidth - 86) : chartWidth, height = large ? 440 : 280;
    const left = 68, right = 18, top = 18, bottom = 34;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const binary = panel.title === 'Target scrape status';
    const min = binary ? 0 : Math.min(0, ...values);
    const max = binary ? 1 : Math.max(0, ...values) || 1;
    const safeMax = max === min ? max + 1 : max;
    const x = time => left + ((time - start) / Math.max(1, end - start)) * plotWidth;
    const y = value => top + (1 - (value - min) / (safeMax - min)) * plotHeight;
    return <div className="metric-plot">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${panel.title} history, ${unit}`} onMouseLeave={() => setHover(null)}>
        {[0, .25, .5, .75, 1].map(f => {
          const yy = top + plotHeight * f;
          return <g key={f}><line x1={left} x2={width - right} y1={yy} y2={yy} stroke="var(--chart-grid)" strokeDasharray="4 4"/><text x={left - 10} y={yy + 4} textAnchor="end" fill="var(--text-muted)" fontSize="12">{number(safeMax - (safeMax - min) * f)}</text></g>;
        })}
        {[0, .5, 1].map(f => <text key={f} x={left + plotWidth * f} y={height - 7} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} fill="var(--text-muted)" fontSize="12">{new Date((start + (end - start) * f) * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</text>)}
        {series.map((item, index) => {
          let penUp = true;
          const path = item.points.map(([time, value]) => {
            if (!Number.isFinite(value)) { penUp = true; return ''; }
            const point = `${penUp ? 'M' : 'L'}${x(time)},${y(value)}`;
            penUp = false;
            return point;
          }).join(' ');
          return <g key={index}><path d={path} fill="none" stroke={palette[index % palette.length]} strokeWidth="2.4" strokeLinejoin="round"/>
            {item.points.filter(([, value]) => Number.isFinite(value)).map(([time, value], pointIndex) => <circle key={pointIndex} cx={x(time)} cy={y(value)} r="8" fill="transparent" onMouseEnter={() => setHover({time, value, labels:item.labels, name:seriesName(item.labels, index)})} onFocus={() => setHover({time, value, labels:item.labels, name:seriesName(item.labels, index)})}><title>{`${seriesName(item.labels, index)}: ${number(value)} ${unit} at ${new Date(time * 1000).toLocaleString()}`}</title></circle>)}</g>;
        })}
      </svg>
      {hover && <div className="metric-tooltip" role="status"><strong>{hover.name}</strong><span>{new Date(hover.time * 1000).toLocaleString()} · {number(hover.value)} {unit}</span><small>{Object.entries(hover.labels || {}).filter(([key]) => key !== '__name__').map(([key,value]) => `${key}=${value}`).join(' · ') || 'No additional labels'}</small></div>}
    </div>;
  };

  const isStatus = panel.title === 'Target scrape status';
  const isDistribution = panel.title === 'Requests by status';
  const isUtilization = ['CPU utilization', 'Memory utilization', 'Filesystem usage'].includes(panel.title);
  const currentRows = series.map((item,index) => ({item, index, point:latestPoint(item)}));
  const aligned = currentRows.length > 0 && currentRows.every(row => row.point && row.point[0] === currentRows[0].point?.[0]);
  const total = aligned ? currentRows.reduce((sum,row) => sum + row.point[1], 0) : 0;
  const currentView = () => <div className="metric-current">
    <small>{isDistribution ? 'Latest request-rate distribution • req/s' : 'Latest sample per series • expand for history'}</small>
    {isDistribution && (aligned ? <div className="metric-stacked" aria-label="HTTP response rate distribution">{currentRows.map(({item,index,point}) => <span key={index} style={{width:`${total > 0 ? point[1] / total * 100 : 0}%`, background:palette[index % palette.length]}} title={`${seriesName(item.labels)}: ${number(point[1])} req/s`}/>)}</div> : <small>Aligned samples unavailable; no combined distribution shown.</small>)}
    {currentRows.map(({item,index,point}) => {
      const old = point && (Date.now()/1000 - point[0]) > Math.max(30,refreshInterval*2);
      const state = !point ? 'unknown' : old ? 'stale' : point[1] === 1 ? 'up' : point[1] === 0 ? 'down' : 'unknown';
      const name = panel.title === 'Filesystem usage' ? `${item.labels.mountpoint || 'Filesystem'} · ${item.labels.instance || item.labels.device || 'host'}` : seriesName(item.labels,index);
      return <div key={index} className={`metric-current-row ${isStatus ? 'metric-status' : ''}`} data-state={state} title={Object.entries(item.labels || {}).map(([key,value]) => `${key}=${value}`).join(' · ')}>
        <div className="metric-current-label"><span>{name}</span><strong>{isStatus ? state.toUpperCase() : point ? `${number(point[1])} ${unit}` : 'Unavailable'}</strong></div>
        {isUtilization && point && <div className="metric-track" role="meter" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,point[1])}><span style={{width:`${Math.max(0,Math.min(100,point[1]))}%`}}/></div>}
        <small>{point ? `${old ? 'Stale · ' : ''}${new Date(point[0]*1000).toLocaleTimeString()}` : 'No current sample'}</small>
      </div>;
    })}
  </div>;
  const content = (large = false) => <>
    {panel.error ? <div className="metric-empty" role="alert">{panel.error}</div> : !hasData ? <div className="metric-empty">No samples available in this time range.</div> : !large && (isStatus || isDistribution || isUtilization) ? currentView() : plot(large)}
    {hasData && <div className="metric-legend" aria-label="Chart series">{series.slice(0, 4).map((item, index) => <span key={index} title={Object.entries(item.labels || {}).map(([key,value]) => `${key}=${value}`).join(' · ')}><i style={{background:palette[index % palette.length]}}/>{seriesName(item.labels, index)} · {latestPoint(item) ? `${number(latestPoint(item)[1])} ${unit}` : 'Unavailable'}</span>)}{series.length > 4 && <span>+{series.length - 4} more</span>}</div>}
    {hasData && <><button className="metric-detail-toggle" onClick={() => setShowDetails(value => !value)} aria-expanded={showDetails}>Series details {showDetails ? '−' : '+'}</button>{showDetails && <div className="metric-series-details">{series.map((item,index) => <div key={index}><strong>{seriesName(item.labels,index)}</strong> · {latestPoint(item) ? `${number(latestPoint(item)[1])} ${unit}` : 'Unavailable'}<small>{Object.entries(item.labels || {}).map(([key,value]) => `${key}=${value}`).join(' · ') || 'No labels'}</small></div>)}</div>}</>}
  </>;

  return <><section ref={cardRef} className={`glass-panel metric-chart-card ${primary ? 'metric-chart-primary' : ''}`}>
    <div className="metric-chart-heading"><div><h3>{panel.title}</h3><p>{unit} · {updated ? `${stale ? 'Stale · ' : ''}Updated ${updated.toLocaleTimeString()}` : 'Awaiting telemetry'}</p></div><button className="metric-expand" onClick={() => {setHover(null);setExpanded(true);}} aria-label={`Expand ${panel.title} chart`} title="Expand chart">⤢</button></div>
    {content()}
  </section>
  {expanded && <div className="metric-modal-backdrop" onMouseDown={event => {if (event.target === event.currentTarget) setExpanded(false);}}><div className="metric-modal glass-panel" role="dialog" aria-modal="true" aria-label={`${panel.title} chart details`}><div className="metric-chart-heading"><div><h2>{panel.title}</h2><p>{unit} · {updated ? `Updated ${updated.toLocaleString()}` : 'Awaiting telemetry'}</p></div><button className="metric-expand" onClick={() => setExpanded(false)} aria-label="Close expanded chart">✕</button></div>{content(true)}</div></div>}
  </>;
}
