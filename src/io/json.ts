import type { ModelSnapshot } from "../types";
import type { Model } from "../model/Model";
import { triggerDownload } from "./csv";

/** Serialize the model to a round-trippable JSON project file. */
export function saveJson(model: Model, filename = "bcad-project.json"): void {
  const snapshot = model.snapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  triggerDownload(filename, blob);
}

/**
 * Parse a JSON project file. Throws on invalid structure so the caller can
 * surface a friendly message. Returns a typed snapshot to hand to Model.load.
 */
export function parseProject(text: string): ModelSnapshot {
  const data = JSON.parse(text) as Partial<ModelSnapshot>;
  if (!data || data.version !== 1) {
    throw new Error("Not a bcad project file (missing version: 1).");
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.members)) {
    throw new Error("Project file is missing nodes/members arrays.");
  }
  return data as ModelSnapshot;
}
