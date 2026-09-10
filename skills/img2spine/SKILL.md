---
name: img2spine
description: Generate and revise playable Spine 4.3 animations from imagegen artwork, including non-humanoid creatures and half-side characters for 2D side-scrolling games. Uses independent asset, anatomical rig, motion and runtime validation tools; not Spine editor control or third-party Spine MCP servers.
---

# Imagegen → Spine

Use the bundled local compiler to deliver real `.json`, `.atlas`, and PNG resources. The three Spine MCP repositories are research references only: do not import their code, install them, or call their tools.

## Locate the implementation

Read `workspace.json` beside this skill for `workspaceRoot` when installed. In the repository copy, the workspace is two directories above this skill. Run commands from that workspace. Read [contracts.md](references/contracts.md) before authoring project data; the executable schemas are `src/schema.ts` and the concrete example is `examples/robot/`.

Use `npm ci` and `npm run build` if dependencies or the compiled runtime are missing. The compiler checks official runtime commit `4309c05c287d3f15da778e68f5d2a483fe10a6a3`, package `4.3.13`, data format `4.3.75-beta`. Do not change version strings to work around reader errors.

## Author a task from the user's prompt

Create a versioned project under `output/<name>/source/`. Preserve the actual requested actions, views, timing, loop and translation intent in `job.json`. Separate anticipation, primary action, follow-through and recovery where the request benefits from them. Do not silently convert unsupported actions to idle or floating.

Plan parts from the actions before generating images. A wave needs articulated arms, a blink needs eyelid/eye attachments, and a turn needs real alternate views. For large perspective changes, create view-specific attachments and, when necessary, view-specific bone groups. A flattened front image does not supply hidden geometry.

For every new generation, read [first-pass.md](references/first-pass.md), author `asset-plan.json`, and run `prepare` before calling imagegen. Choose continuous or covered joints by material and movement, specify the seam owner and per-view draw order, and use the emitted master/parts prompts. Prefer continuous weighted trouser legs for flexible clothed knees, while retaining design-specific rigid armor cuts. Do not reuse numerical landmarks from a different image. These are autonomous production decisions, not user approval stages.

For non-humanoid characters or 2D side-scrolling games, read [anatomy-and-sidegames.md](references/anatomy-and-sidegames.md). Classify the actual anatomy and locomotion before choosing a rig: the robot example is not a universal skeleton. Set `character.morphology`, and set `presentation.usage: side-scroller` for horizontal platform/action games. Unless the user specifies otherwise, use a predominantly side-on three-quarter view (roughly 15–30 degrees toward the viewer from strict profile), facing right. This is a generation/composition requirement; do not use frontal assets with a renamed view label or simulated camera turn.

Read the available **imagegen** skill and use its built-in tool mode. Normally generate and inspect a master first, then produce the required semantic parts individually or through the checked whole-sheet route below, retaining the master as identity reference. A user-requested sheet-first concept must establish an assembled identity/proportion reference before binding. For local edits, view the target before passing its path to imagegen. Request complete joint overlaps and actual transparent alpha. Save every selected image in the project, with the prompt, reference and tool mode in the asset generation record. Do not assume an image is transparent merely because it looks like a checkerboard. `ingest` rejects opaque backgrounds; repair by targeted imagegen generation/extraction, preserving earlier candidates. Do not silently switch to an API or CLI image model.

## Assemble and animate

For pre-separated artwork or ImageGen template requests, read [parts-sheet.md](references/parts-sheet.md). A whole-sheet generation can establish a consistent set of draft parts, but alpha, semantic completeness, measured bounds and assembled proportions must pass before ingestion/binding. PNG reference templates guide appearance/layout and do not generate native layers or Spine data.

For paired humanoid limbs, read [official-example-lessons.md](references/official-example-lessons.md). Anatomical left/right, camera near/far and screen facing are separate. Plan visible inner/outer or palm/back surfaces before generation; do not resize/rename one asymmetric hand or leg for the other side. Declare AssetManifest `anatomy` and RigSpec `layerRules`. Split hands/feet when wrist/ankle orientation or occlusion needs independent control.

1. Author `assets.json` with source images and desired master-canvas placement. Landmarks refer to known image coordinates, not guesses inferred from filenames. `register` optionally fits two or more correspondences per part, writes a sibling manifest and reports residual error. Inspect the assembled shape before accepting the fit.
2. Author joint locations in `joints.json` and use `rig`, or author `rig.json` directly. Bone transforms are local to their parents. For rotated/scaled parents, use matrix inversion; subtraction alone is insufficient. IK targets must be outside the constrained chain. Slot order is draw order, independent of bone order.
3. Use region for rigid parts and mesh for bending parts. Specify only anatomically connected allowed influences. Keep enough opaque overlap at joints and inspect the range sweep. Prefer the smallest adequate mesh; do not deform boots and rigid accessories with distant bones. After ingest, run `assemble` and visually inspect its light/dark reconstruction and enlarged joins against the master before building full motion. Regenerate or re-register defects at this stage.
4. Author `motion.json` from the requested phases and poses. Keys are setup-relative local translation/rotation, multiplicative scale, in seconds. Existing `motion` presets are starting points and require rig roles; arbitrary motion is supported through explicit tracks. World-space planted contact trajectories must account for parent/root motion. Set `rootMotion: translate` only when intended; in-place locomotion is a separate behavior.
5. Bake secondary motion with `secondary` tracks. Use `slots`, `drawOrder` and `deforms` for view/pose swaps and authored shape changes. A generic two-view head-turn preset is not evidence for realistic full-body rotation; the robot example uses actual side and rear illustrations as discrete view attachments. For smooth perspective changes, generate and register additional angles instead of claiming that this discrete example supplies them.

Run the local pipeline (substitute the actual directories):

```text
npm run spine -- prepare <source>
npm run spine -- ingest <source> --out <work>
npm run spine -- assemble <work> --out <assembly>
npm run spine -- compile <work> --out <candidate>
npm run spine -- validate <candidate>
npm run spine -- preview <candidate>
npm run qa -- <candidate>
```

`register` produces `assets.registered.json`; pass it to ingest using `--manifest assets.registered.json`. If motion or rig is authored after ingest, copy those new specifications into the work directory before compile. Re-ingest when image geometry changes. Create a new candidate output directory for repairs so earlier evidence remains reviewable.

## Automatic repair and evidence

For side-scrolling humanoids, inspect full-size paired originals and enlarged `frames/*-details.png`, not just small full-scene thumbnails. Include detail sheets in review evidence and record `checks: {laterality:true, occlusion:true, articulation:true}` only after checking thumbs/palms, inner/outer boots, shoulder/hem/wrist overlaps and ankle orientation. Old approvals without these checks are insufficient. Pixel hashes detect copies, not incorrect anatomy in a newly generated image.

Continue autonomously within the requested task. Inspect `validation.json` and generated runtime contact sheets. Run `repair <candidate>` to obtain stage-specific repair tasks and persistent attempt counts; the agent executes those tasks through imagegen or local spec edits, then recompiles. Preserve `repair-history.json` when moving to a new candidate directory. Reading the same report does not consume another attempt. Default limit is three corrected candidates per issue; do not reset the history to evade exhaustion.

Check identity/proportions, blink consistency, seams, planted feet, mesh folds, clipping, turn swaps, and coverage of every requested action. Use the built-in browser for interaction checks. `npm run qa` captures the same bundle through headless Edge; this is rendering evidence, not automatic artistic approval.

Only after examining the current frames, write `visual-review.json` beside the bundle with its exact `hashes`, `status: passed` or `failed`, animation names, frame evidence paths, observations and reviewer `Codex`. Record failures honestly and run validate again. Do not approve based on a file extension, a successful reader parse, or the existence of screenshots. If artifacts change, the review becomes stale.

For non-humanoid/side-scroller jobs, also copy the current `reviewContextHash` and record `coverage: {morphology, view, facing}` matching the inspected character and artwork. Check actual appendage count, near/far occlusion, stable half-side perspective, facing, foot contact phase, ground anchor, and suitability for horizontal movement. Metadata alone is insufficient visual evidence.

At exhaustion, leave the candidate and diagnostic report marked incomplete. State which requested behavior failed and what evidence exists. A working subset is not completion of the whole prompt. Do not invent device performance, engine compatibility or quality claims that were not tested.

Deliver the runtime resource directory, preview address, source specifications, generation records and final quality report. Distinguish implementation capability, the demonstrated sample and remaining artistic limitations.

## Assembly reference comparison

After assembly, read [master-comparison.md](references/master-comparison.md). Compare the original master with both the assembled layout and the final official runtime setup frame. Author one uniform `assets.json` `masterAlignment`, retain the original, and inspect the generated side-by-side and overlay evidence. Record intentional pose changes separately from defects. An open raised collar may need separate rear/front layers; moving the whole head above or below the torso does not resolve that topology.
