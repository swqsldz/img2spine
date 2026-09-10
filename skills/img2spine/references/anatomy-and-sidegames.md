# Anatomy and side-scrolling games

## Decide from the character and actions

Use JobSpec `character: {morphology,description}`. Morphology may be humanoid, quadruped, multi-legged, serpentine, winged, amorphous, or custom; these are planning labels, not skeleton templates. Mixed creatures use their actual groups, such as four legs plus two wings and a tail. Missing limbs are not substituted with human arms or legs.

For horizontal platform/action games set `presentation: {usage: "side-scroller", facing: "right"}`. Omitted `view` resolves to `three-quarter-side`; general projects retain front as their default. Explicit user view overrides win. Omitted/empty action `views` inherits this resolved view. Explicit views on an action override it (for example a front-facing emote or multi-view turn).

Three-quarter-side means mostly a lateral silhouette with about 15–30 degrees toward the viewer from strict profile, not a frontal 45-degree portrait, isometric/top-down render, or mathematical runtime camera angle. Request a ground-level orthographic camera, readable horizontal silhouette, consistent near/far projection and room for attacks. Use the same mother reference and angle for every part. `prepare` writes art-brief.json with these requirements before generation.

`groundY` is the main ground anchor in master-canvas pixels, defaulting to canvas origin Y. Near and far paws can have different projected Y coordinates; do not force them to one pixel row at the cost of perspective. Distinguish logical game contact/root location from illustration depth. Keep this anchor and overall scale consistent across clips.

## Generate the parts the anatomy needs

| Anatomy         | Useful structures and motion                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Four/many legs  | One IK chain and target per leg, explicit phase per leg, body above leg chains, far limbs behind the body and near limbs in front as appropriate |
| Snake/worm      | Contiguous spine chain, contour mesh, propagated axial phase, separate head only if the design has one                                           |
| Wings/fins      | Explicit appendage chains and independent phase/direction; allow folding, asymmetry and occlusion through custom tracks                          |
| Slime/soft body | Body mesh/bone with compression and hop, contact anchor at the base; do not invent knees or shoulders                                            |
| Tail/tentacle   | Connected chain with phase delay and weights limited to that chain                                                                               |
| Mixed/custom    | Combine groups; author custom MotionSpec when the existing primitives do not express the requested behavior                                      |

Asset fields `depth: near|far|center`, `facing: left|right|neutral`, and `view` retain intent. Near/far is camera depth, not anatomical left/right. Generate distinct far-side parts when foreshortening or markings differ. Reusing a symmetrical leg with registered dimensions can work for simple creatures, but inspect overlap and shading; it is not an automatic anatomy reconstruction method.

For facing changes, `mirrorPolicy: symmetric-only` permits mirroring only after inspecting whether the design is symmetric. Text, emblems, weapons and asymmetric anatomy need `separate-art`; the compiler rejects mirrored attachments under that policy. Do not rotate or rename a right-facing piece to claim it is left-facing. Multi-facing bundles can be authored as separate jobs/view groups when their rigging differs.

## Bind through motionModel, not humanoid role names

For paired humanoid artwork, follow [official-example-lessons.md](official-example-lessons.md): explicitly declare anatomical side/surface, generate distinct asymmetric partners, split wrist/ankle controls as needed and validate per-part layer rules. Creature symmetry examples do not justify duplicating human hands or marked boots.

RigSpec accepts an optional `motionModel`:

```json
{
  "root": "root",
  "body": "bodyMass",
  "breathAxis": "scaleY",
  "gait": { "stride": 24, "lift": 12, "stance": 0.62 },
  "limbs": [
    {
      "id": "foreNear",
      "kind": "leg",
      "bones": ["foreNearUpper", "foreNearLower"],
      "target": "foreNearTarget",
      "end": "foreNearFoot",
      "phase": 0
    },
    {
      "id": "foreFar",
      "kind": "leg",
      "bones": ["foreFarUpper", "foreFarLower"],
      "target": "foreFarTarget",
      "end": "foreFarFoot",
      "phase": 0.5
    }
  ],
  "chains": [
    {
      "id": "tail",
      "kind": "tail",
      "bones": ["tailBase", "tailTip"],
      "amplitude": 6,
      "phaseLag": 0.15
    }
  ]
}
```

The excerpt shows two groups, not a complete four-leg rig. A quadruped needs four actual leg entries. Add as many groups as the creature has. `examples/moss-boar` provides all four, including joints.json, far/near slots and actual imagegen images.

Leg bones must match a contiguous one/two-bone IK constraint. The endpoint follows the final segment; the target is a direct child of root, outside the constrained chain. Phase is normalized [0,1], not seconds. A trot typically pairs diagonal legs; a crawl or insect gait needs different phase assignments. Choose and inspect phases for the animal rather than assuming every quadruped trots.

Wings/arms/tentacles use `bones`, `phase`, signed `direction` and `amplitude` in degrees. Axial groups use `kind: spine|tail|tentacle|neck`, connected bones, amplitude and normalized phaseLag. Keep independently driven groups disjoint. The model identifies bones, not image identities; continue to use landmarks and inverse transforms for binding.

## Motion primitives and contact

With motionModel, `motion` routes to anatomical primitives: idle, walk/run, jump/hop, fly, slither/swim, wave and lunge. Each checks required structures. A legless walk or wingless fly reports the missing capability. Attack, turning, unusual gaits or combinations can use fully authored MotionSpec; a missing primitive never falls back to a humanoid gesture.

Walk/run works over the declared leg array, including four and six legs. Stride/lift are world pixels; stance is the support fraction. Both left/right facing and rotated root setup transforms are handled. Run increases stride/lift and reduces support fraction; it is only a starting gait, not a promise of species-specific gallop.

For `rootMotion: translate`, the root advances horizontally and planted contact points stay fixed during stance. For `in-place`, the root stays fixed and a stance contact explicitly moves backwards at the implied ground speed, stored as `contacts[].velocity` in world pixels/second. In game integration, move the character at that matching speed, or retime/adapt the clip. Passing the moving-contact check does not mean a stationary world-space foot.

Preview compares contact position at the official runtime's actual animation phase, including loop boundaries. Inspect stance duration, lift, feet passing each other, ground penetration, near/far overlap and silhouette while moving horizontally. Numeric checks do not judge whether an animal's gait looks convincing.

For final visual review, copy bundle `reviewContextHash` and set `coverage.morphology`, `coverage.view` and `coverage.facing`. This ties approval to the task's anatomy/view requirements as well as exported file hashes. Preserve failed candidates and the normal three-round repair bound.
