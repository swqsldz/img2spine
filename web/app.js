import * as S from "@esotericsoftware/spine-webgl";
const $ = (id) => document.getElementById(id);
const resourceBase =
  document.querySelector('meta[name="spine-resource-base"]')?.content ??
  "/bundle/";
let bundle,
  data,
  skeleton,
  state,
  renderer,
  gl,
  current,
  playing = true,
  last = performance.now(),
  elapsed = 0,
  speed = 1,
  debug = false;
async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
function reset(name, time = 0) {
  current = bundle.animations.find((a) => a.name === name);
  if (!current) throw new Error("Unknown animation");
  skeleton = new S.Skeleton(data);
  state = new S.AnimationState(new S.AnimationStateData(data));
  state.setAnimation(0, name, current.loop);
  state.update(time);
  state.apply(skeleton);
  skeleton.updateWorldTransform(S.Physics.update);
  elapsed = time;
  $("seek").max = current.duration;
  $("seek").value = time;
  $("active-name").textContent = name;
  for (const b of $("animations").children)
    b.classList.toggle("active", b.dataset.name === name);
  const phases = bundle.motion.clips.find((c) => c.name === name)?.phases ?? [];
  $("phases").replaceChildren();
  for (const phase of phases) {
    const li = document.createElement("li");
    li.textContent = `${phase.name} · ${phase.start.toFixed(2)}–${phase.end.toFixed(2)}s`;
    $("phases").append(li);
  }
  render();
}
function render() {
  if (!renderer) return;
  const canvas = $("canvas"),
    ratio = Math.min(devicePixelRatio, 2),
    width = Math.round(canvas.clientWidth * ratio),
    height = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const h = bundle.job.canvas.height * 1.13,
    w = (h * width) / height;
  renderer.camera.viewportWidth = w;
  renderer.camera.viewportHeight = h;
  renderer.camera.position.set(
    0,
    bundle.job.canvas.origin[1] - bundle.job.canvas.height / 2,
    0,
  );
  renderer.begin();
  renderer.drawSkeleton(skeleton);
  if (debug) renderer.drawSkeletonDebug(skeleton);
  renderer.end();
  $("time").textContent =
    `${elapsed.toFixed(2)} / ${current.duration.toFixed(2)} s`;
  $("seek").value = elapsed;
}
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05) * speed;
  last = now;
  if (playing && state) {
    state.update(dt);
    elapsed = current.loop
      ? (elapsed + dt) % current.duration
      : Math.min(current.duration, elapsed + dt);
    state.apply(skeleton);
    skeleton.updateWorldTransform(S.Physics.update);
  }
  render();
  requestAnimationFrame(tick);
}
async function start() {
  bundle = await json(resourceBase + "bundle.json");
  $("name").textContent = bundle.name;
  if (bundle.presentation) {
    const names = {
      "three-quarter-side": "半侧身",
      profile: "正侧面",
      front: "正面",
      quadruped: "四足",
      humanoid: "人形",
      "multi-legged": "多足",
      serpentine: "蛇形",
      winged: "有翼",
      amorphous: "软体",
      custom: "自定义",
      unspecified: "自由结构",
    };
    $("profile").textContent =
      `${names[bundle.job.character?.morphology] ?? "自由结构"} · ${names[bundle.presentation.view] ?? bundle.presentation.view} · 朝${bundle.presentation.facing === "left" ? "左" : "右"}`;
  }
  $("prompt").textContent = bundle.job.prompt;
  $("count").textContent = String(bundle.animations.length);
  $("version").textContent = `Spine ${bundle.runtime.packageVersion}`;
  const canvas = $("canvas");
  gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    antialias: true,
  });
  if (!gl) throw new Error("WebGL unavailable");
  renderer = new S.SceneRenderer(canvas, gl);
  renderer.skeletonRenderer.premultipliedAlpha = false;
  const atlas = new S.TextureAtlas(
    await (await fetch(resourceBase + bundle.atlas)).text(),
  );
  await Promise.all(
    atlas.pages.map(
      (page) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            page.setTexture(new S.GLTexture(gl, image, page.pma));
            resolve();
          };
          image.onerror = () =>
            reject(new Error("Texture load failed: " + page.name));
          image.src = resourceBase + page.name;
        }),
    ),
  );
  data = new S.SkeletonJson(
    new S.AtlasAttachmentLoader(atlas),
  ).readSkeletonData(await json(resourceBase + bundle.skeleton));
  for (const a of bundle.animations) {
    const b = document.createElement("button");
    b.dataset.name = a.name;
    const text = document.createElement("span");
    text.textContent = a.name;
    const small = document.createElement("small");
    small.textContent = a.duration.toFixed(1) + "s";
    b.append(text, small);
    b.onclick = () => reset(a.name);
    $("animations").append(b);
  }
  const metrics = {
    骨骼: data.bones.length,
    插槽: data.slots.length,
    约束: data.constraints.length,
    动画: data.animations.length,
    纹理页: atlas.pages.length,
  };
  for (const [key, value] of Object.entries(metrics)) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = key;
    dd.textContent = value;
    $("metrics").append(dt, dd);
  }
  for (const file of [
    bundle.skeleton,
    bundle.atlas,
    ...bundle.pages,
    "validation.json",
  ]) {
    const a = document.createElement("a");
    a.href = resourceBase + file;
    a.download = file;
    a.textContent = file;
    $("downloads").append(a);
  }
  try {
    const report = await json(resourceBase + "validation.json");
    $("status").textContent =
      report.status === "complete"
        ? "运行与视觉检查通过"
        : report.technicalPassed
          ? "运行检查通过 · 视觉检查待完成"
          : "存在待修复问题";
    for (const issue of report.issues) {
      const p = document.createElement("p");
      p.textContent = issue.message;
      $("issues").append(p);
    }
  } catch {
    $("status").textContent = "尚未运行 validate";
  }
  $("play").onclick = () => {
    playing = !playing;
    $("play").textContent = playing ? "暂停" : "播放";
  };
  $("seek").oninput = (e) => {
    playing = false;
    $("play").textContent = "播放";
    reset(current.name, Number(e.target.value));
  };
  $("speed").onchange = (e) => (speed = Number(e.target.value));
  $("debug").onchange = (e) => (debug = e.target.checked);
  $("light").onchange = (e) =>
    $("stage").classList.toggle("light", e.target.checked);
  $("snapshot").onclick = () => {
    render();
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${current.name}-${elapsed.toFixed(2)}.png`;
    a.click();
  };
  reset(bundle.animations[0].name);
  window.img2spine = {
    ready: true,
    bundle,
    seek: (name, time) => {
      playing = false;
      reset(name, time);
    },
    capture: () => {
      render();
      return canvas.toDataURL("image/png");
    },
    captureSetup: () => {
      playing = false;
      skeleton = new S.Skeleton(data);
      skeleton.updateWorldTransform(S.Physics.update);
      render();
      const h = bundle.job.canvas.height * 1.13;
      return {
        image: canvas.toDataURL("image/png"),
        worldHeight: h,
        worldWidth: (h * canvas.width) / canvas.height,
      };
    },
    getState: () => ({
      name: current.name,
      time: elapsed,
      bones: data.bones.length,
      slots: data.slots.length,
    }),
    setDebug: (value) => (debug = value),
  };
  requestAnimationFrame(tick);
}
start().catch((error) => {
  $("error").hidden = false;
  $("error").textContent = error.message;
  console.error(error);
  window.img2spine = { ready: false, error: error.message };
});
