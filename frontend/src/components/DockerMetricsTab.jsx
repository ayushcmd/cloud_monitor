import React, {useEffect, useState} from 'react';
import {getStoredToken, API_BASE_URL} from '../api';
import MetricGrid from './MetricGrid';

const ranges = {'15m':900, '1h':3600, '6h':21600, '24h':86400};
const identity = item => `${item.agent_id}:${item.container_id}`;

function makePanel(samples, ids, title, unit, field, rate = false) {
  const series = ids.map(id => {
    const rows = samples.filter(sample => identity(sample) === id);
    let previous = null;
    const points = rows.map(sample => {
      let value = sample[field];
      if (field === 'memory_percent') value = sample.memory_bytes != null && sample.memory_limit > 0 ? sample.memory_bytes / sample.memory_limit * 100 : null;
      if (rate) {
        const seconds = previous ? (new Date(sample.recorded_at) - new Date(previous.recorded_at)) / 1000 : 0;
        value = previous && value != null && previous[field] != null && seconds > 0 && value >= previous[field] ? (value - previous[field]) / seconds / 1048576 : null;
      } else if (unit === 'MiB' && value != null) value /= 1048576;
      previous = sample;
      return [new Date(sample.recorded_at).getTime() / 1000, value];
    });
    return {labels:{container:id}, points};
  });
  return {title, unit, series, updatedAt:samples.length ? new Date(samples.at(-1).recorded_at).getTime() / 1000 : null};
}

export default function DockerMetricsTab({window:range, refreshInterval, refresh}) {
  const [agents,setAgents] = useState([]), [containers,setContainers] = useState([]);
  const [agent,setAgent] = useState(''), [container,setContainer] = useState('');
  const [data,setData] = useState(null), [events,setEvents] = useState([]);
  const [loading,setLoading] = useState(true), [error,setError] = useState('');
  useEffect(() => {
    let active = true, timer;
    const controller = new AbortController();
    setLoading(true);
    async function load() {
      try {
        const headers = {Authorization:`Bearer ${getStoredToken()}`};
        const end = new Date(), start = new Date(end.getTime() - ranges[range] * 1000);
        const query = new URLSearchParams({start:start.toISOString(), end:end.toISOString(), step:String(Math.max(15, Math.ceil(ranges[range] / 220)))});
        if (agent) query.set('agent_id', agent);
        if (container) query.set('container_id', container);
        const paths = ['/api/v1/agents', '/api/v1/metrics/containers', `/api/v1/metrics/containers/history?${query}`, `/api/v1/metrics/containers/events?${query}`];
        const responses = await Promise.all(paths.map(path => fetch(`${API_BASE_URL}${path}`, {headers, signal:controller.signal})));
        if (responses.some(response => !response.ok)) throw new Error(`Telemetry request failed (${responses.find(response => !response.ok).status})`);
        const [agentRows, inventory, history, timeline] = await Promise.all(responses.map(response => response.json()));
        if (active) {setAgents(agentRows.filter(row => !row.is_revoked)); setContainers(inventory); setData(history); setEvents(timeline.events); setError('');}
      } catch (failure) {if (active) setError(failure.message);}
      finally {if (active) {setLoading(false); timer = setTimeout(load, Math.max(5,refreshInterval) * 1000);}}
    }
    load();
    return () => {active = false; clearTimeout(timer); controller.abort();};
  }, [agent, container, range, refresh, refreshInterval]);

  const visible = containers.filter(row => (!agent || String(row.agent_id) === agent) && (!container || row.container_id === container));
  const samples = data?.samples || [];
  const ids = [...new Set(samples.map(identity))];
  const counts = [
    ['Running', visible.filter(row => row.state === 'running' && ['running','unhealthy'].includes(row.monitoring_status)).length],
    ['Stopped', visible.filter(row => ['exited','dead','created','paused'].includes(row.monitoring_status)).length],
    ['Unhealthy', visible.filter(row => row.monitoring_status === 'unhealthy').length],
    ['Unavailable', visible.filter(row => ['agent_offline','telemetry_stale','removed'].includes(row.monitoring_status)).length],
  ];
  const panels = [
    makePanel(samples, ids, 'Container CPU', '%', 'cpu_percent'),
    makePanel(samples, ids, 'Memory used', 'MiB', 'memory_bytes'),
    makePanel(samples, ids, 'Memory utilization', '%', 'memory_percent'),
    makePanel(samples, ids, 'Network received', 'MiB/s', 'network_rx_bytes', true),
    makePanel(samples, ids, 'Network transmitted', 'MiB/s', 'network_tx_bytes', true),
    makePanel(samples, ids, 'Block reads', 'MiB/s', 'block_read_bytes', true),
    makePanel(samples, ids, 'Block writes', 'MiB/s', 'block_write_bytes', true),
  ];
  return <div className="metrics-dashboard">
    <div className="glass-panel metric-filterbar"><div><h3>Container history</h3><p>Choose a host and container. Rates come from consecutive counter samples.</p></div><div className="metric-controls"><select aria-label="Host" value={agent} onChange={event => {setAgent(event.target.value); setContainer('');}}><option value="">All hosts</option>{agents.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select aria-label="Container" value={container} onChange={event => setContainer(event.target.value)}><option value="">All containers</option>{containers.filter(row => !agent || String(row.agent_id) === agent).map(row => <option key={identity(row)} value={row.container_id}>{row.name}</option>)}</select></div></div>
    <div className="metric-kpi-grid">{counts.map(([label,value]) => <div className="glass-panel metric-kpi" key={label}><span>{label}</span><strong>{loading && !data ? '—' : value}</strong><small>{label === 'Unavailable' ? 'Offline, stale, or removed' : 'Latest inventory'}</small></div>)}</div>
    {loading && !data && <div className="metric-message" role="status">Loading container telemetry…</div>}
    {error && <div className="metric-message" role="alert">{error}{data ? ' Showing the last received data.' : ''}</div>}
    {!loading && !agents.length && <div className="metric-message">No agent connected. Enroll a Docker host to collect telemetry.</div>}
    {!loading && agents.length > 0 && !samples.length && <div className="metric-message">No historical samples in this time range. Current snapshots are not used to invent history.</div>}
    {!!samples.length && <MetricGrid panels={panels} isPrimary={(_, index) => index < 2} start={new Date(data.start).getTime()/1000} end={new Date(data.end).getTime()/1000} refreshInterval={refreshInterval}/>}
    <div className="metric-detail-grid"><section className="glass-panel metric-list"><h3>Inventory and freshness</h3>{visible.length ? visible.map(row => <div key={identity(row)}><strong>{row.name}</strong><span>{row.monitoring_status.replaceAll('_',' ')} · {row.health_status || 'No health check'} · {row.restart_count} restarts</span><small>Last telemetry {new Date(row.recorded_at).toLocaleString()}</small></div>) : <p>No containers in this selection.</p>}</section><section className="glass-panel metric-list"><h3>Observed lifecycle changes</h3>{events.length ? events.slice(-20).reverse().map((event,index) => <div key={index}><strong>{event.container_id}</strong><span>{event.state} · {event.health_status || 'No health check'} · {event.restart_count} restarts</span><small>{new Date(event.recorded_at).toLocaleString()}</small></div>) : <p>No transitions observed in this range.</p>}</section></div>
  </div>;
}
