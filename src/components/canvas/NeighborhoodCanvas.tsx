import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { DistrictGrid, Amenity, Position } from '../../types/urban';
import type { CitizenPersona, CitizenSimResult } from '../../types/citizen';

interface Props {
  grid: DistrictGrid;
  citizens: CitizenPersona[];
  simResults: CitizenSimResult[];
  currentHour: number;
  viewMode: 'REALISTIC' | 'FEAR_HEATMAP' | 'FOOT_TRAFFIC';
  selectedCitizenId: string | null;
  onSelectCitizen: (id: string) => void;
  onTileClick?: (pos: Position) => void;
  selectedTool: string | null;
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
      {/* Base Foundation / Curb */}
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[0.96, 0.16, 0.96]} />
        <meshStandardMaterial color={trimColor} roughness={0.7} />
      </mesh>

      {/* Main Building Body */}
      <mesh position={[0, height / 2 + 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.88, height, 0.88]} />
        <meshStandardMaterial color={wallColor} roughness={0.4} metalness={0.15} />
      </mesh>

      {/* Decorative Roof Cap */}
      <mesh position={[0, height + 0.12, 0]} castShadow>
        <boxGeometry args={[0.92, 0.08, 0.92]} />
        <meshStandardMaterial color={roofColor} roughness={0.5} />
      </mesh>

      {/* Roof AC / Utility Unit for Realism */}
      {height >= 1.8 && (
        <mesh position={[0.2, height + 0.2, 0.1]} castShadow>
          <boxGeometry args={[0.25, 0.16, 0.25]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>
      )}

      {/* Glowing Facade Windows */}
      {height >= 1.2 && (
        <>
          {/* Front Windows */}
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

      {/* Commercial Storefront Awning & Neon Sign */}
      {type === 'COMMERCIAL' && (
        <>
          <mesh position={[0, 0.7, 0.48]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[0.82, 0.05, 0.25]} />
            <meshStandardMaterial color="#ec4899" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.95, 0.46]}>
            <planeGeometry args={[0.7, 0.15]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
        </>
      )}

      {/* Transit Hub Entrance Canopy */}
      {type === 'TRANSIT_HUB' && (
        <mesh position={[0, 0.65, 0.52]}>
          <boxGeometry args={[0.85, 0.06, 0.32]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.2} metalness={0.4} />
        </mesh>
      )}
    </group>
  );
}

// Park with rich lush trees and bench
function ParkTile({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
      {/* Lush Grass Lawn */}
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[0.96, 0.08, 0.96]} />
        <meshStandardMaterial color="#15803d" roughness={0.8} />
      </mesh>
      {/* Stone walking path strip */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.25, 0.07, 0.96]} />
        <meshStandardMaterial color="#78716c" roughness={0.9} />
      </mesh>

      {/* Stylized Pine / Foliage Tree */}
      <group position={[0.22, 0, 0.2]}>
        {/* Trunk */}
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.6, 8]} />
          <meshStandardMaterial color="#78350f" roughness={0.8} />
        </mesh>
        {/* Tier 1 Leaves */}
        <mesh position={[0, 0.65, 0]} castShadow>
          <coneGeometry args={[0.36, 0.55, 8]} />
          <meshStandardMaterial color="#22c55e" roughness={0.6} />
        </mesh>
        {/* Tier 2 Leaves */}
        <mesh position={[0, 0.95, 0]} castShadow>
          <coneGeometry args={[0.26, 0.45, 8]} />
          <meshStandardMaterial color="#4ade80" roughness={0.6} />
        </mesh>
      </group>

      {/* Park Bench */}
      <mesh position={[-0.25, 0.15, -0.1]} castShadow>
        <boxGeometry args={[0.25, 0.15, 0.12]} />
        <meshStandardMaterial color="#b45309" roughness={0.7} />
      </mesh>
    </group>
  );
}

// Streetlight fixture with bright golden glow and light pool
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
      {/* Lamp Post Base */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.2, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} />
      </mesh>
      {/* Metal Pole */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 1.3, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Curved Arm & Lantern Hood */}
      <mesh position={[0, 1.4, 0]}>
        <coneGeometry args={[0.16, 0.12, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>
      {/* Glowing Bulb */}
      <mesh position={[0, 1.32, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial
          color={isNight ? '#fef08a' : '#cbd5e1'}
          emissive={isNight ? '#fde047' : '#000000'}
          emissiveIntensity={isNight ? 3.0 : 0}
        />
      </mesh>

      {/* Active Light Sources & Ground Pool */}
      {isNight && (
        <>
          <pointLight
            position={[0, 1.35, 0]}
            color="#fef08a"
            intensity={amenity.type === 'POLICE_KIOSK' ? 4.5 : 3.5}
            distance={5.5}
            decay={1.5}
          />
          {/* Primary Golden Light Pool */}
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[amenity.radius * 1.1, 32]} />
            <meshBasicMaterial
              color="#fbbf24"
              transparent
              opacity={0.32}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* Soft Outer Halo */}
          <mesh position={[0, 0.048, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[amenity.radius * 1.8, 32]} />
            <meshBasicMaterial
              color="#f59e0b"
              transparent
              opacity={0.14}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

// Public Restroom Pod
function RestroomPod({ amenity }: { amenity: Amenity }) {
  const { x, y } = amenity.position;
  return (
    <group position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
      {/* Base platform */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.85, 0.1, 0.85]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* Modern metallic restroom kiosk */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.75, 1.1, 0.75]} />
        <meshStandardMaterial color="#0284c7" roughness={0.25} metalness={0.4} />
      </mesh>
      {/* Glowing universal icon badge */}
      <mesh position={[0, 1.22, 0]}>
        <boxGeometry args={[0.55, 0.16, 0.12]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      {/* Indicator light */}
      <mesh position={[0, 0.95, 0.39]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#10b981" />
      </mesh>
    </group>
  );
}

// Moving Citizen in 3D with bobbing animation and colored aura
function AnimatedCitizen({
  citizen,
  result,
  currentHour,
  isSelected,
  onClick,
}: {
  citizen: CitizenPersona;
  result: CitizenSimResult;
  currentHour: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Compute position along path based on sim time
  const currentPos = useMemo(() => {
    if (!result || !result.path.length) return citizen.origin;

    const startH = result.departureTime;
    const endH = result.arrivalTime;

    if (currentHour < startH) {
      return result.path[0];
    }
    if (currentHour >= endH) {
      return result.path[result.path.length - 1];
    }

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

  // Color by role
  const { color, auraColor } = useMemo(() => {
    if (citizen.role.includes('Nurse')) {
      return { color: '#ec4899', auraColor: '#f472b6' };
    }
    if (citizen.mobility === 'WHEELCHAIR' || citizen.mobility === 'CANE_SENIOR') {
      return { color: '#f59e0b', auraColor: '#fbbf24' };
    }
    if (citizen.role.includes('Student') || citizen.role.includes('Barista')) {
      return { color: '#38bdf8', auraColor: '#7dd3fc' };
    }
    if (citizen.role.includes('Courier')) {
      return { color: '#10b981', auraColor: '#34d399' };
    }
    return { color: '#818cf8', auraColor: '#a5b4fc' };
  }, [citizen]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.position.x = currentPos.x - 8 + 0.5;
      groupRef.current.position.z = currentPos.y - 8 + 0.5;
      // Gentle walking bob
      groupRef.current.position.y = Math.sin(clock.getElapsedTime() * 8) * 0.04;
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
        <meshBasicMaterial color={auraColor} transparent opacity={isSelected ? 0.9 : 0.6} />
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

      {/* Head with skin tone */}
      <mesh position={[0, 0.86, 0]} castShadow>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial color="#fcd34d" roughness={0.5} />
      </mesh>

      {/* Floating Role Indicator Pin */}
      <mesh position={[0, 1.15, 0]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={color} />
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
    </group>
  );
}

// Ground Grid with roads, sidewalks, crosswalk stripes, and heatmap
function GroundGrid({
  grid,
  viewMode,
  currentHour,
  onTileClick,
}: {
  grid: DistrictGrid;
  viewMode: 'REALISTIC' | 'FEAR_HEATMAP' | 'FOOT_TRAFFIC';
  currentHour: number;
  onTileClick?: (pos: Position) => void;
}) {
  const isNight = currentHour >= 18 || currentHour < 6;

  return (
    <group>
      {grid.tiles.map((row, y) =>
        row.map((tile, x) => {
          let tileColor = '#3b4861'; // clean modern sidewalk
          let opacity = 1.0;
          const isRoad = tile.type === 'ROAD';

          if (viewMode === 'REALISTIC') {
            if (isRoad) {
              tileColor = isNight ? '#18202e' : '#334155'; // dark asphalt
            } else if (tile.type === 'SIDEWALK') {
              tileColor = isNight ? '#2c384e' : '#cbd5e1'; // stone paver
            } else if (tile.type === 'DARK_ALLEY') {
              tileColor = isNight ? '#141a29' : '#64748b'; // shadowy corridor
            } else if (tile.type === 'PARK') {
              tileColor = '#15803d'; // handled by park mesh
            } else if (tile.type === 'TRANSIT_HUB') {
              tileColor = '#0369a1';
            }
          } else if (viewMode === 'FEAR_HEATMAP') {
            const fear = tile.fearFactor;
            if (fear >= 0.7) tileColor = '#ef4444'; // Red = Terrifying corridor
            else if (fear >= 0.35) tileColor = '#f59e0b'; // Amber = Cautious
            else tileColor = '#10b981'; // Green = High Safety
            opacity = 0.9;
          }

          // Don't render flat plane for park as it has custom lush mesh
          if (tile.type === 'PARK' && viewMode === 'REALISTIC') return null;

          return (
            <group key={`${x}-${y}`} position={[x - 8 + 0.5, 0, y - 8 + 0.5]}>
              {/* Tile Plane */}
              <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
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

              {/* Dark Alley Danger Crosshatch Warning in Realistic View */}
              {tile.type === 'DARK_ALLEY' && isNight && viewMode === 'REALISTIC' && (
                <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.15, 0.28, 4]} />
                  <meshBasicMaterial color="#7f1d1d" transparent opacity={0.35} />
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
  currentHour,
  viewMode,
  selectedCitizenId,
  onSelectCitizen,
  onTileClick,
}: Props) {
  const isNight = currentHour >= 18 || currentHour < 6;

  // Filter amenities
  const streetlights = useMemo(
    () => grid.amenities.filter((a) => a.type === 'STREETLIGHT' || a.type === 'POLICE_KIOSK'),
    [grid.amenities]
  );
  const restrooms = useMemo(
    () => grid.amenities.filter((a) => a.type === 'PUBLIC_TOILET'),
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

        {/* Crisp Ambient & Hemisphere Fill Light */}
        <ambientLight intensity={isNight ? 0.75 : 0.95} color={isNight ? '#38bdf8' : '#ffffff'} />
        <hemisphereLight
          args={[isNight ? '#60a5fa' : '#ffffff', isNight ? '#1e293b' : '#94a3b8', isNight ? 0.7 : 0.9]}
        />

        {/* Directional Moonlight / Sunlight casting crisp shadows */}
        <directionalLight
          position={[12, 22, 10]}
          intensity={isNight ? 0.9 : 1.4}
          color={isNight ? '#93c5fd' : '#fef08a'}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {/* Base Ground Grid */}
        <GroundGrid
          grid={grid}
          viewMode={viewMode}
          currentHour={currentHour}
          onTileClick={onTileClick}
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

        {/* Streetlight & Fixture Meshes with Rich Light Cones */}
        {streetlights.map((amenity) => (
          <StreetlightFixture key={amenity.id} amenity={amenity} isNight={isNight} />
        ))}

        {/* Public Restrooms */}
        {restrooms.map((amenity) => (
          <RestroomPod key={amenity.id} amenity={amenity} />
        ))}

        {/* Animated Citizens */}
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
            />
          );
        })}
      </Canvas>
    </div>
  );
}
