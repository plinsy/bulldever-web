/**
 * Shared types for the accident detection and reporting system.
 * Kept in a dedicated module (SRP) so any consumer can import
 * without depending on Three.js or React.
 */

export interface AccidentEvent {
    /** Unique identifier for this accident — "{minIdx}-{maxIdx}" */
    id: string;
    /** World-space position (Three.js scene units) at collision point */
    position: { x: number; y: number; z: number };
    /** Madagascar license plates of every vehicle involved */
    plates: string[];
    /** Whether a bodily injury was reported by the operator */
    bodily: boolean;
    /** Unix timestamp (ms) when the accident was registered */
    timestamp: number;
}
