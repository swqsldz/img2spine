import sharp from "sharp";
import { alphaBounds } from "./assets.ts";
import type { Asset } from "./schema.ts";

/** Mechanical, authored horizontal crops. No segmentation or hidden-pixel reconstruction. */
export async function partitionAsset(
  asset: Asset,
  file: string,
  pieces: { id: string; from: number; to: number; pair: string }[],
): Promise<Asset[]> {
  if (asset.placement.rotation || asset.placement.mirror)
    throw new Error(
      "Partition before rotation/mirroring, then register each part.",
    );
  const input = asset.sourceRect
    ? await sharp(file).extract(asset.sourceRect).png().toBuffer()
    : file;
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const box = alphaBounds(
    data,
    info.width,
    info.height,
    asset.trimAlphaThreshold,
  );
  const scale = Math.min(
    asset.placement.width / box.width,
    asset.placement.height / box.height,
  );
  const padX = (asset.placement.width - box.width * scale) / 2,
    padY = (asset.placement.height - box.height * scale) / 2;
  return pieces.map((p) => {
    if (p.from < 0 || p.to > 1 || p.from >= p.to)
      throw new Error("Invalid partition interval");
    const top = Math.floor(box.height * p.from),
      bottom = Math.ceil(box.height * p.to);
    // Ingest trims alpha again. Give each piece tight bounds and move its placement
    // by that exact crop offset, otherwise asymmetric pieces are silently recentered.
    let left = info.width,
      right = -1,
      first = info.height,
      last = -1;
    for (let y = box.top + top; y < box.top + bottom; y++)
      for (let x = box.left; x < box.left + box.width; x++)
        if (data[(y * info.width + x) * 4 + 3] > asset.trimAlphaThreshold) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          first = Math.min(first, y);
          last = Math.max(last, y);
        }
    if (right < left)
      throw new Error(`Partition ${p.id} contains no opaque pixels`);
    const result: Asset = {
      ...asset,
      id: p.id,
      sourceRect: {
        left: (asset.sourceRect?.left ?? 0) + left,
        top: (asset.sourceRect?.top ?? 0) + first,
        width: right - left + 1,
        height: last - first + 1,
      },
      placement: {
        ...asset.placement,
        x: asset.placement.x + padX + (left - box.left) * scale,
        y: asset.placement.y + padY + (first - box.top) * scale,
        width: (right - left + 1) * scale,
        height: (last - first + 1) * scale,
      },
      anatomy: asset.anatomy ? { ...asset.anatomy, pair: p.pair } : undefined,
    };
    delete result.normalizedFile;
    delete result.trim;
    delete result.sha256;
    return result;
  });
}
