# 变更记录

## 未发布 — 2026-09-09

- 用新母图实测首轮工作流：山地斥候 12 部件、双连续腿网格及四动作；记录两轮局部美术修正和一次配准修订，以及最终 48 帧 runtime 复核。
- 新增 `demo:scout` 和明确品红背景的机械去色脚本，保留图像来源、提示、测量和候选，不将该样本误报为首张生成即成功。

- 将历次手脚侧别、远臂遮挡、关节圆盘及肘髋颈膝修复前移到首轮工作流：新增 AssetPlan 契约、生成提示输出与素材/绑定/初始层级一致性检查。
- 新增 `assemble`：无需动作数据即可输出透明及亮暗底复原、按实际骨骼定位的关节放大图和带哈希的待复核报告；旧项目兼容，视觉批准仍需真实 runtime 动作帧。
- 更新 img2spine 技能、按材质选择连续网格/遮盖接缝的制作约定，以及非人形、视角和生产计划回归测试。

- 膝部修订：保留四片加权仍有重复轮廓的第一候选；重绘为两张完整髋踝贴图并绑定双骨骼网格，消除重叠椭圆膝盖与鼓包。
- 新增 `demo:knees` 重建入口、原布局配准和独立候选；四动作 48 帧复核及连续求值无网格翻折，脚掌 IK 保留。

- 修订拆件角色肘部定位与护腕接缝、重新定位髋膝骨骼并移除衣摆悬接圆头；重绘领口并补全颈部隐藏皮肤。
- 新增 `demo:joint-fit` 及独立候选，保留四动作并重新执行官方 runtime 和 48 帧视觉复核，记录生成失败与分件风格边界。

- 对去色拆件图执行 imagegen 材质重绘，移除布料/裤腿/靴子上的肤色关节圆盘，新增相同骨架动作的 `demo:clean-sheet` 对照和 48 帧验证。
- 拆件技能改为逐关节声明连续材质与不透明重叠，区分辅助标记和合法护甲结构；保留肘膝分件线及简化动作的品质限制。

- 用选定的纯品红去色 14 部件图生成独立 `sheet-adventurer` 样例，保留原始图、去色记录、配准点和制作规格。
- 新增 `demo:sheet` 重建入口，重新配准部件比例、足部 IK、接触轨迹及远臂遮挡，交付待机、走跑和出拳。
- 官方 runtime 与四动作 48 帧浏览器检查通过；源图圆形关节标记可见，视觉结果保留为未批准测试候选。

## 0.3.1 — 2026-09-08

- 修正横版人形远手出现在两腿之间的问题：整组远臂移至腿靴之后，并补充 12 条跨部件遮挡规则；撤回 v3 的遗漏遮挡批准。
- 实测 imagegen 直接生成 14 部件拆件图和参考图复用编辑，两张均因伪透明被 ingest 拒绝；保留提示词、图像与可复查 alpha 检查脚本，不混入正式素材。
- 研究 ImageGen 文字模板与 PNG 参考模板的不同能力，技能新增整套拆件草稿路径及生产门槛；不把 PNG 模板等同于原生 Spine 图层/骨骼输出。

## 0.3.0 — 2026-09-08

- 研究锁定快照的 Spineboy、Hero、Raptor 原始分件、骨骼、约束、附件与绘制顺序时间轴，新增可复查的研究脚本和对照图。
- 新增 anatomy 侧别/配对/可见面、重复像素检查及部件级 layerRules，接入 prepare、compile、validate 和 CLI rig；不将 near/far 或朝向当作解剖学左右。
- 新增保持配准的机械腕踝分件工具；人形示例重生左侧远肢、独立手脚附件及脚部 IK、修正肩头衣摆层级和跑步重心。
- 修正分件后二次 alpha 裁剪造成的不对称部件居中偏移；加入实际导入后逐像素复原回归。网格使用透明轮廓占用格完整三角化，修复轮廓中点过滤产生的锯齿缺口，并避免跨凹陷的细长三角形翻折。
- 浏览器 QA 增加放大细节帧；侧向人形验收必须复核左右身份、遮挡与关节，并绑定解剖元数据和层级上下文。撤回旧版过宽的视觉批准，保留候选对照。

## 0.2.0 — 2026-09-08

- 新增角色形态、横版游戏用途、半侧身默认视角、朝向、镜像策略与地面锚点；prepare 输出实际生图约束。
- 通过 motionModel 声明腿、翅膀、触肢和轴向骨链，新增四足/多足步态、软体跳跃、有翼和蛇形运动；非人形缺失能力不回退到人形模板。
- 检查动画实际使用附件的视角；非人形和横版视觉复核同时绑定形态、视角、朝向及任务上下文。
- 加入移动地面接触轨迹，并使用官方 runtime 实际动画相位修复循环边界浮点误差导致的误报；支持左右朝向及旋转根骨骼。
- 新增关节权重过渡宽度和半侧身四足苔藓野猪五动作样例，保留透明度失败素材与绑定修复候选。
- 技能更新支持验证工作区归属和备份已有版本。

## 0.1.0 — 2026-09-08

- 新建独立 Node.js/TypeScript 实现与 img2spine Codex 技能，未复用三个参考 MCP 的实现。
- 引入四类制作规格、素材登记与配准、关节到局部骨架转换、region/加权 mesh、IK、动作编译与 straight alpha atlas。
- 锁定官方 Spine runtime 4.3 提交，使用真实 reader 和 WebGL 播放器验证最终资源。
- 增加结构、连续动作、关节范围、接触、循环衔接、资源哈希和视觉复核的分层报告及有界修复记录。
- 使用内置 imagegen 生成母图、部件、闭眼附件及多视角素材；保留生成失败候选和提示词。修正伪透明图、宽透明光晕造成的比例问题，以及肘膝权重过渡导致的网格翻折。
- 交付机器人七动作样例、连续采样图、桌面和窄屏浏览器验收。多视角样例为离散插画切换，未将其描述为平滑三维转身。

## 2026-09-09 — 头颈层级与母图对比验收

- 侦察员前领独立为 region，后领位于头颈之后，修正整块躯干遮挡后颈的问题；对比母图后缩小并重定位头部。
- 新增全局母图配准元数据、并排和叠加证据，以及实际官方 runtime setup 帧对比。
- 新编译的计划项目或带母图项目，必须复核当前母图对比证据；缺失或过期保留待视觉检查。
- 保留旧候选和旧验收遗漏记录；复用现有美术，无新增 imagegen 调用。

## 2026-09-10 — Curated open-source release / 精选开源发布

- Preserve the existing upstream MIT history; reference the pinned official Spine runtime exclusively as a Git submodule.
- Publish portable robot, moss-boar and repaired mountain-scout inputs. Demos write only to local output, and the scout no longer requires historical candidates.
- Add Chinese/English README, generated-character gallery, provenance and third-party license boundaries. Keep full historical experiments locally, outside the public tree.
- Add cache initialization for standalone test files and lock Sharp to 0.35.4 to address published upstream decoder advisories.
