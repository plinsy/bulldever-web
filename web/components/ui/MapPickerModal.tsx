"use client";

import { useEffect, useRef } from "react";
import { MapPin, X, Check } from "lucide-react";
import "leaflet/dist/leaflet.css";

// Antananarivo center
const CENTER: [number, number] = [-18.9137, 47.5361];
const ZOOM = 14;

export interface PickedPoints {
    origin: [number, number] | null;
    destination: [number, number] | null;
}

interface MapPickerModalProps {
    open: boolean;
    points: PickedPoints;
    pickingStep: "origin" | "destination";
    onMapClick: (lat: number, lng: number) => void;
    onConfirm: () => void;
    onClose: () => void;
    onStepChange: (step: "origin" | "destination") => void;
}

export default function MapPickerModal({
    open,
    points,
    pickingStep,
    onMapClick,
    onConfirm,
    onClose,
    onStepChange,
}: MapPickerModalProps) {
    const mapRef = useRef<import("leaflet").Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const originMarkerRef = useRef<import("leaflet").Marker | null>(null);
    const destMarkerRef = useRef<import("leaflet").Marker | null>(null);
    const onMapClickRef = useRef(onMapClick);
    useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

    // Initialize map once
    useEffect(() => {
        if (!open || !containerRef.current || mapRef.current) return;

        let L: typeof import("leaflet");
        import("leaflet").then((mod) => {
            L = mod.default;

            // Fix default icon paths broken by webpack
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
                iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
                shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
            });

            const map = L.map(containerRef.current!, { center: CENTER, zoom: ZOOM });
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "© OpenStreetMap contributors",
            }).addTo(map);

            map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
                onMapClickRef.current(e.latlng.lat, e.latlng.lng);
            });

            mapRef.current = map;
        });

        return () => {
            mapRef.current?.remove();
            mapRef.current = null;
            originMarkerRef.current = null;
            destMarkerRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Sync markers when points change
    useEffect(() => {
        if (!mapRef.current) return;
        import("leaflet").then((mod) => {
            const L = mod.default;

            // Origin marker (green)
            if (points.origin) {
                const greenIcon = L.divIcon({
                    className: "",
                    html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.5)"></div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7],
                });
                if (originMarkerRef.current) {
                    originMarkerRef.current.setLatLng(points.origin);
                } else {
                    originMarkerRef.current = L.marker(points.origin, { icon: greenIcon })
                        .bindTooltip("Départ", { permanent: true, direction: "top", offset: [0, -10] })
                        .addTo(mapRef.current!);
                }
            }

            // Destination marker (red)
            if (points.destination) {
                const redIcon = L.divIcon({
                    className: "",
                    html: `<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.5)"></div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7],
                });
                if (destMarkerRef.current) {
                    destMarkerRef.current.setLatLng(points.destination);
                } else {
                    destMarkerRef.current = L.marker(points.destination, { icon: redIcon })
                        .bindTooltip("Destination", { permanent: true, direction: "top", offset: [0, -10] })
                        .addTo(mapRef.current!);
                }
            }
        });
    }, [points]);

    if (!open) return null;

    const canConfirm = points.origin !== null && points.destination !== null;

    return (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <MapPin size={18} className="text-blue-400" />
                        <span className="text-white font-semibold text-sm">Sélectionner sur la carte</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Step indicator */}
                <div className="flex gap-2 px-5 py-3 border-b border-slate-700/50">
                    <button
                        onClick={() => onStepChange("origin")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            pickingStep === "origin"
                                ? "bg-green-900/50 border-green-600 text-green-300"
                                : points.origin
                                ? "bg-slate-800 border-green-700/40 text-green-400"
                                : "bg-slate-800 border-slate-600 text-slate-400"
                        }`}
                    >
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-green-500 text-white">1</span>
                        Départ
                        {points.origin && <Check size={11} className="text-green-400" />}
                    </button>
                    <span className="self-center text-slate-600 text-xs">→</span>
                    <button
                        onClick={() => onStepChange("destination")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            pickingStep === "destination"
                                ? "bg-red-900/50 border-red-600 text-red-300"
                                : points.destination
                                ? "bg-slate-800 border-red-700/40 text-red-400"
                                : "bg-slate-800 border-slate-600 text-slate-400"
                        }`}
                    >
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-red-500 text-white">2</span>
                        Destination
                        {points.destination && <Check size={11} className="text-red-400" />}
                    </button>

                    <p className="ml-auto self-center text-slate-500 text-xs italic">
                        {pickingStep === "origin"
                            ? "Cliquez pour marquer votre départ"
                            : "Cliquez pour marquer votre destination"}
                    </p>
                </div>

                {/* Map */}
                <div ref={containerRef} style={{ height: 380 }} className="w-full" />

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={!canConfirm}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-2 transition-colors"
                    >
                        <Check size={14} />
                        Confirmer la sélection
                    </button>
                </div>
            </div>
        </div>
    );
}
