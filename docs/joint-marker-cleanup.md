> Historical experiment: some inputs and commands below are not included in this curated release. See [current entry points](../README.md) and [research scope](HISTORICAL-RESEARCH.md).
> 历史试验：部分输入和旧命令未随精选版本发布，当前入口以根 README 为准。

# 去除关节圆盘：素材修复与官方示例对照

本次使用内置 imagegen 对用户选定的 `examples/sheet-adventurer/parts-magenta.png` 做局部材质重绘，保存为 `output/joint-cleanup/source/parts-clean-v1-magenta.png`；随后沿用已授权的品红去色流程，得到 `parts-clean-v1.png`。未修改原版本、官方素材或其 runtime。完整提示词在 `output/joint-cleanup/source/prompt-v1.txt`，生成记录、alpha 统计和参数在同目录 `generation.json`。

## 官方素材揭示的问题

已查看锁定快照 Hero 与 Spineboy 的原始部件对照图：`output/research-official/hero-parts.png` 和 `spineboy-parts.png`。Hero 的上下肢末端延续本体材质；Spineboy 的部分圆形护甲是角色设计，不能把所有圆形结构视为错误。当前冒险者图在布料、裤子和靴子末端统一画了带黑边的肤色圆盘，属于不合服装逻辑的标记。

官方拆件思路可用于生成要求，但完整效果还依赖绑定、遮挡和动作。例如 [Spineboy 官方说明](https://en.esotericsoftware.com/spine-examples-spineboy) 展示了腿部双骨 IK、足部单骨 IK、独立髋部及脚尖控制。当前样例已有腿/足 IK，尚未实现同等细致的脚尖滚动控制；不能把去除纹理圆盘等同于完成这些能力。

## 更新的生成要求

| 区域 | 修复要求 | 本次结果 |
| --- | --- | --- |
| 肩部 | 青色袖子/衣料连续延伸，移除肤色圆盘及内圈描边 | 明显圆盘消失 |
| 裸露肘部 | 同肤色连续明暗，保留实体重叠面积 | 色块标记消失，旋转时仍有分件轮廓线 |
| 裤腿与膝部 | 棕色裤料覆盖原肤色圆盘 | 已覆盖，膝部仍是刚性分件 |
| 踝与靴口 | 连续皮革，保持靴筒遮住脚附件根部 | 肤色标记消失 |
| 关节坐标 | 只写入关节配准数据 | 不要求 imagegen 绘制任何辅助点 |

关键句：`Repaint pivot disks and their internal rings as uninterrupted matching material. Preserve opaque overlap footprints; no holes, no visible cross-section ellipses, no guide marks.` 还必须逐部件指定 skin / fabric / leather。单独写“Spine 拆件”“圆形重叠”容易引入木偶关节造型。

实际运行中应依次检查材质、遮挡和形变。先确认部件不含错误标记；再用袖口、护腕、靴口隐藏裁切边；对于连续皮肤或柔软衣物，再考虑局部网格和相邻骨权重，保留硬质靴子/饰品的刚性。不能用透明擦除或全局去肤色代替材质补全。

## 可复查的本次实验

```powershell
npm run demo:clean-sheet
npm run qa -- output/joint-cleanup/candidate-01
npm run spine -- preview output/joint-cleanup/candidate-01 --port 4179
```

14 个附件全部来自新图。重新测量 alpha 裁切边界，沿用已检查的同布局关节对应点，并保存新的中间规格。骨架、IK 和待机/走/跑/出拳动作与基线保持一致，用于隔离材质变化。所有附件仍为 region，本次没有新增 mesh、权重或动作改善。

官方 reader 数值求值、三轮循环检查与 WebGL 四动作共 48 帧采样通过；已查看四组放大帧。明显肤色圆盘已移除，左右表面和远臂位于双腿之后的关系保留。仍能看到肘部重叠描边、膝部刚性切块、简化脚部滚动；因此只作为关节标记修复成功的对照，不能宣称达到官方样例整体动画品质。资源包保留详细视觉观察和后续改进项。

后续新角色应先确定母图和运动范围，再安排藏于衣物接缝的拆分、连续重叠材质及局部蒙皮。当前带圆盘的旧 PNG 不应继续充当“已批准模板”；本次新图也须按具体动作验收，不能只凭模板引用保证结果。
