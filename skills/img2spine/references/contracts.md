# Data contracts

Schemas are versioned `schemaVersion: 1`. Read the project's `src/schema.ts` or generated `schemas/*.schema.json` for all supported fields; unknown fields in strict objects are rejected. Use `examples/robot/{job,assets,rig,motion}.json` as a complete working example, not as a universal skeleton.

## JobSpec (`job.json`)

`name` is filesystem-safe; `prompt` preserves original intent. `canvas` contains width, height and `origin: [x,y]` in image pixels. `actions` supplies name, description, duration, loop, views and `rootMotion` (`in-place` or `translate`). Defaults: 2-second clips, 30 fps analysis, three repair attempts. Each requested action must have a matching MotionSpec clip with the same duration and loop setting.

`character: {morphology,description}` declares actual anatomy. `presentation: {usage,view?,facing,mirrorPolicy,groundY?}` supplies game context. Side-scroller usage defaults to three-quarter-side; general usage defaults to front. Empty/omitted action views inherit this default. See [anatomy-and-sidegames.md](anatomy-and-sidegames.md) for anatomical rig and game-facing rules.

## AssetManifest (`assets.json`)

Before generating new assets, author the optional compiler-compatible `asset-plan.json` production contract (`src/production.ts`, `schemas/asset-plan.schema.json`). It declares planned IDs/views/materials, region/mesh bindings, seam ownership and per-view reference draw order. See [first-pass.md](first-pass.md) for fields and examples. `prepare` writes concrete generation prompts and reports plan mismatches; `assemble` checks the plan and produces reconstruction evidence before animation. It does not replace AssetManifest geometry or RigSpec/MotionSpec.

`master` and each asset `file` are relative to the manifest directory. Each asset contains a stable `id`, a `view`, `generation: {mode,prompt,reference?}`, and `placement: {x,y,width,height,rotation?,mirror?}`. Placement is the unrotated artwork rectangle in master-image coordinates; rotation is clockwise about its center. Mirror applies during normalization.

Optional `facing` (left/right/neutral) and `depth` (near/far/center) retain orientation and camera depth. For side-scrollers, the compiler checks the views of attachments actually used by each action; an unused half-side asset does not make a front-facing rig suitable.

`trimAlphaThreshold` defaults to 1. A higher value can frame a hard-surface asset around its opaque silhouette when generation introduced a broad transparent glow; it crops bounds but preserves pixel alpha inside them. Never raise it blindly on hair, translucent effects, or soft edges. Actual alpha is required regardless of this value.

`sourceRect: {left,top,width,height}` optionally selects one semantic part from a generated sheet before alpha trimming. Verify the image and rectangle visually first; this mechanical crop does not infer part identities or create occluded pixels. The original full image is preserved.

Ingest creates normalized PNGs, source copies, SHA256 and `trim` offsets. Coordinates used by `registration.json` are normalized-part pixels; target coordinates are master-canvas pixels. Each registration entry is `{asset,source:[[x,y],...],target:[[x,y],...]}` with corresponding points. `register` fits translation, uniform scale and rotation, writes a sibling manifest, and invalidates cached normalization.

## RigSpec (`rig.json`)

Paired assets support `anatomy: {side: left|right|center, pair, surface: outer|inner|palm|back|neutral, symmetryReason?}`; side-game humanoids require this on near/far assets. Matching segment pairs with opposite sides must not use identical source hashes/crops without an explicit symmetry justification. See [official example lessons](official-example-lessons.md).

RigSpec `layerRules: [{behind,inFront,reason,animations?:[]}]` constrains slot drawing order independently of bone parenting and camera depth. Empty animations checks setup and every clip; named clips limit the scope. Every active drawOrder key is checked. Side-game humanoids require an explicit layer plan.

`bones`: exactly one root, parents before children, local x/y, rotation in degrees, scaleX/scaleY, length along positive local X. `range: [min,max]` optionally describes rotation deltas for stress inspection. `slots` specify name, bone, nullable setup attachment and all permitted attachments. An attachment is `{name,asset,type, influences?,spacing?}`; type is region or mesh. Mesh spacing is in normalized image pixels. `ik` specifies a one/two-bone contiguous chain, external target, mix and bend direction. `roles` maps preset semantic names to real bone names; `headSlot` is a slot role.

Mesh `jointBlend` defaults to 0.3, the blending radius as a fraction of the shorter adjacent bone. Increase it for a wider soft-tissue transition when a narrow band folds; inspect rigid extremities after changing it. Anatomical motionModel fields are documented in [anatomy-and-sidegames.md](anatomy-and-sidegames.md).

For joint-driven rig generation, `joints.json` has `joints: [{name,parent?,point:[x,y],tip?:[x,y]}]`, plus `slots`, `ik`, `roles`. Points and tips are image-canvas coordinates. `rig` converts these to local transforms. Without a tip, world rotation is zero.

## MotionSpec (`motion.json`)

`clips` contains name, duration, loop and optional:

- `phases: [{name,start,end}]` for observable action phases.
- `bones: {boneName:[{time,x?,y?,rotation?,scaleX?,scaleY?,curve?}]}`. Translation and rotation are **deltas from setup**, scale is a multiplier. Missing components are unchanged. Curve is smooth, linear or stepped. Smooth scalar tracks are sampled and baked; the compiler emits correct 4.3 scalar `value` timelines.
- `slots: {slotName:[{time,attachment}]}`; null hides a slot.
- `drawOrder: [{time,slots:[all slot names in desired order]}]`.
- `deforms: [{slot,attachment,keys:[{time,vertices,curve}]}]`; weighted offsets require two values per bone influence per vertex, not just two per mesh vertex. The compiler verifies lengths and exports linear, stepped or Spine 4.3 Bezier easing.
- `contacts: [{bone,start,end,point:[worldX,worldY],tolerance}]` for actual planted contact validation.
- Optional contact `velocity: [vx,vy]` expresses moving ground in world pixels/second from the contact start; absent means a fixed point. In-place gaits use moving-ground checks, translated gaits use planted points.
- `secondary: [{bone,amplitude,cycles,phase,damping}]` for baked rotational follow-through. Cycles should be integral for looping motion unless a seam is intentionally requested.

Custom view groups use ordinary bones and slots, with explicit setup transforms and attachment switching. No implicit 3D reconstruction or automatic perspective recovery is claimed.

## Reports

`bundle.json` records pinned runtime, resource SHA256, requested actions and source rig/motion. `validation.json` separates technical and visual pass. `browser-validation.json` reports actual WebGL frame capture, nonempty frames and browser errors. `visual-review.json` uses `{hashes,status,animations,evidence,observations,reviewer}` and must refer to the exact current bundle. Report status cannot be inferred from successful CLI exit alone: `needs-visual-review` is not complete.

## Master reference placement

`AssetManifest` supports `master` and `masterAlignment: {scale, x, y, basis}` for one uniform reference-to-job-canvas transform. See [master-comparison.md](master-comparison.md) for output files and visual-review fields. Missing registration prevents visual approval for new planned/master-based compilations while preserving numerical runtime validation.
