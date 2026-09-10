# Whole-sheet generation and image templates

Use when the user wants pre-separated artwork or a repeatable ImageGen parts template. This is an optional asset-production route; it does not replace rigging or runtime verification.

## Choose the route

- Existing identity: pass the master as identity reference and an approved parts-sheet PNG as layout reference, with those roles explicit. Generate all planned cutout parts together to establish consistent style, then repair individual failures.
- New identity: a sheet can be the initial concept, but reconstruct a character preview and establish an accepted identity/proportion reference before binding. A sheet alone does not prove assembled proportions.
- Complex creature: derive parts from anatomy and requested motion. Do not force quadrupeds, snakes, wings or tails into the humanoid fourteen-part table.
- Continue separate-part generation when sheet density loses detail or one part repeatedly fails. Keep every required part/action; do not reduce scope silently.

## What an ImageGen template does

The local `template-creator` image route retains a reference PNG and tells imagegen to use it with the new brief. It can help carry visual language and layout. It is not a PSD layer exporter, Spine skeleton generator, trained rig, deterministic placement constraint or alpha guarantee. The imagegen skill also includes textual game-asset prompt recipes; those are a different kind of template.

For production, pair any visual reference with a part manifest: IDs, anatomical side, visible surface, view/facing, required joint overlaps, approximate scale, semantic rows/cells, measured sourceRect, landmarks and layerRules. Cells are layout intent until the output is measured. Template art may carry mistakes into every later generation; only register an approved reference through the real template-creator workflow. Do not call an ordinary prompt file an installed gallery template.

## Reusable prompt scaffold

```text
Use case: identity-preserve (existing identity) / stylized-concept (new identity)
Asset type: Spine cutout PARTS sheet, not animation frames
Input 1: character identity reference
Input 2: approved parts layout reference, if available
Character and view: <identity>, <half-side or requested view>, <screen facing>
Parts: <explicit semantic inventory with left/right and inner/outer or palm/back>
Layout: <rows/columns>; one isolated part per intended cell; clear gutters
Scale: all parts use the same anatomical scale; small hands remain small
Joint preparation: complete hidden contours with opaque matching-material overlap; continuous skin/fabric/leather across each end; no internal pivot rings, tan disks, cross-section ellipses or guide marks
Background: genuine transparent alpha, no painted checkerboard
Constraints: preserve identity/style; no assembled body, labels, bones, grid, extra parts or cropped silhouettes
```

Choose the inventory using [first-pass.md](first-pass.md) before drawing a layout. For the flexible clothed adventurer, prefer head/torso, paired upper arms/forearms/hands, paired continuous hip-to-ankle legs and independent feet: twelve parts with weighted knees. Separate thigh/shin artwork remains useful for intentionally rigid armor or garment seams, but the old fourteen-part cloth sheet produced duplicate knee caps and is not the default template. Neither count is universal. Define surfaces independently of sheet column or screen-facing direction.

## Prevent painted pivot disks

Do not rely on "rounded joint overlap" alone: the adventurer sheet interpreted it as tan circles outlined in black, including on clothed knees and boots. A pivot is a coordinate in registration data, not an illustration detail. Specify the material at each hidden end: tunic fabric at shoulder caps, continuous skin at bare elbows, trousers at covered knees, leather at boot/ankle overlaps. Keep light direction and local shading continuous. Preserve intentional armor rivets or mechanical joints when they belong to the character design; do not ban every circular detail.

When repairing an existing sheet, request a targeted edit that repaints the disk AND its internal ring with surrounding material while preserving the opaque footprint, silhouette, layout and identity. Do not punch transparent holes or globally key out skin colors. Outer silhouette lines can remain; internal cut-edge lines that cross a visible join must be hidden by authored overlap or repainted. If the edit changes layout, remeasure crops and landmarks before binding.

Separate three checks: disk-free source art; assembled joint continuity; moving joint continuity. A clean sheet cannot prove seamless articulation. Use garment seams (sleeve, bracer, boot cuff) for rigid cuts; use connected-bone mesh weights where continuous skin/fabric bends, and inspect extreme poses. More bones or meshes alone do not fix texture marks.

For this user's approved solid-color route, preserve the flat magenta background through edits and perform the established local chroma-key step; recheck real alpha, edge spill and material preservation. Do not change another user's transparent workflow automatically. The September 9 experiment and reusable repair prompt are recorded in `docs/joint-marker-cleanup.md`; its four-action comparison changes artwork only and does not claim official-quality animation.

## Gate before ingest and binding

1. Measure actual alpha. A checkerboard-looking PNG with zero transparent pixels fails. Use imagegen for targeted regeneration; do not mark it ready by renaming its extension or declaring alpha in JSON.
2. Inspect count, semantic identity, handedness, hidden overlap and edges. Empty cells and a neat sheet do not prove correct anatomy.
3. Measure actual part bounds; do not blindly crop equal cells. A torso can cross a requested cell boundary. Reject overlapping parts that cannot be separated without regenerating hidden content.
4. Register each extracted part to the assembled master. Preserve crop offsets; inspect actual post-ingest reconstruction. Check relative hand/head/limb sizes instead of allowing contain-resize to conceal proportional drift.
5. Build bones, meshes, weights, constraints and animation tracks locally; a raster sheet supplies none of these by itself. Validate the exported runtime as usual.
6. Keep the established playable character until the new sheet passes the complete gate. Document failed samples separately from production assets.

The September 2026 adventurer experiment (`docs/imagegen-parts-sheet-study.md`) produced fourteen visibly separated parts twice, including distinct inner/outer surfaces, but both PNGs had zero transparent pixels and failed ingest. Reference reuse preserved much of the layout without solving transparency. This small experiment supports a draft-sheet route, not automatic Spine-ready acceptance or a general claim that transparent output is impossible.
