# Design for the first usable candidate

Read this before generating new characters. This workflow front-loads decisions learned from the adventurer repairs; it does not guarantee first-shot image quality. Codex performs the inspections autonomously, without routine user approval.

## Before imagegen: author a production plan

Write `asset-plan.json` alongside `job.json`. Use `src/production.ts` and `schemas/asset-plan.schema.json` for the contract. `examples/mountain-scout/asset-plan.json` is a concrete **clothed adventurer** example, not a universal anatomy, part count or set of coordinates.

- `background`: `{mode:"transparent"}` or `{mode:"chroma",color:"#FF00FF",reason:"..."}`. For this project's established route, prefer solid chroma absent from the character palette, followed by the existing mechanical keying process. Honor an explicitly requested transparent route. Never key skin or clothing colors, silently change models, or mistake a painted checkerboard for alpha.
- `parts`: asset ID, actual view, camera depth, explicit anatomical side/visible surface in `anatomy`, appearance, material, `attachment: region|mesh`, and connected `influences` for weighted parts. IDs must match the eventual manifest. A part inventory is derived from requested actions and materials, not a robot template.
- `joins`: actual planned joint bone, involved part IDs, `strategy`, seam `owner`, and a concrete description of hidden material, overlaps and motion needs. `continuous-mesh` uses one illustration spanning at least two bones; `covered-overlap` uses two or more parts with the cut concealed by its owner. Zero joins is legitimate for an unarticulated body; do not invent human joints on a snake or creature.
- `drawOrder`: each view's complete back-to-front asset IDs. This is reference-pose order. Express animation-dependent occlusion separately in RigSpec `layerRules` and MotionSpec; the reference plan does not override reaching/turning poses.

Run `prepare <source>` before generation. It emits `production-brief.json`, `imagegen-master-prompt.txt`, and `imagegen-parts-prompt.txt` with the original intent, action timing, morphology, requested views, inventory, background and joins. Read the text before handing it to built-in imagegen. Add concrete layout/group instructions as needed. These files are ordinary reusable prompts, not installed ImageGen gallery templates, and the CLI does not call imagegen.

Without a plan, older projects still prepare/compile; the generated parts prompt explicitly requests a plan for new generation. With a plan, prepare reports missing or inconsistent parts, views, bindings and setup order. Assembly and compilation reject these inconsistencies. A valid plan is structural evidence, not visual approval.

## Choose cuts by material and movement

| Connection             | Preferred first-pass choice                                                                    | What to avoid                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Flexible clothed knee  | One hip-to-ankle trouser image, weighted to thigh and shin; separate rigid foot when needed    | Two independently shaded round knee caps, or rigid boot distorted by thigh weights |
| Bare or clothed elbow  | Continuous mesh where appropriate, or a cut hidden by a sleeve/bracer with an explicit owner   | Duplicate skin bulbs, exposed cylindrical cut faces                                |
| Neck with open collar  | Head owns full neck and hidden skin; torso owns collar and visible chest; overlap under collar | Torso neck stump plus head neck, erased chest, dark horizontal cut edge            |
| Hip under tunic        | Complete thigh roots extend under the hem; actual hip anchors measured on this artwork         | Dangling torso plugs, thigh anchors copied from a previous sheet                   |
| Armor/mechanical hinge | Separate rigid plates/segments when design calls for them, preserving legitimate hinge details | Applying soft-cloth rules or removing all circular details                         |
| Tail, wing, tentacle   | Actual connected anatomy, continuous flexible surfaces plus separate rigid elements            | Imposing human limbs, part count, gait or seams                                    |

Plan overlaps for the actual expected bend range. Keep opaque hidden material and natural folds; pivots exist only in JSON metadata. Near/far, anatomical side and screen facing are independent. Specify palm/back and inner/outer surfaces; an asymmetric opposite hand cannot be made by renaming, resizing or reflecting the same art without justification. For the adventurer's fixed-view actions, the whole far arm is behind both legs; this is a case-specific occlusion decision.

Generate and inspect the assembled master first, then attach it as identity reference for parts. Prefer a small number of coherent groups when a crowded sheet loses detail. Layout PNGs are visual guidance only: validate every output crop, scale, silhouette, side identity and actual alpha. Use the approved continuous-leg design when creating a cloth humanoid layout reference, rather than inheriting the failed fourteen-part sheet's caps.

## Before full animation: reconstruct and inspect

After measuring new source bounds and correspondence points, ingest and author the actual local rig. Run:

```text
npm run spine -- prepare <source>
npm run spine -- ingest <source> --out <work>
npm run spine -- assemble <work> --out <assembly>
```

`assemble` creates `assembled.png`, light/dark composites, `joint-details.png`, and `assembly-report.json` with current spec/image hashes and measured world-joint crop locations. It requires normalized assets and uses setup attachment order. With a plan it crops the declared joins; older projects fall back to child bones with nonzero lengths. It reconstructs **asset placement**, not IK/mesh-evaluated animation. Inactive alternate views need their own setup inspection before attachment switching is accepted.

View the actual master, full assembly and both-background details. Check silhouette, proportions, hand identity, far-arm order, neck/hip roots, elbow/knee continuity and chroma spill. Fix placement/scale using fresh measured correspondences first; regenerate only defective art when content or contour is wrong. Never carry numerical anchors from another image because the prompt requested the same layout. Do not invent a passed review merely because images were written.

Only after this inspection author full motion and compile. Before spending on complex animation, inspect actual runtime bent/contact/extreme poses. The existing validator, three-loop evaluation and browser `frames/*-details.png` inspection still apply to every requested action. Assembly images cannot replace those tests. Preserve failure reports and the three-attempt repair limit; don't reduce requested motion to make the candidate pass.

## Reference comparison and layered collars

Use [master-comparison.md](master-comparison.md) for the required post-assembly comparison and review fields. For open raised collars, plan rear collar/torso, full head/neck, and a separate foreground collar when the neck must sit between them. A single torso image cannot occupy both depth positions relative to the head.
