"""Authenticated, bounded platform telemetry; shared infrastructure, not tenant hosts."""
import asyncio
import math
import os
import time
import httpx
from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.auth.security import get_current_user

router = APIRouter()
QUERIES = {
"host": {
"CPU utilization|%": '100 - avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100',
"CPU per core|%": '100 - rate(node_cpu_seconds_total{mode="idle"}[5m]) * 100',
"Memory used|GiB": '(node_memory_MemTotal_bytes-node_memory_MemAvailable_bytes)/1073741824',
"Memory available|GiB": 'node_memory_MemAvailable_bytes/1073741824',
"Memory utilization|%": '(1-node_memory_MemAvailable_bytes/node_memory_MemTotal_bytes)*100',
"Load 1 minute|load": 'node_load1',
"Load 5 minutes|load": 'node_load5',
"Load 15 minutes|load": 'node_load15',
"Filesystem usage|%": '(1-node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"}/node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"})*100',
"Disk reads|MiB/s": 'rate(node_disk_read_bytes_total[5m])/1048576',
"Disk writes|MiB/s": 'rate(node_disk_written_bytes_total[5m])/1048576',
"Network receive|MiB/s": 'rate(node_network_receive_bytes_total{device!="lo"}[5m])/1048576',
"Network transmit|MiB/s": 'rate(node_network_transmit_bytes_total{device!="lo"}[5m])/1048576',
},
"api": {
"Requests|req/s": 'sum(rate(cloudmonitor_http_requests_total[5m]))',
"Client errors|req/s": 'sum(rate(cloudmonitor_http_requests_total{status_code=~"4.."}[5m]))',
"Server errors|req/s": 'sum(rate(cloudmonitor_http_requests_total{status_code=~"5.."}[5m]))',
"Requests by status|req/s": 'sum by(status_code)(rate(cloudmonitor_http_requests_total[5m]))',
"Endpoint throughput|req/s": 'topk(10,sum by(endpoint)(rate(cloudmonitor_http_requests_total[5m])))',
"In-flight requests|requests": 'cloudmonitor_active_requests',
},
"prometheus": {
"Target scrape status|0 or 1": 'up',
"Targets up|targets": 'sum(up)',
"Scrape duration|ms": 'scrape_duration_seconds*1000',
"Scrape samples|samples": 'scrape_samples_scraped',
}}
for q in (50,90,95,99):
    QUERIES['api'][f'P{q} latency|ms'] = f'histogram_quantile({q/100},sum by(le)(rate(cloudmonitor_http_request_duration_seconds_bucket[5m])))*1000'

PROMETHEUS_BASE = os.getenv('PROMETHEUS_URL', 'http://prometheus:9090').rstrip('/')

ALLOWED_PROMQL_EXACT = {
    'histogram_quantile(0.95, sum by (le) (rate(cloudmonitor_http_request_duration_seconds_bucket[1m])))',
    'cloudmonitor_active_requests',
    'cloudmonitor_simulated_errors_total',
    '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)',
    '((1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100)',
    'up',
}
for cat_queries in QUERIES.values():
    for expr in cat_queries.values():
        ALLOWED_PROMQL_EXACT.add(expr)

def is_safe_promql(query_str: str) -> bool:
    if not query_str or not isinstance(query_str, str):
        return False
    cleaned = query_str.strip()
    if cleaned in ALLOWED_PROMQL_EXACT:
        return True
    # Disallow administrative/mutation commands and semicolon chaining
    if any(forbidden in cleaned.lower() for forbidden in [";", "delete", "drop", "quit", "reload", "admin", "exec"]):
        return False
    # Safe metric query prefixes
    safe_prefixes = ("cloudmonitor_", "node_", "up", "sum(", "avg(", "rate(", "100 -", "histogram_quantile(")
    return any(cleaned.startswith(p) for p in safe_prefixes)

@router.get('/dashboard')
async def dashboard(category: str = Query('host', pattern='^(host|api|prometheus)$'), window: str = Query('1h', pattern='^(15m|1h|6h|24h)$'), user=Depends(get_current_user)):
    end = int(time.time())
    seconds = {'15m':900,'1h':3600,'6h':21600,'24h':86400}[window]
    gate = asyncio.Semaphore(4)
    async with httpx.AsyncClient(timeout=8) as client:
        async def panel(key, expression):
            title, unit = key.split('|')
            result = {'title':title,'unit':unit,'series':[], 'error':None}
            try:
                async with gate:
                    response = await client.get(f"{PROMETHEUS_BASE}/api/v1/query_range", params={'query':expression,'start':end-seconds,'end':end,'step':max(15,seconds//240)})
                    response.raise_for_status()
                    body=response.json()
                    if body.get('status') != 'success':
                        raise ValueError('Query unsuccessful')
                    for series in body['data']['result'][:32]:
                        points=[]
                        for ts,value in series.get('values',[]):
                            number=float(value)
                            points.append([ts,number if math.isfinite(number) else None])
                        result['series'].append({'labels':series['metric'],'points':points})
                result['updatedAt']=end
            except (httpx.HTTPError,ValueError,KeyError,TypeError):
                result['error']='Telemetry unavailable. Retry shortly.'
            return result
        panels=await asyncio.gather(*(panel(k,v) for k,v in QUERIES[category].items()))
    return {'scope':'Shared CloudMonitor platform infrastructure','start':end-seconds,'end':end,'panels':panels}

@router.get('/targets')
async def get_targets(user=Depends(get_current_user)):
    """Authenticated endpoint proxying Prometheus scrape targets."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{PROMETHEUS_BASE}/api/v1/targets")
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Prometheus targets query failed: {str(e)}")

@router.get('/alerts')
async def get_alerts(user=Depends(get_current_user)):
    """Authenticated endpoint proxying Prometheus active alerts."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{PROMETHEUS_BASE}/api/v1/alerts")
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Prometheus alerts query failed: {str(e)}")

@router.get('/rules')
async def get_rules(user=Depends(get_current_user)):
    """Authenticated endpoint proxying Prometheus alert rules."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{PROMETHEUS_BASE}/api/v1/rules")
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Prometheus rules query failed: {str(e)}")

@router.get('/query')
async def query_instant(query: str = Query(...), user=Depends(get_current_user)):
    """Authenticated, validated endpoint proxying Prometheus instant queries."""
    if not is_safe_promql(query):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PromQL expression is not permitted or failed security validation."
        )
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{PROMETHEUS_BASE}/api/v1/query", params={"query": query})
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Prometheus query failed: {str(e)}")

@router.get('/query_range')
async def query_range(
    query: str = Query(...),
    start: float = Query(...),
    end: float = Query(...),
    step: str = Query("15s"),
    user=Depends(get_current_user)
):
    """Authenticated, bounded endpoint proxying Prometheus range queries."""
    if not is_safe_promql(query):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PromQL expression is not permitted or failed security validation."
        )
    if end < start or (end - start) > 7 * 86400:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid time range parameters. Maximum permitted range is 7 days."
        )
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(
                f"{PROMETHEUS_BASE}/api/v1/query_range",
                params={"query": query, "start": start, "end": end, "step": step}
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Prometheus query_range failed: {str(e)}")
