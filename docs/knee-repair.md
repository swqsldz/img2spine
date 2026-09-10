> Historical experiment: some inputs and commands below are not included in this curated release. See [current entry points](../README.md) and [research scope](HISTORICAL-RESEARCH.md).
> 历史试验：部分输入和旧命令未随精选版本发布，当前入口以根 README 为准。

# 膝关节连续贴图与加权网格修订

基线 `output/joint-fit/candidate-02` 使用独立大腿、小腿 region，两个附件的膝部轮廓重复，在弯曲时形成椭圆膝盖与后方鼓包。第一候选 `output/knee-repair/candidate-01` 将四片改为共享同一骨链权重带的 mesh，数值通过，但仍保留重复轮廓，因此未作为最终结果。

第二候选 `output/knee-repair/candidate-02` 使用完整髋到踝的两张连续贴图。先按原绑定姿势机械复原左右腿，制作带已知坐标映射的 1254×1254 双栏参考图，再由内置 imagegen 只修复中部重复膝盖，补成正常裤料褶皱。保留近侧口袋/扣件和远侧内表面的区别。图片、提示词、双栏配准记录在 `output/knee-repair/source/`。

品红背景去色沿用自动边缘取色、软 alpha、12/220 阈值和 despill。导入时按实测 alpha 紧裁，并用参考图布局映射恢复原画布位置；没有通过重新居中调整腿的位置。

两张连续腿贴图分别绑定自己的大腿、小腿骨骼，网格间距 7 像素，局部权重过渡参数 0.42。保持脚掌 region、原四个 IK、髋膝骨架、头颈/肘部修订以及全部四个动作轨道。移除两条小腿的独立绘制插槽，但保留小腿骨骼。最终为 19 根骨骼、12 个插槽、2 个加权 mesh。

```powershell
npm run demo:knees
npm run qa -- output/knee-repair/candidate-02
npm run spine -- preview output/knee-repair/candidate-02 --port 4181
```

需要重建第一候选可显式执行 `npm run demo:knees -- output/knee-repair/candidate-01 --segmented`。它是失败对照，不应覆盖第二候选的视觉批准。

已检查待机、行走、跑步、出拳共 48 张放大 WebGL 采样帧。膝部重复轮廓消失，当前动作范围内未发现膝缝或网格翻折。官方 runtime 三轮循环接缝为 0，三角形翻折计数为 0。行走接触最大误差约 1.915 像素，在原容差内；这不等于所有游戏速度下绝对无脚滑。

验收范围限于该固定视角四动作。裤料纹理仍会随线性蒙皮弯曲，极深蹲、跪地或新的膝部受力动作需单独检查体积与褶皱；未验证 Unity/Spine 编辑器或设备运行。
