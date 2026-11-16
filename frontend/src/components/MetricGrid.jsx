import React from 'react';
import MetricChart from './MetricChart';

export default function MetricGrid({panels, isPrimary, ...chartProps}) {
  return <>{[true, false].map(primary => {
    const group = panels.filter((panel, index) => isPrimary(panel, index) === primary);
    return group.length > 0 && <div key={String(primary)} className={`metric-chart-grid ${primary ? '' : 'metric-secondary-grid'}`}>
      {group.map(panel => <MetricChart key={panel.title} panel={panel} primary={primary} {...chartProps}/>)}
    </div>;
  })}</>;
}
