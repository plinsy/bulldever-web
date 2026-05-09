/**
 * Types for the adaptive traffic-light control system (SRP).
 * Kept isolated so CarSystem and TrafficLightSystem depend on
 * this module without depending on each other (DIP).
 */

/**
 * 0 = phase-A green
 * 1 = yellow (brief all-stop transition)
 * 2 = phase-B green
 * 3 = yellow (brief all-stop transition)
 */
export type TrafficPhase = 0 | 1 | 2 | 3;

/** Adaptive signal state for one signaled intersection. */
export interface IntersectionSignal {
    /** Index assigned at derivation time */
    idx: number;
    /** Scene-space position of the intersection centre */
    position: { x: number; z: number };
    /** Road indices whose traffic receives green during phase A (phase 0) */
    phaseARoads: ReadonlySet<number>;
    /** Road indices whose traffic receives green during phase B (phase 2) */
    phaseBRoads: ReadonlySet<number>;
    /** Current signal phase (see TrafficPhase) */
    currentPhase: TrafficPhase;
    /** Seconds elapsed in the current phase */
    phaseTimer: number;
    /** Adaptive green duration for phase A, recomputed at each transition */
    phaseADuration: number;
    /** Adaptive green duration for phase B, recomputed at each transition */
    phaseBDuration: number;
    /**
     * Cars queued on phase-A roads at this intersection this frame.
     * Written by CarSystem, read by TrafficLightSystem to adapt timing.
     */
    phaseAQueueCount: number;
    /**
     * Cars queued on phase-B roads at this intersection this frame.
     * Written by CarSystem, read by TrafficLightSystem to adapt timing.
     */
    phaseBQueueCount: number;
}

/** Shared mutable map: written by TrafficLightSystem (phase), by CarSystem (queues). */
export type TrafficSignalMap = Map<number, IntersectionSignal>;
