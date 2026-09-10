> Historical experiment: some inputs and commands below are not included in this curated release. See [current entry points](../README.md) and [research scope](HISTORICAL-RESEARCH.md).
> 历史试验：部分输入和旧命令未随精选版本发布，当前入口以根 README 为准。

# 官方示例拆分与动画研究：左右肢体和层级修正

后续用户复核发现 v3 仍遗漏远手与远腿的遮挡关系，已在 v4 修正；最新输出与 ImageGen 拆件模板试验见 [后续研究](imagegen-parts-sheet-study.md)。下文保留本轮官方示例研究与当时的验证记录，v3 的视觉批准已撤回。

依据本地锁定快照 `4309c05c287d3f15da778e68f5d2a483fe10a6a3` 的原始 images 与 export JSON。参考目录只读，未复制其角色美术到生成角色，也未安装或调用 Spine MCP。`node scripts/research-examples.ts` 可重建研究清单和配对素材对照图。

## 官方示例如何做

| 示例     | 拆分证据                                                                                          | 绑定与动画证据                                                                                                 | 对当前流程的启示                                                                           |
| -------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Spineboy | front/rear 的 upper-arm、bracer、thigh、shin、foot 为不同 PNG；前后小腿外侧护甲和内侧表面明显不同 | 67 骨骼；两骨 leg IK 后还有单骨 foot IK；walk/run 各有 31/30 条骨骼轨道                                        | 左右身份与可见面要单独设计；脚朝向不应简单跟随小腿                                         |
| Hero     | hand1/hand2、forearm1/forearm2、foot1/foot2 轮廓和朝向不同                                        | 44 骨骼；手、脚独立；foot 在 shin 前绘制，body、mantles、head、forearm 等穿插在顺序表中                        | 衣物与接缝按部件控制，不能把整只近侧手臂都放到头前面                                       |
| Raptor   | front/back arm、前后腿等有独立部件；一张连续腿网格可绑定多个骨骼                                  | 76 骨骼；腿与脚分阶段 IK；连接处权重联系 hip/head；gun-grab 切换手和枪附件；jump/roar 调整 horn/thigh 绘制顺序 | 连续 mesh 与拆件都可以，选择依据形变与遮挡；换握法用附件切换，真实深度变化才需要层级关键帧 |

本地文件：`reference/spine-runtimes/examples/{spineboy,hero,raptor}/images/` 和各自 `export/*-pro.json`。研究导出：`output/research-official/examples-analysis.json`、`spineboy-parts.png`、`hero-parts.png`。

Spineboy/Hero 在这份快照里没有动画 drawOrder 键，已有 setup 顺序足以表达这些动作。Raptor 有局部换序。不能从“左右腿交替”推导出“每半周期交换近远腿层级”。官方关于 hip、leg/foot IK 顺序和附件切换的解释见 [Spineboy](https://en.esotericsoftware.com/spine-examples-spineboy) 和 [Raptor](https://en.esotericsoftware.com/spine-examples-raptor)。格式仍以锁定本地 JSON 为准。

## 当前角色的问题

旧输出 `output/side-adventurer/export/bundle.json` 中 upperNear/upperFar、lowerNear/lowerFar、legNear/legFar 各自有相同素材 SHA256。改变尺寸和位置仅改变投影，不能将手背改成掌心、外侧口袋改成内侧裤腿。depth 和 facing 没有表达解剖学左右。

旧版手与前臂、脚与小腿合在一个附件内，限制腕踝与遮挡控制；上臂在 head 之后绘制，抬臂会盖到头颈前；脚上的 IK 接触点通过不代表整只靴子在地面上。此前的演示级视觉批准遗漏了这些问题，应撤回，不作为本次修正版的证据。

## 落地改动

- 增加 anatomical side、pair、surface 与有理由的 symmetry exception；重复像素通过哈希及 sourceRect 检出。prepare 报问题，compile 阻止错误配对；明确不能自动识别新图中的错误拇指。
- 增加部件级 layerRules，检查 setup 及每个动作换序键，支持按动作限定规则；CLI rig 保留规则。
- 新增保持配准坐标的机械分件工具 partitionAsset，用于腕踝等已识别位置，保留原画，不生成缺失遮挡区。
- 修复分件后再次 alpha 裁剪造成的居中偏移：先取每个分件的紧致边界，将对应裁剪偏移计入 placement；用不对称合成素材验证导入后逐像素复原一致。
- 放大帧暴露出轮廓网格过滤误删衣物边缘的问题。改为保留所有被 alpha 占用的完整网格单元，透明像素维持轮廓，避免稀疏三角形过滤的锯齿缺口及跨凹陷细长三角形。这个实现偏向稳定覆盖，尚非最少顶点的轮廓优化器。
- 重生左侧远上臂、掌心前臂/握拳和内侧腿靴；近侧保留原右侧美术。手、脚分离为独立附件，脚增加单骨 IK；脚目标跟随步态位移，身体保持独立运动。
- 重排肩、头、手、衣摆、腿和脚的层次。跑步保持原步幅，降低重心以解决 IK 可达范围超差。
- 浏览器 QA 同时输出固定画幅 sheet 和放大的 details；视觉验收增加左右身份、遮挡和关节三项明确复核，并绑定素材身份与层级上下文。旧批准自动不再满足新标准。

修正版默认在 `output/side-adventurer/revised-v3/`，旧版本及失败候选保留供对照。四个动作通过锁定 runtime 采样；待机、走、跑各三周期，出拳单次，三角形翻折采样为零，最大支撑点误差约 0.064 像素。浏览器每动作输出 12 帧，共 48 帧；27 项自动测试及 TypeScript 检查通过。技术报告、视觉复核与修复轨迹保存在修正版目录。

它仍是固定右向半侧身插画骨骼动画，能看出分件肘部和靴子硬质连接，跑步节奏仍偏演示。未实现完整脚趾滚动、转身透视重建或多握法附件库，未验证 Unity/编辑器导入；本次不宣称达到官方示例全部动作表现。
