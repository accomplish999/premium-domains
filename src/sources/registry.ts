import { InputError } from "../errors";
import { afternic } from "./afternic";
import { atom } from "./atom";
import { dropcatch } from "./dropcatch";
import { dynadot } from "./dynadot";
import { godaddy } from "./godaddy";
import { namejet } from "./namejet";
import { parkio } from "./parkio";
import { sedo } from "./sedo";
import { snapnames } from "./snapnames";
import type { SourceAdapter } from "./types";

export const SOURCES: SourceAdapter[] = [parkio, dynadot, godaddy, sedo, atom, namejet, snapnames, dropcatch, afternic];

export function sourceById(id: string): SourceAdapter | undefined {
  return SOURCES.find((source) => source.id === id);
}

export function resolveSources(requested: string[] | null): SourceAdapter[] {
  if (!requested) return SOURCES.filter((source) => source.defaultEnabled);
  const chosen: SourceAdapter[] = [];
  for (const id of requested) {
    const source = sourceById(id);
    if (!source) {
      const known = SOURCES.map((item) => item.id).join(", ");
      throw new InputError("UNKNOWN_SOURCE", `Unknown source ${id}. Known sources: ${known}.`);
    }
    chosen.push(source);
  }
  return chosen;
}
