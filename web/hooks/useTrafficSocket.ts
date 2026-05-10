import { useEffect, useRef, useCallback, useState } from 'react';
import type { TrafficMetrics } from '../components/simulation/CarSystem';
import type { AccidentEvent } from '../components/simulation/accidentTypes';

export type CongestionAlert = {
    type: 'zone';
    zone_id: string;
    level: 'warning' | 'danger';
    message: string;
};

export function useTrafficSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const [alerts, setAlerts] = useState<CongestionAlert[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const connect = () => {
            const ws = new WebSocket('ws://127.0.0.1:8000/ws/traffic/');
            
            ws.onopen = () => {
                console.log('Connected to Traffic WebSocket');
                setIsConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.action === 'congestion_alerts') {
                        setAlerts(prev => [...prev, ...data.payload]);
                    }
                } catch (e) {
                    console.error('WebSocket message parsing error', e);
                }
            };

            ws.onclose = () => {
                console.log('Disconnected from Traffic WebSocket. Reconnecting in 3s...');
                setIsConnected(false);
                setTimeout(connect, 3000);
            };

            ws.onerror = (err) => {
                console.error('Traffic WebSocket error:', err);
                ws.close();
            };

            wsRef.current = ws;
        };

        connect();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    const sendSnapshot = useCallback((metrics: TrafficMetrics) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            const payload = {
                total_cars: metrics.totalCars,
                stopped_cars: metrics.stoppedCars,
                avg_speed_kmh: metrics.avgSpeedKmh,
                zone_counts: metrics.zoneStats
            };
            wsRef.current.send(JSON.stringify({
                action: 'snapshot',
                payload: payload
            }));
        }
    }, []);

    const sendAccident = useCallback((accident: AccidentEvent) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            const payload = {
                scene_x: accident.position.x,
                scene_z: accident.position.z,
                road_id: 0,
                bodily: accident.bodily
            };
            wsRef.current.send(JSON.stringify({
                action: 'accident',
                payload: payload
            }));
        }
    }, []);

    const clearAlerts = useCallback(() => setAlerts([]), []);

    return { isConnected, sendSnapshot, sendAccident, alerts, clearAlerts };
}
