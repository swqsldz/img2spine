> Historical experiment: some inputs and commands below are not included in this curated release. See [current entry points](../README.md) and [research scope](HISTORICAL-RESEARCH.md).
> 历史试验：部分输入和旧命令未随精选版本发布，当前入口以根 README 为准。

# 内侧手遮挡修正与 ImageGen 拆件模板研究

## 2026-09-09：纯色背景再去色测试成功

根据用户要求，通过内置 imagegen 将原拆件图改为纯品红背景，随后用本地 imagegen 附带的 `remove_chroma_key.py` 去色；没有使用额外生图 API。结果为 `output/research-parts-sheet/magenta-v5-alpha.png`，真实 RGBA，完全透明像素 1,208,415 / 1,572,516（约 76.8%），半透明边缘像素 13,220，不透明像素 350,881。图像四边无残留不透明像素，alpha≥128 的品红优势像素检查为零。

检测到 14 个主体连通分量，另有 1 个微小分量保留；深浅背景合成检查未见明显品红边缘，整图 ingest 通过。原图、提示词、参数和检测结果分别保存在 `magenta-v5.png`、`magenta-v5-prompt.txt`、`magenta-v5-analysis.json`；对照图为 `magenta-v5-background-check.png`。

处理命令参数：`--auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`，实际采样色为 `#fb03fa`。保留原始纯色图与输出，不覆盖旧候选。该结果确认了“内置生成纯色底 + 本地去色”的透明素材路径；仍需逐部件裁切、比例配准和绑定验收，未替换现有可播放角色。这不改变下文直接请求 alpha 曾失败的历史记录。

## 本轮结论

可以要求 imagegen 直接画出整套拆件图，并以参考 PNG 复用排布和画风。但本轮两张样本均没有真实透明通道，不能直接进入 Spine 制作。当前采用“可选整套拆件草稿 → 素材质量检查 → 实测裁切与复原 → 单部件补做 → 本地绑定和动画编译”的路径。

## 内侧手为什么出现在两条腿之间

修正前的实际 slot 顺序是 `legFarBoot → legFar → lowerFar → upperFar → lowerFarHand → legNearBoot → legNear`。前轮仅约束了手臂与 torso 的关系，遗漏了远手与远腿的相对关系。用户截图显示的膝部掌心正是这个顺序的结果。

本轮将这四个固定视角动作的整组远侧手臂放到两条腿及靴子后方，并添加 3 个手臂部件 × 4 个腿靴部件的 12 条明确 layerRules。保留圆肘覆盖前臂根部的顺序，骨骼、素材、步态与时间轴不变。这不是所有角色通用的层级：向镜头伸手、拿前景道具等动作仍需单独设计。

新资源目录为 `output/side-adventurer/revised-v4/`。复核四动作的 48 张放大帧，运行采样无翻折，循环和支撑检查通过。旧 v3 的遮挡批准撤回，保留原记录与用户截图，便于对照。

## 实际生图试验

使用 Codex 内置 imagegen，没有调用额外 API，也没有使用 CLI 生图。

| 样本         | 输入与目标                                                    | 实际结果                                                                                       |
| ------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| direct-v1    | 原角色母图 + 明确 4×4 排布、14 部件和 2 空格、左右与掌背要求  | 视觉上出现 14 个独立部件，内外护腕、裤腿和脚有区别；但棋盘格画进了 RGB，透明像素 0 / 1,572,516 |
| reference-v2 | 第一张拆件图作为布局参考/编辑目标，仅要求移除棋盘格、保留部件 | 主要布局保留，仍然是画出来的棋盘格，透明像素 0 / 1,572,516                                     |

两张均为 1254×1254，实际 ingest 都拒绝了不透明背景。提示词、原图及可重建的检查记录分别在 `output/research-parts-sheet/*-prompt.txt`、`*.png`、`analysis.json`。运行 `node scripts/research-parts-sheet.ts` 可重新检查 alpha 和 ingest 结果。

还存在这些待处理项：躯干跨越了约定的等分行界，不能直接按 4×4 等分裁图；手与头的相对尺寸尚未配准验收；画出的圆形关节端面必须藏在重叠区域，不能当作已完成的蒙皮关节。两张均未作为角色正式素材，也未做绑定或原画复原验收。

这是两个样本的证据，不是透明图生成成功率测量，更不意味着内置工具永远无法生成透明图。项目此前有实际透明部件。官方文档也把跨次一致性和精确构图控制列为限制；API 文档不等于本会话内置工具的具体参数接口。[官方图像生成限制](https://developers.openai.com/api/docs/guides/image-generation#limitations)

## 模板功能到底做什么

### 用户要求后的透明背景复测

再次通过内置 imagegen 测试两条路径：`transparent-v3.png` 使用已有拆件图并以中文明确要求 alpha=0；`transparent-fresh-v4.png` 改用原始角色母图重新生成，排除棋盘格参考图的直接影响。两张原始文件均为 **3 通道 RGB、hasAlpha=false、透明像素为零**，实际 ingest 均拒绝。后者还出现前臂连手与独立拳头重复的问题，因此没有进入正式素材。完整提示词和文件哈希见 `output/research-parts-sheet/transparent-retry-analysis.json`。本次明确重试仍未获得可用的透明底整套拆件。

本地检查区分了两类模板：

1. **imagegen 技能的文字模板**：`.system/imagegen/references/sample-prompts.md` 的 Game assets template 是结构化提示词配方，没有 Spine 专用拆分或坐标约束。
2. **Codex 的 ImageGen 参考图模板**：本地 `template-creator` 的 `scripts/create-template-skill.mjs` 中 `getImageTemplateWorkflow("imagegen")` 保存并调用参考 PNG，再将用户要求传给 imagegen。模板包保留 `assets/reference.png`、预览、说明和清单，供后续复用视觉风格与布局。

第二种确实有用：可把已经验收的拆件排布保存为日后角色的构图参考。本轮第二次调用验证了相同的“保留 PNG 作为参考”生成机制；**未创建模板库条目，也未声称验证了模板库 UI 选择流程**。不将带伪透明和比例问题的实验图注册成生产模板。

PNG 参考模板不会直接输出 PSD 图层、独立文件目录、骨骼、权重、IK 或动画，也不会使约定坐标、alpha 或左右解剖自动可靠。它还可能把参考图缺陷一起带入下一次生成。

## 建议采用的生产模板

将“参考 PNG”和以下结构化规格一起保存，而不是只保存一张拆件海报：

- 部件 ID、角色解剖学左右、内外侧/掌背、视角与朝向。
- 必需的隐藏区域、关节重叠和相对比例；哪些部件必须单独画。
- 排布意图与实际测得的裁切矩形，分别保存，不能混为同一数据。
- 复原位置与关节标记、骨链影响范围、逐部件/逐动作遮挡关系。
- 透明、数量、轮廓相碰、左右身份、比例、复原和 runtime 动作验收结果。

技能中新增 `references/parts-sheet.md`，提供可复用提示词和检查步骤。人形 14 部件只是一个起点；非人形按腿数、翅膀、尾巴、触肢和所需动作重新生成清单。
