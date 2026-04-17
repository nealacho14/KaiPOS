import { useEffect, useState } from 'react';
import type { ApiResponse } from '@kaipos/shared';
import { API_VERSION } from '@kaipos/shared';
import { DebugWebSocket } from './pages/DebugWebSocket.js';

interface HealthData {
  service: string;
  version: string;
  database: string;
  databaseError?: string;
  timestamp: string;
}

function readHashRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash.replace(/^#/, '');
}

export function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<string>(() => readHashRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(readHashRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    // Same-origin: in dev, Vite proxies /api to the backend; in prod,
    // CloudFront proxies /api/* to API Gateway. No CORS, no absolute URL.
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: ApiResponse<HealthData>) => {
        if (data.success && data.data) {
          setHealth(data.data);
        }
      })
      .catch(() => setError('Could not connect to API'));
  }, []);

  if (route === '/debug/ws') {
    return <DebugWebSocket />;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>KaiPOS Admin</h1>
      <p>Version: {API_VERSION}</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {health && (
        <div>
          <p>API Status: {health.service}</p>
          <p>Database: {health.database}</p>
          {health.databaseError && <p style={{ color: 'red' }}>DB Error: {health.databaseError}</p>}
          <p>Timestamp: {health.timestamp}</p>
        </div>
      )}
      {!health && !error && <p>Loading...</p>}
      <p style={{ marginTop: '1.5rem', color: '#666' }}>
        Debug tools: <a href="#/debug/ws">WebSocket</a>
      </p>
    </div>
  );
}
