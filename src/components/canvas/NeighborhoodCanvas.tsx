import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { DistrictGrid, Amenity, Position } from '../../types/urban';
import type { CitizenPersona, CitizenSimResult } from '../../types/citizen';
import type { PerpPersona } from '../../types/perp';
import type { ArchitectTool } from './ArchitectToolbar';

interface Props {
  grid: DistrictGrid;
  citizens: CitizenPersona[];
  simResults: CitizenSimResult[];
  perps: PerpPersona[];
  currentHour: number;
  viewMode: 'REALISTIC' | 'FEAR_HEATMAP' | 'FOOT_TRAFFIC';
  selectedCitizenId: string | null;
  onSelectCitizen: (id: string) => void;
  onTileClick?: (pos: Position) => void;
  selectedTool: ArchitectTool;
  onSelectPerp?: (id: string) => void;
}

// 3D Building block with architectural details
function BuildingMesh({
  x,
  y,
  type,
  height,
  isNight,
}: {
  x: number;
  y: number;
  type: string;
  height: number;
  isNight: boolean;
}) {
  const { wallColor, roofColor, trimColor } = useMemo(() => {
    if (type === 'RESIDENTIAL') {
      return {
        wallColor: isNight ? '#2e3d59' : '#4b638a',
        roofColor: isNight ? '#1e293b' : '#334155',
        trimColor: isNight ? '#475569' : '#cbd5e1',
      };
    } else if (type === 'COMMERCIAL') {
      return {
        wallColor: isNight ? '#4a2c6d' : '#7c3aed',
        roofColor: isNight ? '#2e1065' : '#5b21b6',
        trimColor: isNight ? '#ec4899' : '#f472b6',
      };
    } else if (type === 'TRANSIT_HUB') {
      return {
        wallColor: isNight ? '#1e40af' : '#2563eb',
        roofColor: isNight ? '#0f172a' : '#1e3a8a',
        trimColor: isNight ? '#38bdf8' : '#60a5fa',
      };
    }
    return {
      wallColor: '#334155',
      roofColor: '#1e293b',
      trimColor: '#64748b',
    };
  }, [type, isNight]);

  const windowGlow = isNight ? '#fde047' : '#bae6fd';

  return (
    <group position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
      {/* Base Foundation */}
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[0.96, 0.16, 0.96]} />
        <meshStandardMaterial color={trimColor} roughness={0.7} />
      </mesh>

      {/* Main Building Body */}
      <mesh position={[0, height / 2 + 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.88, height, 0.88]} />
        <meshStandardMaterial color={wallColor} roughness={0.4} metalness={0.15} />
      </mesh>

      {/* Roof Cap */}
      <mesh position={[0, height + 0.12, 0]} castShadow>
        <boxGeometry args={[0.92, 0.08, 0.92]} />
        <meshStandardMaterial color={roofColor} roughness={0.5} />
      </mesh>

      {/* Windows */}
      {height >= 1.2 && (
        <>
          <mesh position={[0, height * 0.65, 0.45]}>
            <planeGeometry args={[0.62, 0.32]} />
            <meshBasicMaterial color={windowGlow} />
          </mesh>
          {height >= 2.0 && (
            <mesh position={[0, height * 0.35, 0.45]}>
              <planeGeometry args={[0.62, 0.32]} />
              <meshBasicMaterial color={windowGlow} />
            </mesh>
          )}
        </>
      )}

      {/* Commercial Awning */}
      {type === 'COMMERCIAL' && (
        <mesh position={[0, 0.7, 0.48]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.82, 0.05, 0.25]} />
          <meshStandardMaterial color="#ec4899" roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

// Park with rich trees and bench
function ParkTile({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[0.96, 0.08, 0.96]} />
        <meshStandardMaterial color="#15803d" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.25, 0.07, 0.96]} />
        <meshStandardMaterial color="#78716c" roughness={0.9} />
      </mesh>
      <group position={[0.22, 0, 0.2]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.6, 8]} />
          <meshStandardMaterial color="#78350f" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.65, 0]} castShadow>
          <coneGeometry args={[0.36, 0.55, 8]} />
          <meshStandardMaterial color="#22c55e" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.95, 0]} castShadow>
          <coneGeometry args={[0.26, 0.45, 8]} />
          <meshStandardMaterial color="#4ade80" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

// Streetlight fixture with bright golden volumetric glow pool
function StreetlightFixture({
  amenity,
  isNight,
}: {
  amenity: Amenity;
  isNight: boolean;
}) {
  const { x, y } = amenity.position;
  return (
    <group position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.2, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 1.3, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <coneGeometry args={[0.16, 0.12, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.32, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial
          color={isNight ? '#fef08a' : '#cbd5e1'}
          emissive={isNight ? '#fde047' : '#000000'}
          emissiveIntensity={isNight ? 3.5 : 0}
        />
      </mesh>

      {isNight && (
        <>
          <pointLight
            position={[0, 1.35, 0]}
            color="#fef08a"
            intensity={4.0}
            distance={6.0}
            decay={1.4}
          />
          {/* Primary Golden Light Pool */}
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[amenity.radius * 1.15, 32]} />
            <meshBasicMaterial
              color="#fbbf24"
              transparent
              opacity={0.36}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* Soft Outer Halo */}
          <mesh position={[0, 0.048, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[amenity.radius * 1.85, 32]} />
            <meshBasicMaterial
              color="#f59e0b"
              transparent
              opacity={0.16}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

// Police SOS Booth Fixture
function PoliceBoothFixture({
  amenity,
  isNight,
}: {
  amenity: Amenity;
  isNight: boolean;
}) {
  const { x, y } = amenity.position;
  const beaconRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (beaconRef.current && isNight) {
      beaconRef.current.intensity = 2.5 + Math.sin(clock.getElapsedTime() * 10) * 2.0;
    }
  });

  return (
    <group position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
      {/* Base platform */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.8, 0.12, 0.8]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {/* Booth Body */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[0.65, 1.25, 0.65]} />
        <meshStandardMaterial color="#1e3a8a" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Police Badge */}
      <mesh position={[0, 1.15, 0.34]}>
        <planeGeometry args={[0.45, 0.18]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      {/* Flashing Blue Beacon Light */}
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#0284c7"
          emissiveIntensity={isNight ? 4.0 : 0.5}
        />
      </mesh>
      {isNight && (
        <pointLight
          ref={beaconRef}
          position={[0, 1.5, 0]}
          color="#38bdf8"
          distance={7.5}
          decay={1.2}
        />
      )}
      {/* Blue Safety Perimeter Aura */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.8, 3.2, 32]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

// Public Restroom Pod
function RestroomPod({ amenity }: { amenity: Amenity }) {
  const { x, y } = amenity.position;
  return (
    <group position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.85, 0.1, 0.85]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.75, 1.1, 0.75]} />
        <meshStandardMaterial color="#0284c7" roughness={0.25} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.22, 0]}>
        <boxGeometry args={[0.55, 0.16, 0.12]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
    </group>
  );
}

// Transit Bus Stop Shelter
function BusStopFixture({ amenity }: { amenity: Amenity }) {
  const { x, y } = amenity.position;
  return (
    <group position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.8, 0.08, 0.6]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* Glass Shelter Back */}
      <mesh position={[0, 0.55, -0.25]}>
        <boxGeometry args={[0.75, 1.0, 0.05]} />
        <meshStandardMaterial color="#0284c7" transparent opacity={0.6} />
      </mesh>
      {/* Roof Canopy */}
      <mesh position={[0, 1.08, 0]}>
        <boxGeometry args={[0.85, 0.06, 0.65]} />
        <meshStandardMaterial color="#10b981" />
      </mesh>
      {/* Bus Sign */}
      <mesh position={[0.35, 1.25, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 16]} />
        <meshBasicMaterial color="#10b981" />
      </mesh>
    </group>
  );
}

// Comic 3D Speech Bubble for Citizens & Perps
function FloatingSpeechBubble({
  text,
  emoji,
  variant,
}: {
  text: string;
  emoji: string;
  variant: 'danger' | 'caution' | 'safe' | 'transit' | 'perp' | 'normal';
}) {
  const { bg, border, textColor } = useMemo(() => {
    if (variant === 'danger') {
      return { bg: 'rgba(220, 38, 38, 0.95)', border: '#f87171', textColor: '#ffffff' };
    }
    if (variant === 'caution') {
      return { bg: 'rgba(217, 119, 6, 0.95)', border: '#fbbf24', textColor: '#ffffff' };
    }
    if (variant === 'safe') {
      return { bg: 'rgba(16, 185, 129, 0.95)', border: '#34d399', textColor: '#ffffff' };
    }
    if (variant === 'transit') {
      return { bg: 'rgba(14, 165, 233, 0.95)', border: '#38bdf8', textColor: '#ffffff' };
    }
    if (variant === 'perp') {
      return { bg: 'rgba(88, 28, 135, 0.95)', border: '#c084fc', textColor: '#f3e8ff' };
    }
    return { bg: 'rgba(30, 41, 59, 0.92)', border: '#64748b', textColor: '#f8fafc' };
  }, [variant]);

  return (
    <Html
      position={[0, 1.52, 0]}
      center
      style={{ pointerEvents: 'none' }}
      zIndexRange={[100, 0]}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: bg,
          border: `1.5px solid ${border}`,
          borderRadius: '999px',
          fontSize: '11px',
          fontWeight: 600,
          color: textColor,
          boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          whiteSpace: 'nowrap',
          transform: 'translateY(-6px)',
          animation: 'floatBob 2s ease-in-out infinite',
        }}
      >
        <span style={{ fontSize: '13px' }}>{emoji}</span>
        <span>{text}</span>
      </div>
    </Html>
  );
}

// 🦹 Suspicious Perp / Criminal Agent in 3D
function PerpAgentMesh({
  perp,
  isNight,
  isDeterred,
  onClick,
}: {
  perp: PerpPersona;
  isNight: boolean;
  isDeterred: boolean;
  onClick?: () => void;
}) {
  const { x, y } = perp.position;
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Sinister lurking hover
      groupRef.current.position.y = isDeterred
        ? Math.sin(clock.getElapsedTime() * 12) * 0.08
        : Math.sin(clock.getElapsedTime() * 3) * 0.02;
    }
  });

  if (!isNight && !perp.isCustomPlaced) return null;

  const bubbleText = isDeterred
    ? 'Argh! Too bright here! Running away!'
    : perp.state === 'STALKING'
    ? 'Target spotted in dark alley! Approaching...'
    : perp.speechText;

  const bubbleEmoji = isDeterred ? '🏃' : perp.state === 'STALKING' ? '😈' : '🦹';
  const bubbleVariant = isDeterred ? 'danger' : 'perp';

  return (
    <group
      ref={groupRef}
      position={[x - 8 + 0.5, 0, y - 8 + 0.5]}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick();
      }}
    >
      {/* Sinister Red Pulsing Threat Aura Ring */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.26, 0.45, 24]} />
        <meshBasicMaterial
          color={isDeterred ? '#f59e0b' : '#ef4444'}
          transparent
          opacity={isDeterred ? 0.4 : 0.85}
        />
      </mesh>

      {/* Hooded Cloak Body */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.42, 6, 12]} />
        <meshStandardMaterial
          color={isDeterred ? '#6b7280' : '#1e1b4b'}
          roughness={0.8}
          transparent={isDeterred}
          opacity={isDeterred ? 0.6 : 1.0}
        />
      </mesh>

      {/* Masked Head */}
      <mesh position={[0, 0.86, 0]} castShadow>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial color={isDeterred ? '#4b5563' : '#312e81'} roughness={0.7} />
      </mesh>

      {/* Glowing Crimson Eyes / Indicator */}
      <mesh position={[0, 0.88, 0.14]}>
        <planeGeometry args={[0.14, 0.04]} />
        <meshBasicMaterial color={isDeterred ? '#9ca3af' : '#ef4444'} />
      </mesh>

      {/* Floating 3D Comic Speech Bubble */}
      <FloatingSpeechBubble
        text={bubbleText}
        emoji={bubbleEmoji}
        variant={bubbleVariant}
      />
    </group>
  );
}

// Moving Citizen in 3D with Dynamic Speech Bubbles
function AnimatedCitizen({
  citizen,
  result,
  currentHour,
  isSelected,
  onClick,
  perps,
  grid,
}: {
  citizen: CitizenPersona;
  result: CitizenSimResult;
  currentHour: number;
  isSelected: boolean;
  onClick: () => void;
  perps: PerpPersona[];
  grid: DistrictGrid;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const isNight = currentHour >= 18 || currentHour < 6;

  // Compute position along path based on sim time
  const currentPos = useMemo(() => {
    if (!result || !result.path.length) return citizen.origin;

    const startH = result.departureTime;
    const endH = result.arrivalTime;

    if (currentHour < startH) return result.path[0];
    if (currentHour >= endH) return result.path[result.path.length - 1];

    const progress = Math.max(0, Math.min(1, (currentHour - startH) / (endH - startH || 0.01)));
    const targetIdx = progress * (result.path.length - 1);
    const lowIdx = Math.floor(targetIdx);
    const highIdx = Math.min(result.path.length - 1, Math.ceil(targetIdx));
    const factor = targetIdx - lowIdx;

    const p1 = result.path[lowIdx];
    const p2 = result.path[highIdx];

    return {
      x: p1.x + (p2.x - p1.x) * factor,
      y: p1.y + (p2.y - p1.y) * factor,
    };
  }, [result, currentHour, citizen.origin]);

  // Proximity to threats and lighting
  const { speechText, speechEmoji, speechVariant, fearLevel } = useMemo(() => {
    // Check if lit
    const lit = grid.amenities.some((a) => {
      const isLitType = a.type === 'STREETLIGHT' || a.type === 'POLICE_KIOSK';
      if (!isLitType) return false;
      const d = Math.hypot(a.position.x - currentPos.x, a.position.y - currentPos.y);
      return d <= a.radius;
    });

    // Check if near police
    const nearPolice = grid.amenities.some(
      (a) =>
        a.type === 'POLICE_KIOSK' &&
        Math.hypot(a.position.x - currentPos.x, a.position.y - currentPos.y) <= 4.0
    );

    // Check if threatened by any active perp in dark
    const perpThreat =
      isNight &&
      !lit &&
      perps.some((p) => {
        const perpLit = grid.amenities.some(
          (a) =>
            (a.type === 'STREETLIGHT' || a.type === 'POLICE_KIOSK') &&
            Math.hypot(a.position.x - p.position.x, a.position.y - p.position.y) <= a.radius
        );
        if (perpLit) return false;
        return Math.hypot(p.position.x - currentPos.x, p.position.y - currentPos.y) <= p.threatRadius;
      });

    if (perpThreat) {
      return {
        speechText: "Someone's following me! Need to run!",
        speechEmoji: '😱',
        speechVariant: 'danger' as const,
        fearLevel: 95,
      };
    }

    if (result.usedNightBus && isNight) {
      return {
        speechText: 'Riding Night Bus, safely avoids dark roads!',
        speechEmoji: '🚌',
        speechVariant: 'transit' as const,
        fearLevel: 15,
      };
    }

    if (nearPolice) {
      return {
        speechText: 'Police SOS booth active, feeling protected',
        speechEmoji: '👮',
        speechVariant: 'safe' as const,
        fearLevel: 10,
      };
    }

    if (lit && isNight) {
      return {
        speechText: 'Safe lit stretch! Thank god for lighting',
        speechEmoji: '💡',
        speechVariant: 'safe' as const,
        fearLevel: 25,
      };
    }

    if (isNight && !lit) {
      return {
        speechText: 'Bohot andhera hai... walking faster',
        speechEmoji: '😨',
        speechVariant: 'caution' as const,
        fearLevel: 80,
      };
    }

    return {
      speechText: `On way to ${citizen.destinationName}`,
      speechEmoji: '🚶',
      speechVariant: 'normal' as const,
      fearLevel: 10,
    };
  }, [currentPos, grid.amenities, isNight, perps, result.usedNightBus, citizen.destinationName]);

  // Color by role
  const { color, auraColor } = useMemo(() => {
    if (citizen.role.includes('Nurse')) return { color: '#ec4899', auraColor: '#f472b6' };
    if (citizen.mobility === 'WHEELCHAIR' || citizen.mobility === 'CANE_SENIOR')
      return { color: '#f59e0b', auraColor: '#fbbf24' };
    if (citizen.role.includes('Student') || citizen.role.includes('Barista'))
      return { color: '#38bdf8', auraColor: '#7dd3fc' };
    return { color: '#818cf8', auraColor: '#a5b4fc' };
  }, [citizen]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.position.x = currentPos.x - 8 + 0.5;
      groupRef.current.position.z = currentPos.y - 8 + 0.5;
      const speedMultiplier = fearLevel >= 80 ? 14 : 7;
      groupRef.current.position.y = Math.sin(clock.getElapsedTime() * speedMultiplier) * 0.04;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[currentPos.x - 8 + 0.5, 0, currentPos.y - 8 + 0.5]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Ground Aura Ring */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.22, 0.32, 20]} />
        <meshBasicMaterial
          color={fearLevel >= 80 ? '#ef4444' : auraColor}
          transparent
          opacity={isSelected ? 0.95 : 0.65}
        />
      </mesh>

      {/* Citizen Torso / Body */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.42, 6, 12]} />
        <meshStandardMaterial
          color={color}
          roughness={0.25}
          metalness={0.1}
          emissive={isSelected ? color : '#000000'}
          emissiveIntensity={isSelected ? 0.8 : 0}
        />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.86, 0]} castShadow>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial color="#fcd34d" roughness={0.5} />
      </mesh>

      {/* Wheelchair Mesh representation */}
      {citizen.mobility === 'WHEELCHAIR' && (
        <group position={[0, 0.3, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.26, 0.26, 0.38, 16]} />
            <meshStandardMaterial color="#94a3b8" wireframe />
          </mesh>
        </group>
      )}

      {/* Selection Outer Spotlight */}
      {isSelected && (
        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.38, 0.52, 24]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      )}

      {/* Floating 3D Comic Speech Bubble Over Head */}
      <FloatingSpeechBubble
        text={speechText}
        emoji={speechEmoji}
        variant={speechVariant}
      />
    </group>
  );
}

// Ground Grid with interactive tile placement cursor
function GroundGrid({
  grid,
  viewMode,
  currentHour,
  onTileClick,
  selectedTool,
}: {
  grid: DistrictGrid;
  viewMode: 'REALISTIC' | 'FEAR_HEATMAP' | 'FOOT_TRAFFIC';
  currentHour: number;
  onTileClick?: (pos: Position) => void;
  selectedTool: ArchitectTool;
}) {
  const isNight = currentHour >= 18 || currentHour < 6;
  const [hoveredPos, setHoveredPos] = useState<Position | null>(null);

  return (
    <group>
      {grid.tiles.map((row, y) =>
        row.map((tile, x) => {
          let tileColor = '#3b4861';
          let opacity = 1.0;
          const isRoad = tile.type === 'ROAD';

          if (viewMode === 'REALISTIC') {
            if (isRoad) {
              tileColor = isNight ? '#18202e' : '#334155';
            } else if (tile.type === 'SIDEWALK') {
              tileColor = isNight ? '#2c384e' : '#cbd5e1';
            } else if (tile.type === 'DARK_ALLEY') {
              tileColor = isNight ? '#141a29' : '#64748b';
            } else if (tile.type === 'PARK') {
              tileColor = '#15803d';
            } else if (tile.type === 'TRANSIT_HUB') {
              tileColor = '#0369a1';
            }
          } else if (viewMode === 'FEAR_HEATMAP') {
            const fear = tile.fearFactor;
            if (fear >= 0.7) tileColor = '#ef4444';
            else if (fear >= 0.35) tileColor = '#f59e0b';
            else tileColor = '#10b981';
            opacity = 0.9;
          }

          if (tile.type === 'PARK' && viewMode === 'REALISTIC') return null;

          const isHovered = hoveredPos?.x === x && hoveredPos?.y === y;
          const isArchitectActive = selectedTool !== 'INSPECT';

          return (
            <group key={`${x}-${y}`} position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
              <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
                onPointerOver={(e) => {
                  e.stopPropagation();
                  if (isArchitectActive) setHoveredPos({ x, y });
                }}
                onPointerOut={() => {
                  if (isHovered) setHoveredPos(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTileClick) onTileClick({ x, y });
                }}
              >
                <planeGeometry args={[0.96, 0.96]} />
                <meshStandardMaterial
                  color={tileColor}
                  transparent={opacity < 1}
                  opacity={opacity}
                  roughness={0.7}
                  metalness={isRoad ? 0.2 : 0.05}
                />
              </mesh>

              {/* White Dashed Road Divider Line */}
              {isRoad && viewMode === 'REALISTIC' && (
                <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[0.1, 0.4]} />
                  <meshBasicMaterial color="#fef08a" transparent opacity={0.65} />
                </mesh>
              )}

              {/* Blueprint Placement Cursor on Hover */}
              {isHovered && isArchitectActive && (
                <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[0.94, 0.94]} />
                  <meshBasicMaterial
                    color={
                      selectedTool === 'DEMOLISH'
                        ? '#ef4444'
                        : selectedTool === 'PERP'
                        ? '#c084fc'
                        : '#38bdf8'
                    }
                    transparent
                    opacity={0.5}
                    wireframe
                  />
                </mesh>
              )}
            </group>
          );
        })
      )}
    </group>
  );
}

export function NeighborhoodCanvas({
  grid,
  citizens,
  simResults,
  perps,
  currentHour,
  viewMode,
  selectedCitizenId,
  onSelectCitizen,
  onTileClick,
  selectedTool,
  onSelectPerp,
}: Props) {
  const isNight = currentHour >= 18 || currentHour < 6;

  // Filter amenities
  const streetlights = useMemo(
    () => grid.amenities.filter((a) => a.type === 'STREETLIGHT'),
    [grid.amenities]
  );
  const policeKiosks = useMemo(
    () => grid.amenities.filter((a) => a.type === 'POLICE_KIOSK'),
    [grid.amenities]
  );
  const restrooms = useMemo(
    () => grid.amenities.filter((a) => a.type === 'PUBLIC_TOILET'),
    [grid.amenities]
  );
  const busStops = useMemo(
    () => grid.amenities.filter((a) => a.type === 'BUS_STOP'),
    [grid.amenities]
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        shadows
        camera={{ position: [14, 17, 14], fov: 42 }}
        style={{
          background: isNight
            ? 'radial-gradient(circle at 50% 20%, #162038 0%, #0a0f1d 80%)'
            : 'radial-gradient(circle at 50% 20%, #e0f2fe 0%, #bae6fd 80%)',
        }}
      >
        <OrbitControls
          enableDamping
          dampingFactor={0.06}
          maxPolarAngle={Math.PI / 2.15}
          minDistance={6}
          maxDistance={36}
        />

        <ambientLight intensity={isNight ? 0.75 : 0.95} color={isNight ? '#38bdf8' : '#ffffff'} />
        <hemisphereLight
          args={[isNight ? '#60a5fa' : '#ffffff', isNight ? '#1e293b' : '#94a3b8', isNight ? 0.7 : 0.9]}
        />

        <directionalLight
          position={[12, 22, 10]}
          intensity={isNight ? 0.9 : 1.4}
          color={isNight ? '#93c5fd' : '#fef08a'}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {/* Base Ground Grid with interactive tool click handling */}
        <GroundGrid
          grid={grid}
          viewMode={viewMode}
          currentHour={currentHour}
          onTileClick={onTileClick}
          selectedTool={selectedTool}
        />

        {/* Buildings & Urban Features */}
        {grid.tiles.map((row) =>
          row.map((tile) => {
            if (tile.height && tile.height > 0) {
              return (
                <BuildingMesh
                  key={`bldg-${tile.x}-${tile.y}`}
                  x={tile.x}
                  y={tile.y}
                  type={tile.type}
                  height={tile.height}
                  isNight={isNight}
                />
              );
            }
            if (tile.type === 'PARK') {
              return <ParkTile key={`park-${tile.x}-${tile.y}`} x={tile.x} y={tile.y} />;
            }
            return null;
          })
        )}

        {/* Streetlights with Volumetric Light Cones */}
        {streetlights.map((amenity) => (
          <StreetlightFixture key={amenity.id} amenity={amenity} isNight={isNight} />
        ))}

        {/* Police SOS Booths with Blue Flashing Beacon */}
        {policeKiosks.map((amenity) => (
          <PoliceBoothFixture key={amenity.id} amenity={amenity} isNight={isNight} />
        ))}

        {/* Public Restrooms */}
        {restrooms.map((amenity) => (
          <RestroomPod key={amenity.id} amenity={amenity} />
        ))}

        {/* Bus Stop Shelters */}
        {busStops.map((amenity) => (
          <BusStopFixture key={amenity.id} amenity={amenity} />
        ))}

        {/* 🦹 Suspicious Perps & Lurkers */}
        {perps.map((perp) => {
          // Check if perp is deterred by any light or police booth
          const isDeterred = grid.amenities.some((a) => {
            const isLightOrPolice = a.type === 'STREETLIGHT' || a.type === 'POLICE_KIOSK';
            if (!isLightOrPolice) return false;
            const dist = Math.hypot(a.position.x - perp.position.x, a.position.y - perp.position.y);
            return dist <= (a.type === 'POLICE_KIOSK' ? 4.2 : a.radius * 1.2);
          });

          return (
            <PerpAgentMesh
              key={perp.id}
              perp={perp}
              isNight={isNight}
              isDeterred={isDeterred}
              onClick={() => onSelectPerp && onSelectPerp(perp.id)}
            />
          );
        })}

        {/* Animated Citizens with Floating Speech Bubbles */}
        {citizens.map((citizen) => {
          const res = simResults.find((r) => r.personaId === citizen.id);
          if (!res) return null;
          return (
            <AnimatedCitizen
              key={citizen.id}
              citizen={citizen}
              result={res}
              currentHour={currentHour}
              isSelected={citizen.id === selectedCitizenId}
              onClick={() => onSelectCitizen(citizen.id)}
              perps={perps}
              grid={grid}
            />
          );
        })}
      </Canvas>
    </div>
  );
}
