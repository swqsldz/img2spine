> Historical experiment: some inputs and commands below are not included in this curated release. See [current entry points](../README.md) and [research scope](HISTORICAL-RESEARCH.md).
> 历史试验：部分输入和旧命令未随精选版本发布，当前入口以根 README 为准。

# 肘部、髋部、颈部连接修订

基线是 `output/joint-cleanup/candidate-01`，本次输出为 `output/joint-fit/candidate-02`。保留旧候选及生成图，没有覆盖之前的播放资源。

## 修复内容

- 肘部：原前臂裸露圆头与上臂轮廓叠在一起，且上臂的配准点位于圆头中心上方。由内置 imagegen 将前臂近端改为护腕连接端，上臂肘点重新标在源图 y=292，连接处藏于护腕下；保留上下臂、手掌独立控制。
- 髋部：此前沿用其他素材的骨架坐标，与当前躯干不吻合。近/远髋分别改为画布 `(490,391)` / `(513,391)`，膝部也按比例重新定位；重新生成父子局部变换和部件配准。移除躯干衣摆下悬出的棕色圆头，裤腿接到衣摆后方。
- 颈部：移除躯干领口的重复截断脖子，头图提供完整颈部，衣领从前方覆盖。第一次编辑误删胸前皮肤，第二次恢复；运行复核发现领口侧面露底，第三次仅扩展头图下颈部的隐藏皮肤。第三次整图的其他部件未采用，避免额外画风漂移。

最终素材：头部来自 `source/parts-fit-v3.png`，其余十三件来自 `source/parts-fit-v2.png`。三个原始生成图、提示词和去色图都在 `output/joint-fit/source/`。品红去色使用已有工具，自动采样背景色，软 alpha，阈值 12/220，despill。关节与配准记录分别保存于 `joints.json` 和 `joint-registration.json`。

```powershell
npm run demo:joint-fit
npm run qa -- output/joint-fit/candidate-02
npm run spine -- preview output/joint-fit/candidate-02 --port 4180
```

## 验证边界

本轮检查了官方 reader 求值、固定步长三轮循环、脚部目标接触和四动作 48 张放大采样帧；保留待机、行走、跑步和出拳，未缩减动作范围。足部目标、四条 IK 和动作轨道保留，绑定姿势改变后重新检查可达性。

当前采样中肘部重复圆头、髋部悬接与领口露底已修正。颈部仍存在轻微绘画明暗差异，护腕和膝部仍为刚性分件。视觉批准仅针对这个固定视角四动作示例；不等同于无缝柔体蒙皮、所有极限动作或 Unity/编辑器验收。

后续制作应先将关节定位到实际素材的解剖转折处，给每个连接指定遮挡方，按运动范围准备隐藏区域；不要将上一张角色的骨架位置直接当作新素材的最终配准。
