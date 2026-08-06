import type { BuildPlan } from "./plan";
import type { IconGroupManifest } from "../contracts/manifest";

/** A minimal staging writer abstraction, injectable for browser or Node. */
export interface BuildWriter {
  /** Write a UTF-8 file into staging at the given relative path. */
  writeFile(relativePath: string, content: string | Uint8Array): Promise<void>;
  /** Finalize staging atomically; called only after every write succeeded. */
  commit(): Promise<void>;
  /** Remove staging and any partial output; called on failure. */
  rollback(): Promise<void>;
}

export interface BuildResult {
  readonly plan: BuildPlan;
  /** All output files as a map of relative path -> content. */
  readonly files: Readonly<Record<string, string>>;
  readonly manifest: IconGroupManifest;
}

export interface MaterializeOptions {
  /** Tool string written into createdWith, e.g. `moe-icons-package-maker@0.1.0`. */
  readonly createdWith: string;
  readonly author: { name: string; email?: string; source?: string; license?: string };
}

/**
 * Materialize a build plan into a writer: include manifest, validation report,
 * and checksums; commit atomically only after all entries succeed; call
 * rollback on any failure.
 */
export async function materializeBuild(
  plan: BuildPlan,
  writer: BuildWriter,
  options: MaterializeOptions,
): Promise<BuildResult> {
  const files: Record<string, string> = {};

  try {
    for (const entry of plan.entries) {
      await writer.writeFile(entry.outputPath, entry.svgContent);
      files[entry.outputPath] = entry.svgContent;
    }

    const manifest: IconGroupManifest = {
      schemaVersion: 1,
      groupId: plan.groupId,
      displayName: plan.displayName,
      styleId: plan.styleId,
      author: options.author,
      createdWith: options.createdWith,
      createdAt: plan.createdAt,
      entries: plan.entries.map((e) => ({
        iconId: e.outputPath.split("/").pop()?.replace(/\.svg$/, "") ?? "",
        subgroupId: e.outputPath.split("/")[0] ?? "",
        outputPath: e.outputPath,
        checksum: e.checksum,
      })),
      validation: plan.validation,
    };

    const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
    await writer.writeFile("manifest.json", manifestJson);
    files["manifest.json"] = manifestJson;

    const reportJson = `${JSON.stringify(
      {
        groupId: plan.groupId,
        createdAt: plan.createdAt,
        validation: plan.validation,
        entries: plan.entries.map((e) => ({ outputPath: e.outputPath, checksum: e.checksum })),
      },
      null,
      2,
    )}\n`;
    await writer.writeFile("report.json", reportJson);
    files["report.json"] = reportJson;

    await writer.commit();
    return { plan, files, manifest };
  } catch (error) {
    await writer.rollback();
    throw error;
  }
}
