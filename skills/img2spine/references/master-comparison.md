# Compare every assembled character with its original

Keep `AssetManifest.master` pointing to the original reference. Add `masterAlignment: {scale, x, y, basis}` to `assets.json`: one positive uniform scale and canvas translation in pixels, plus measured landmarks or rationale. `ingest` retains this metadata and copies the master. Use torso/waist and overall proportions to establish alignment; inspect head size, neck base, shoulders, hips and silhouette. Do not transform each reference limb separately to conceal errors. Select a matching reference view and explain intentional pose changes. This contract supports uniform scale/translation, not perspective warping.

`assemble` emits `master-original.png`, `master-aligned.png`, `assembly-reference.png`, `master-comparison.png`, `master-overlay.png` and `master-comparison.json` alongside joint details. These compare static placement in actual setup slot order. Missing master/alignment is explicitly reported. Generated files require visual inspection; they are not an automatic similarity score.

`compile` regenerates the comparison under `<candidate>/comparison/` and preserves evidence hashes in `bundle.json`. `npm run qa -- <candidate>` captures `frames/setup.png` through official WebGL and creates `frames/master-runtime-comparison.png`. The runtime camera is inverted using its scale and origin, not an independently fitted character bounding box. Inspect this too: meshes, IK and atlas reconstruction can differ from static placement.

For newly compiled jobs with an asset plan or master, `validate` requires:

- Current runtime action evidence and `frames/master-runtime-comparison.png` in `visual-review.json` `evidence`.
- `checks.masterComparison: true`, only after actual inspection.
- `masterComparison: {evidenceHashes, observations}` in that review, copying current `bundle.masterComparison.evidenceHashes` and recording actual proportion/placement/occlusion findings and explained pose differences.

Changing comparison images or reconstruction invalidates this review. Missing evidence produces `MASTER_COMPARISON_PENDING`; numerical runtime success remains separate. Older bundles without comparison metadata remain legacy artifacts and must be recompiled to use this gate. Alternate views need matching reference comparisons; one setup frame does not approve all views.

## Collar lesson

If the neck lies inside an open raised collar, split the occlusion as **torso/rear collar → complete head and neck → front collar**. Bind the front collar to the torso and express both relations in `layerRules` and the asset plan. Preserve hidden neck and jacket material. Extract existing foreground pixels mechanically when possible; use imagegen if missing content needs painting. Mask coordinates belong to the selected artwork and must not become a universal template. Inspect both collar edges through head tilt and body motion. Do not compensate for wrong occlusion by raising or enlarging the head; compare proportions against the master before and after repair.

An open shirt can expose the throat below the outer collar. Check that the head-owned skin reaches the deepest visible opening, with overlap for the actual head rotation range. A short neck tapered toward the nape can expose the torso's placeholder fabric through that opening even when slot order is correct. Regenerate complete throat/upper-chest material when needed, then register ear, chin, nape and throat against the same master alignment. Include both foreground shirt lips in the occluder and cover any hidden neck base protruding beside the shoulder. Update the anatomical head pivot after registration; inspect enlarged runtime frames across every action, not only setup. These landmarks and mask shapes are specific to the current artwork.
