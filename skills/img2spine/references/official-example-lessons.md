# Paired limbs, articulation and occlusion

Use for humanoid side-game production and repairs. Evidence is the pinned local `reference/spine-runtimes/examples/` snapshot, especially Spineboy, Hero and Raptor; these are reference data rather than templates to copy wholesale. Run `node scripts/research-examples.ts` to create source inventories and paired-part boards in `output/research-official/`.

## Findings from actual examples

- Spineboy has distinct front/rear upper arms, bracers, thighs, shins and feet. Inner/outer surfaces, perspective and highlights differ. Hero similarly has hand1/hand2, forearm1/forearm2 and foot1/foot2. Numbers and front/rear labels are not universal anatomical left/right conventions; inspect art and binding.
- Slot order is per part. Spineboy's front upper arm precedes head while front bracer/fist follow it. Hero places foot before shin to conceal ankle overlap and separates hands/fingers around weapons. A limb is not one indivisible depth layer.
- Spineboy and Hero retain setup slot order through their listed animations in this snapshot. Feet passing horizontally does not imply a near/far layer swap. Raptor jump/roar do key specific horn/thigh order changes when the pose needs them.
- Spineboy uses two-bone leg IK followed by one-bone foot IK; hip and foot controls have independent hierarchies. Raptor combines weighted leg meshes with leg/foot constraints. An ankle point following a contact path does not prevent the whole boot rotating with the shin.
- Raptor weights joint-adjacent vertices to hip/head to maintain joins and binds its flexible tail straight. Use localized joint weighting and real hidden overlap, not influence from unrelated bones.
- Motion coordinates hip, torso, shoulders, wrists, head and feet. Inspect contact/down/passing/up poses and anticipation/action/recovery. Raptor changes hand/gun attachments when its grip changes.

Official explanations: [Spineboy](https://en.esotericsoftware.com/spine-examples-spineboy), [Raptor](https://en.esotericsoftware.com/spine-examples-raptor). Web documentation may describe a different release; the pinned local reader/export governs serialization.

## Production decisions

The original Hero parts have rounded ends painted in the part's own material. Spineboy also has circular armor details that are intentional design, not editor pivot markers. Match this distinction: hidden overlap should continue skin, fabric or armor, while bone/pivot guides belong in metadata. Do not paint tan disks onto clothed joints. See [parts-sheet.md](parts-sheet.md#prevent-painted-pivot-disks) for the tested imagegen repair route.

1. Choose an anatomical side map from the master. This adventurer uses near = right/outer surface and far = left/inner surface; this is character-specific, not a universal facing rule.
2. Generate asymmetric partners separately with the master as reference. Specify thumb/palm versus back, inner boots and pocket/buckle placement while preserving screen-facing toes. Mirroring does not recover the hidden surface. Different source files still need visual anatomy review.
3. Split wrists and ankles at suitable seams with overlapping pixels. `partitionAsset` offers authored horizontal crops while preserving registration; it does not infer segmentation or synthesize hidden areas. Its per-piece tight crop offsets must enter placement: a second alpha trim and contain-resize would otherwise recenter asymmetric pieces. Verify the post-ingest reconstruction, not just crop metadata. Regenerate when overlap is absent. Set pivots inside opaque overlap and choose which part covers the cut; a rounded upper elbow can need to draw after its forearm.
4. Author per-part layer relations and inspect setup plus every draw-order key. Keep shoulders behind head and near forearms in front of torso only where the actual pose calls for it. Do not sort all near parts above all central parts or swap entire legs during a gait.

   Also compare far hands/forearms against BOTH legs and boots during passing/down poses. A rule saying only "far hand behind torso" leaves it free to appear between the two legs. In the adventurer's fixed-view actions, all far-arm parts are behind both legs; encode these actual relations explicitly. This is a pose-specific decision, not a universal rule for reaching across the body or holding a foreground object. Read the silhouette as a whole: a palm emerging at the crotch or knee can look disconnected even when its elbow is technically joined.
5. Solve legs to ankles, then control feet independently. The revised adventurer uses one-bone foot IK with a separately animated direction target to keep boots flat. It does not yet implement Spineboy's complete toe-roll controls; add toe roll or foot pose attachments if needed.
6. Inspect full-size paired originals, fixed-camera sheets and enlarged details for all actions. Numerical contact success is not artistic acceptance; inspect wrist, elbow, hip, ankle and garment joins.

Mesh support must cover opaque edges. Never discard sparse contour triangles merely because one midpoint is transparent: that creates saw-tooth holes in clothing. The compiler uses complete alpha-occupied grid cells with shared internal vertices, trading some transparent overdraw for stable coverage and bounded triangle shapes. Check both visible silhouette coverage and deformation folds; keeping a sparse convex hull alone can create thin folding triangles across concavities.

## Executable contracts

Assets: `anatomy: {side: left|right|center, pair: <matching segment id>, surface: outer|inner|palm|back|neutral, symmetryReason?: <specific justification>}`. Example: both fists use pair `hand` with different side/surface. Side-game humanoid near/far assets require side metadata. Opposite sides sharing the same source hash and crop are rejected unless both have an explicit symmetry justification. Separate regions of one sprite sheet are allowed. Symmetry exceptions are for truly symmetric stylized designs, not a shortcut for asymmetric human hands.

Rig: `layerRules: [{behind,inFront,reason,animations?:[names]}]`. Empty animations applies to setup and all clips. Scoped rules apply to their clip's active order, including setup before the first key. Rules constrain order rather than automatically sorting it; contradictory or cyclic precedence fails.

Prepare reports these issues and compile blocks them. Anatomy, source hashes/crops and layer rules enter the visual-review context. Humanoid side-game approval also needs laterality, occlusion and articulation checks with enlarged evidence. A metadata label cannot prove the actual shape of a thumb.
