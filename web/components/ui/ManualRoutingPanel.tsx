import { useState, useEffect, useRef } from "react";
import { Navigation, MapPin, Search, Loader2 } from "lucide-react";
import axios from "axios";
import type { LatLng } from "../world/geo";

interface ManualRoutingPanelProps {
    userLocation: LatLng | null;
}

interface AddressAutocompleteProps {
    placeholder: string;
    value: string;
    onChange: (val: string) => void;
    icon: React.ReactNode;
    onSelectCoord: (coord: LatLng | null) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    children?: React.ReactNode; // For the "Ma position" button
}

function AddressAutocomplete({ placeholder, value, onChange, icon, onSelectCoord, onKeyDown, children }: AddressAutocompleteProps) {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (value.length < 3 || value.toLowerCase() === "ma position") {
            setSuggestions([]);
            return;
        }
        const delayFn = setTimeout(async () => {
            try {
                // Use Photon API for autocomplete, biased towards Antananarivo
                const res = await axios.get(`https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&lat=-18.91&lon=47.52&limit=5`);
                if (res.data && res.data.features) {
                    setSuggestions(res.data.features);
                    setIsOpen(true);
                }
            } catch (e) {
                console.error(e);
            }
        }, 400); // 400ms debounce
        return () => clearTimeout(delayFn);
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="absolute top-1/2 left-3 -translate-y-1/2 flex items-center justify-center">
                {icon}
            </div>
            <input 
                type="text" 
                placeholder={placeholder} 
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    onSelectCoord(null); // Clear cached coord if user types
                    setIsOpen(true);
                }}
                onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
                className="input input-bordered w-full bg-base-200/50 pl-10 pr-12 focus:outline-none focus:border-primary transition-colors text-sm"
                onKeyDown={onKeyDown}
            />
            {children}
            
            {isOpen && suggestions.length > 0 && (
                <ul className="absolute z-[100] w-full bg-base-200 mt-1 rounded-xl shadow-2xl border border-base-content/10 max-h-60 overflow-y-auto">
                    {suggestions.map((s, i) => {
                        const name = s.properties.name || s.properties.street || s.properties.city || "Lieu inconnu";
                        const subtitle = [s.properties.street, s.properties.city, s.properties.district].filter(Boolean).join(", ");
                        return (
                            <li 
                                key={i} 
                                className="p-3 hover:bg-base-300 cursor-pointer text-sm border-b border-base-content/5 last:border-0"
                                onClick={() => {
                                    onChange(name);
                                    onSelectCoord({ lat: s.geometry.coordinates[1], lng: s.geometry.coordinates[0] });
                                    setIsOpen(false);
                                }}
                            >
                                <div className="font-bold text-base-content">{name}</div>
                                {subtitle && <div className="text-xs text-base-content/60">{subtitle}</div>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export default function ManualRoutingPanel({ userLocation }: ManualRoutingPanelProps) {
    const [startQuery, setStartQuery] = useState("");
    const [endQuery, setEndQuery] = useState("");
    const [startCoordCache, setStartCoordCache] = useState<LatLng | null>(null);
    const [endCoordCache, setEndCoordCache] = useState<LatLng | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [routeInfo, setRouteInfo] = useState<{ distance: number; time: number } | null>(null);

    const geocodeFallback = async (query: string): Promise<LatLng | null> => {
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
            let startCoord: LatLng | null = startCoordCache;
            let endCoord: LatLng | null = endCoordCache;
            
            // Resolve start
            if (!startCoord) {
                if (startQuery.toLowerCase() === "ma position" && userLocation) {
                    startCoord = userLocation;
                } else {
                    startCoord = await geocodeFallback(startQuery);
                }
            }

            // Resolve end
            if (!endCoord) {
                endCoord = await geocodeFallback(endQuery);
            }

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
            setStartCoordCache(userLocation);
        } else {
            setError("Position GPS non disponible");
        }
    };

    return (
        <div className="card bg-base-300/80 backdrop-blur-xl border border-white/10 shadow-2xl w-full max-w-md pointer-events-auto shrink-0">
            <div className="card-body p-6 gap-4">
                <h2 className="card-title text-lg flex items-center gap-2 text-white">
                    <Search className="text-primary" size={20} />
                    Calcul d'Itinéraire
                </h2>

                <div className="flex flex-col gap-3">
                    <AddressAutocomplete
                        placeholder="Point de départ"
                        value={startQuery}
                        onChange={setStartQuery}
                        onSelectCoord={setStartCoordCache}
                        icon={<div className="w-2 h-2 rounded-full border-2 border-primary"></div>}
                    >
                        <button 
                            onClick={useMyLocation}
                            className="btn btn-ghost btn-sm btn-square absolute top-1/2 right-1 -translate-y-1/2 text-base-content/50 hover:text-primary transition-colors"
                            title="Ma position"
                        >
                            <Navigation size={16} />
                        </button>
                    </AddressAutocomplete>

                    <div className="flex justify-start pl-4 py-1">
                        <div className="w-[1px] h-4 bg-base-content/20"></div>
                    </div>

                    <AddressAutocomplete
                        placeholder="Destination"
                        value={endQuery}
                        onChange={setEndQuery}
                        onSelectCoord={setEndCoordCache}
                        icon={<MapPin size={16} className="text-error" />}
                        onKeyDown={(e) => e.key === 'Enter' && handleRoute()}
                    />
                </div>

                {error && (
                    <div className="alert alert-error text-xs p-2 rounded-lg text-center flex justify-center">
                        {error}
                    </div>
                )}

                <button 
                    onClick={handleRoute}
                    disabled={isLoading}
                    className="btn btn-primary w-full mt-2 rounded-xl"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : "Tracer l'itinéraire"}
                </button>

                {routeInfo && (
                    <div className="flex justify-between items-center mt-2 p-3 bg-primary/10 border border-primary/30 rounded-xl">
                        <div className="flex flex-col">
                            <span className="text-xs text-base-content/60">Distance</span>
                            <span className="font-bold text-primary">{routeInfo.distance} km</span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-xs text-base-content/60">Durée est.</span>
                            <span className="font-bold text-primary">{routeInfo.time} min</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
