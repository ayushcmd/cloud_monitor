import React, {useEffect, useState} from 'react';
import {getStoredToken, API_BASE_URL} from '../api';
import {latestPoint} from './MetricChart';
import MetricGrid from './MetricGrid';
import DockerMetricsTab from './DockerMetricsTab';

const categories = [['host','Platform Host'], ['api','API Performance'], ['prometheus','Prometheus Health'], ['containers','Containers']];
const highlights = {
  host: ['CPU utilization', 'Memory utilization', 'Load 1 minute', 'Disk reads'],
  api: ['Requests', 'P95 latency', 'Server errors', 'In-flight requests'],
  prometheus: ['Targets up', 'Target scrape status', 'Scrape duration', 'Scrape samples'],
};
const primaryTitles = {
  host: ['CPU utilization', 'Memory utilization', 'Network receive', 'Network transmit'],
  api: ['Requests', 'P95 latency', 'Requests by status', 'Endpoint throughput'],
  prometheus: ['Target scrape status', 'Scrape duration'],
};

function formatValue(value) {
  return value == null ? '—' : value.toLocaleString(undefined, {maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1});
}

export function MetricKpis({panels, titles, refreshInterval}) {
  return <div className="metric-kpi-grid">{titles.map(title => {
    const panel = panels.find(item => item.title === title);
    const latest = (panel?.series || []).map(latestPoint).filter(Boolean).map(point => point[1]);
    const value = latest.length === 1 ? latest[0] : latest.length ? latest.reduce((sum, item) => sum + item, 0) / latest.length : null;
    const latestTime = Math.max(0, ...(panel?.series || []).map(latestPoint).filter(Boolean).map(point => point[0]));
    const time = latestTime ? new Date(latestTime * 1000) : null;
    const stale = time && Date.now() - time.getTime() > Math.max(30, refreshInterval * 2) * 1000;
    return <div className="glass-panel metric-kpi" key={title}><span>{title}</span><strong>{formatValue(value)}{value == null ? '' : <small> {panel.unit}</small>}</strong><small>{panel?.error ? 'Telemetry unavailable' : value == null ? 'No current sample' : `${latest.length > 1 ? `Mean of ${latest.length} series · ` : ''}${stale ? 'Stale · ' : ''}Updated ${time.toLocaleTimeString()}`}</small></div>;
  })}</div>;
}

export default function MetricsDashboard({refreshInterval = 10}) {
  const [category, setCategory] = useState('host');
  const [range, setRange] = useState('1h');
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (category === 'containers') { setError(''); return undefined; }
    let active = true, timer;
    const controller = new AbortController();
    setData(null); setLoading(true); setError('');
    async function poll() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/monitoring/dashboard?category=${category}&window=${range}`, {headers:{Authorization:`Bearer ${getStoredToken()}`}, signal:controller.signal});
        if (!response.ok) throw new Error(response.status === 401 ? 'Session expired. Sign in again.' : `Metrics request failed (${response.status})`);
        const result = await response.json();
        if (active) {setData(result); setError('');}
      } catch (failure) {if (active) setError(failure.message);}
      finally {if (active) {setLoading(false); timer = setTimeout(poll, Math.max(5, refreshInterval) * 1000);}}
    }
    poll();
    return () => {active = false; controller.abort(); clearTimeout(timer);};
  }, [category, range, refresh, refreshInterval]);

  const panels = data?.panels || [];
  const ordered = [...panels].sort((a,b) => {
    const priority = primaryTitles[category] || [];
    const ai = priority.indexOf(a.title), bi = priority.indexOf(b.title);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi);
  });
  return <div className="metrics-dashboard">
    <div className="glass-panel metric-toolbar"><div><h2>{category === 'containers' ? 'Docker container metrics' : 'Platform metrics'}</h2><p>{category === 'containers' ? 'Historical telemetry from your enrolled Docker hosts.' : 'Shared CloudMonitor infrastructure telemetry.'}</p></div><div className="metric-controls"><div className="metric-tabs" role="group" aria-label="Metrics category">{categories.map(([id,label]) => <button key={id} className={category === id ? 'active' : ''} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div><select aria-label="Metrics time range" value={range} onChange={event => setRange(event.target.value)}>{['15m','1h','6h','24h'].map(value => <option key={value}>{value}</option>)}</select><button className="metric-refresh" onClick={() => setRefresh(value => value + 1)}>Refresh</button></div></div>
    {category === 'containers' ? <DockerMetricsTab window={range} refreshInterval={refreshInterval} refresh={refresh}/> : <>
      {error && <div className="metric-message" role="alert">{error}{data ? ' Showing the last received data.' : ''}</div>}
      {loading && !data ? <div className="metric-loading" role="status">{[0,1,2,3].map(index => <div className="glass-panel" key={index}/>)}</div> : <>
        <MetricKpis panels={panels} titles={highlights[category]} refreshInterval={refreshInterval}/>
        <MetricGrid panels={ordered} isPrimary={panel => primaryTitles[category].includes(panel.title)} start={data?.start} end={data?.end} refreshInterval={refreshInterval}/>
      </>}
    </>}
  </div>;
}
