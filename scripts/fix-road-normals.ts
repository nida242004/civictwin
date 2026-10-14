import fs from "fs";

let code = fs.readFileSync("src/components/three/layers.tsx", "utf8");

// 1. Replace roadPositions
const oldRoad = `    // 2 triangles for road surface
    roadPositions.push(
      left1.x, 0, left1.y,  right1.x, 0, right1.y,  left2.x, 0, left2.y,
      right1.x, 0, right1.y,  right2.x, 0, right2.y,  left2.x, 0, left2.y
    );`;

const newRoad = `    // Counter-clockwise triangles (normal = 0 1 0)
    roadPositions.push(
      left1.x, 0, left1.y,  left2.x, 0, left2.y,  right1.x, 0, right1.y,
      right1.x, 0, right1.y,  left2.x, 0, left2.y,  right2.x, 0, right2.y
    );`;

// 2. Replace curbPositions
const oldCurbs = `    // Left curb
    const curbLeftOuter1 = p1.clone().addScaledVector(normal, halfRoad + curbWidth);
    const curbLeftOuter2 = p2.clone().addScaledVector(normal, halfRoad + curbWidth);
    curbPositions.push(
      curbLeftOuter1.x, 0, curbLeftOuter1.y, left1.x, 0, left1.y, curbLeftOuter2.x, 0, curbLeftOuter2.y,
      left1.x, 0, left1.y, left2.x, 0, left2.y, curbLeftOuter2.x, 0, curbLeftOuter2.y
    );

    // Right curb
    const curbRightOuter1 = p1.clone().addScaledVector(normal, -(halfRoad + curbWidth));
    const curbRightOuter2 = p2.clone().addScaledVector(normal, -(halfRoad + curbWidth));
    curbPositions.push(
      right1.x, 0, right1.y, curbRightOuter1.x, 0, curbRightOuter1.y, right2.x, 0, right2.y,
      curbRightOuter1.x, 0, curbRightOuter1.y, curbRightOuter2.x, 0, curbRightOuter2.y, right2.x, 0, right2.y
    );`;

const newCurbs = `    // Left curb (normal = 0 1 0)
    const curbLeftOuter1 = p1.clone().addScaledVector(normal, halfRoad + curbWidth);
    const curbLeftOuter2 = p2.clone().addScaledVector(normal, halfRoad + curbWidth);
    curbPositions.push(
      curbLeftOuter1.x, 0, curbLeftOuter1.y, curbLeftOuter2.x, 0, curbLeftOuter2.y, left1.x, 0, left1.y,
      left1.x, 0, left1.y, curbLeftOuter2.x, 0, curbLeftOuter2.y, left2.x, 0, left2.y
    );

    // Right curb (normal = 0 1 0)
    const curbRightOuter1 = p1.clone().addScaledVector(normal, -(halfRoad + curbWidth));
    const curbRightOuter2 = p2.clone().addScaledVector(normal, -(halfRoad + curbWidth));
    curbPositions.push(
      right1.x, 0, right1.y, right2.x, 0, right2.y, curbRightOuter1.x, 0, curbRightOuter1.y,
      curbRightOuter1.x, 0, curbRightOuter1.y, right2.x, 0, right2.y, curbRightOuter2.x, 0, curbRightOuter2.y
    );`;

// 3. Centerline
const oldLines = `        linePositions.push(
          cl1.x, 0, cl1.y, cr1.x, 0, cr1.y, cl2.x, 0, cl2.y,
          cr1.x, 0, cr1.y, cr2.x, 0, cr2.y, cl2.x, 0, cl2.y
        );`;

const newLines = `        linePositions.push(
          cl1.x, 0, cl1.y, cl2.x, 0, cl2.y, cr1.x, 0, cr1.y,
          cr1.x, 0, cr1.y, cl2.x, 0, cl2.y, cr2.x, 0, cr2.y
        );`;

// 4. Joints
const oldJoints = `      roadPositions.push(
        cp.x, 0, cp.z,
        cp.x + Math.cos(th1) * halfRoad, 0, cp.z + Math.sin(th1) * halfRoad,
        cp.x + Math.cos(th2) * halfRoad, 0, cp.z + Math.sin(th2) * halfRoad
      );
      // Curb outer ring
      curbPositions.push(
        cp.x + Math.cos(th1) * halfRoad, 0, cp.z + Math.sin(th1) * halfRoad,
        cp.x + Math.cos(th1) * (halfRoad + curbWidth), 0, cp.z + Math.sin(th1) * (halfRoad + curbWidth),
        cp.x + Math.cos(th2) * (halfRoad + curbWidth), 0, cp.z + Math.sin(th2) * (halfRoad + curbWidth),

        cp.x + Math.cos(th1) * halfRoad, 0, cp.z + Math.sin(th1) * halfRoad,
        cp.x + Math.cos(th2) * (halfRoad + curbWidth), 0, cp.z + Math.sin(th2) * (halfRoad + curbWidth),
        cp.x + Math.cos(th2) * halfRoad, 0, cp.z + Math.sin(th2) * halfRoad
      );`;

const newJoints = `      roadPositions.push(
        cp.x, 0, cp.z,
        cp.x + Math.cos(th2) * halfRoad, 0, cp.z + Math.sin(th2) * halfRoad,
        cp.x + Math.cos(th1) * halfRoad, 0, cp.z + Math.sin(th1) * halfRoad
      );
      // Curb outer ring (normal = 0 1 0)
      curbPositions.push(
        cp.x + Math.cos(th2) * halfRoad, 0, cp.z + Math.sin(th2) * halfRoad,
        cp.x + Math.cos(th2) * (halfRoad + curbWidth), 0, cp.z + Math.sin(th2) * (halfRoad + curbWidth),
        cp.x + Math.cos(th1) * halfRoad, 0, cp.z + Math.sin(th1) * halfRoad,

        cp.x + Math.cos(th1) * halfRoad, 0, cp.z + Math.sin(th1) * halfRoad,
        cp.x + Math.cos(th2) * (halfRoad + curbWidth), 0, cp.z + Math.sin(th2) * (halfRoad + curbWidth),
        cp.x + Math.cos(th1) * (halfRoad + curbWidth), 0, cp.z + Math.sin(th1) * (halfRoad + curbWidth)
      );`;

code = code.replace(oldRoad.replace(/\r\n/g, "\n"), newRoad)
           .replace(oldRoad.replace(/\n/g, "\r\n"), newRoad)
           .replace(oldCurbs.replace(/\r\n/g, "\n"), newCurbs)
           .replace(oldCurbs.replace(/\n/g, "\r\n"), newCurbs)
           .replace(oldLines.replace(/\r\n/g, "\n"), newLines)
           .replace(oldLines.replace(/\n/g, "\r\n"), newLines)
           .replace(oldJoints.replace(/\r\n/g, "\n"), newJoints)
           .replace(oldJoints.replace(/\n/g, "\r\n"), newJoints);

// Add side={THREE.DoubleSide} to materials in RoadsLayer
code = code.replace(
  `                roughness={0.7}
                vertexColors={false}
              />`,
  `                roughness={0.7}
                side={THREE.DoubleSide}
                vertexColors={false}
              />`
);

code = code.replace(
  `                <meshBasicMaterial
                  color={lineColor}
                  transparent
                  opacity={isSelected ? 1.0 : theme === "night" ? 0.85 : 0.75}
                  depthWrite={false}
                />`,
  `                <meshBasicMaterial
                  color={lineColor}
                  transparent
                  opacity={isSelected ? 1.0 : theme === "night" ? 0.85 : 0.75}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />`
);

fs.writeFileSync("src/components/three/layers.tsx", code, "utf8");
console.log("Successfully updated layers.tsx with fixed normals and double-sided materials!");
