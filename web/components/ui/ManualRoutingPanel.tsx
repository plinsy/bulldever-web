import { useState } from "react";
import { Navigation, MapPin, Search, Loader2 } from "lucide-react";
import axios from "axios";
import type { LatLng } from "../world/geo";

interface ManualRoutingPanelProps {
    userLocation: LatLng | null;
}

export default function ManualRoutingPanel({ userLocation }: ManualRoutingPanelProps) {
    const [startQuery, setStartQuery] = useState("");
    const [endQuery, setEndQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [routeInfo, setRouteInfo] = useState<{ distance: number; time: number } | null>(null);

    const geocode = async (query: string): Promise<LatLng | null> => {
        try {
            const res = await axios.get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ", Antananarivo")}&format=json&limit=1`);
            if (res.data && res.data.length > 0) {
                return { lat: parseFloat(res.data[0].lat), lng: parseFloat(res.data[0].lon) };
            }
            return null;
        } catch (e) {
            console.error("Geocoding error", e);
            return null;
        }
    };

    const handleRoute = async () => {
        if (!startQuery || !endQuery) {
            setError("Veuillez remplir le départ et l'arrivée");
            return;
        }

        setIsLoading(true);
        setError(null);
        setRouteInfo(null);

        try {
            let startCoord: LatLng | null = null;
            
            if (startQuery.toLowerCase() === "ma position" && userLocation) {
                startCoord = userLocation;
            } else {
                startCoord = await geocode(startQuery);
            }

            const endCoord = await geocode(endQuery);

            if (!startCoord) {
                setError(`Impossible de trouver: ${startQuery}`);
                setIsLoading(false);
                return;
            }
            if (!endCoord) {
                setError(`Impossible de trouver: ${endQuery}`);
                setIsLoading(false);
                return;
            }

            const res = await axios.post("http://localhost:8000/api/pathfind/", {
                start: startCoord,
                end: endCoord
            });

            if (res.data.path) {
                // Dispatch event to Scene
                window.dispatchEvent(new CustomEvent('MAP_ACTION', {
                    detail: { type: 'SET_PATH', payload: res.data.path }
                }));
                window.dispatchEvent(new CustomEvent('MAP_ACTION', {
                    detail: { type: 'MOVE_CAMERA', payload: { lat: startCoord.lat, lng: startCoord.lng, zoom: 15 } }
                }));

                setRouteInfo({
                    distance: res.data.distance,
                    time: res.data.estimated_time
                });
            }

        } catch (err: any) {
            setError(err.response?.data?.error || "Erreur de routage");
        } finally {
            setIsLoading(false);
        }
    };

    const useMyLocation = () => {
        if (userLocation) {
            setStartQuery("Ma position");
        } else {
            setError("Position GPS non disponible");
        }
    };

    return (
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-6 rounded-3xl shadow-2xl flex flex-col gap-4 text-white w-full max-w-md pointer-events-auto">
            <h3 className="text-lg font-bold flex items-center gap-2">
                <Search className="text-blue-400" size={20} />
                Calcul d'Itinéraire
            </h3>

            <div className="flex flex-col gap-3">
                <div className="relative">
                    <div className="absolute top-1/2 left-3 -translate-y-1/2 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full border-2 border-blue-400"></div>
                    </div>
                    <input 
                        type="text" 
                        placeholder="Point de départ" 
                        value={startQuery}
                        onChange={(e) => setStartQuery(e.target.value)}
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-xl py-3 pl-10 pr-12 focus:outline-none focus:border-blue-500 transition-colors text-sm"
                    />
                    <button 
                        onClick={useMyLocation}
                        className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Ma position"
                    >
                        <Navigation size={16} />
                    </button>
                </div>

                <div className="flex justify-start pl-4 py-1">
                    <div className="w-[1px] h-4 bg-slate-700"></div>
                </div>

                <div className="relative">
                    <div className="absolute top-1/2 left-3 -translate-y-1/2 flex items-center justify-center">
                        <MapPin size={14} className="text-red-400" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Destination" 
                        value={endQuery}
                        onChange={(e) => setEndQuery(e.target.value)}
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-red-500 transition-colors text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && handleRoute()}
                    />
                </div>
            </div>

            {error && (
                <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded-lg text-center">
                    {error}
                </div>
            )}

            <button 
                onClick={handleRoute}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95 flex justify-center items-center gap-2 mt-2"
            >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : "Tracer l'itinéraire"}
            </button>

            {routeInfo && (
                <div className="flex justify-between items-center mt-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-400">Distance</span>
                        <span className="font-bold text-blue-400">{routeInfo.distance} km</span>
                    </div>
                    <div className="flex flex-col text-right">
                        <span className="text-xs text-slate-400">Durée est.</span>
                        <span className="font-bold text-blue-400">{routeInfo.time} min</span>
                    </div>
                </div>
            )}
        </div>
    );
}
