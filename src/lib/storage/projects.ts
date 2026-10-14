/**
 * Project repository: autosave + restore on top of IndexedDB.
 * Frames are never persisted — stored runs are deterministically replayable.
 */

import type { PraesidiumProject } from "../world/types";
import { deleteProject, getProject, listProjects, putProject, storageAvailable } from "./db";
import { exportProjectJson } from "../world/serialize";

export async function saveProject(project: PraesidiumProject): Promise<void> {
  if (!storageAvailable) return;
  await putProject({
    projectId: project.projectId,
    name: project.name,
    modifiedAt: project.modifiedAt,
    projectJson: exportProjectJson(project),
  });
}

export async function loadProject(id: string): Promise<PraesidiumProject | null> {
  if (!storageAvailable) return null;
  const rec = await getProject(id);
  if (!rec) return null;
  try {
    const parsed = JSON.parse(typeof rec.projectJson === "string" ? rec.projectJson : JSON.stringify(rec.projectJson));
    return parsed as PraesidiumProject;
  } catch {
    return null;
  }
}

export async function listSavedProjects() {
  if (!storageAvailable) return [];
  try {
    return await listProjects();
  } catch {
    return [];
  }
}

export async function removeProject(id: string) {
  if (!storageAvailable) return;
  await deleteProject(id);
}

/** Download a JSON file in the browser. */
export function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
