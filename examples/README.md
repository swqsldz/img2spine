# Selected examples / 精选样例

These examples reproduce saved artwork without calling imagegen. Run from the repository root after installing dependencies and initializing the runtime submodule:

| Example / 示例              | Command / 命令          | Output / 输出                  | Current limitation / 当前限制                                                                                                                                                     |
| --------------------------- | ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Robot / 机器人              | `npm run demo`          | `output/robot/export`          | Front-facing prototype, deliberately reused symmetric limbs; turn uses discrete alternate illustrations, not continuous perspective. / 正面原型复用对称肢体，转身为离散插画切换。 |
| Moss boar / 苔藓野猪        | `npm run demo:creature` | `output/moss-boar/export`      | Shared leg illustration and stylized gait; source master has glow and different silhouette. / 复用腿部插画、风格化步态，母图含光晕且轮廓存在差异。                                |
| Mountain scout / 山地侦察员 | `npm run demo:scout`    | `output/mountain-scout/export` | Latest selected head/collar repair, four fixed-view actions; rotating sleeves still look like cutouts. / 最新头颈层级修正、四个固定视角动作，转臂仍有分件观感。                   |

`npm run qa -- <output>` captures the official WebGL frames and master comparison. Numerical and browser checks do not automatically approve visual quality. Rebuilds do not copy old approval reports. The original master, prompts and selected inputs are retained; full historical failures and intermediate outputs are intentionally not distributed.

`npm run qa -- <输出目录>` 生成官方 WebGL 帧和母图对比。数值、浏览器通过不自动批准美术效果；重建不复制旧视觉批准。保留母图、提示词和选定输入，不分发完整历史失败候选。

The scout input contains final normalized and registered cutouts, with their bind placement and trim metadata. Its demo copies these inputs into a working directory and compiles them directly, preserving the accepted registration instead of trimming/recentering them again. New generated artwork still goes through the normal ingest workflow.

侦察员发布输入是最终归一、配准后的拆件，包含绑定位置和裁剪元数据；演示保留该配准直接编译。新生图仍需要正常 ingest 流程。素材许可见根目录 THIRD_PARTY_NOTICES.md。
