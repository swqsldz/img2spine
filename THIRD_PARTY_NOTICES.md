# Third-party notices / 第三方声明

## Project code / 项目代码

Original img2spine code and documentation use the root MIT [LICENSE](LICENSE), copyright (c) 2026 swqsldz. This does not relicense dependencies or official Spine content.

img2spine 自有代码与文档沿用根目录 MIT 许可证，不改变依赖项或 Spine 官方内容的许可证。

## Spine runtime

The official runtime is an external Git submodule at `reference/spine-runtimes`, pinned to `4309c05c287d3f15da778e68f5d2a483fe10a6a3`. The parent repository tracks only the submodule pointer and configuration, not runtime source, official example artwork or built runtime bundles.

Spine runtime 仅以 Git submodule 引用。主仓库不包含官方源码、美术或编译后的 runtime。使用者初始化 submodule 后在本地构建；本地构建和导出保留官方许可声明。

Spine Runtimes are copyright Esoteric Software LLC and governed by the [Spine Runtimes License Agreement](https://en.esotericsoftware.com/spine-runtimes-license), which refers to the [Spine Editor License Agreement](https://en.esotericsoftware.com/spine-editor-license). The project MIT license does not remove their licensing requirements. Not invoking the Spine Editor during generation does not waive runtime license conditions. Review the official terms for your use and distribution.

Spine Runtimes 使用官方自身许可，涉及 Spine Editor 许可条件。制作流程不调用编辑器，不意味着使用和分发 runtime 可以免除许可要求；请按官方条款使用和分发。

## Generated examples / 生成样例

Published artwork under `examples/robot`, `examples/moss-boar`, `examples/mountain-scout` and derived images under `docs/images` was generated with Codex's built-in imagegen and processed for this project. It is not Esoteric Software's official artwork. Prompts and generation records are retained with the examples. Historical generation IDs are provenance identifiers, not downloadable paths.

To the extent the contributor holds applicable rights, this example artwork is provided under the same MIT terms. No exclusive ownership, copyright eligibility or third-party clearance of AI-generated material is represented or warranted. The MIT warranty disclaimer applies.

这些示例是项目生成素材，并非 Spine 官方示例美术。在贡献者拥有相应权利的范围内按 MIT 提供；不保证 AI 生成内容的专有权、版权资格或第三方权利审查。历史生成 ID 用于追溯，不是文件下载地址。

## Packages / 软件依赖

Runtime build inputs come from the official submodule. Other packages are installed through npm using `package-lock.json`; their respective licenses remain applicable (including Sharp and its bundled image libraries). No node_modules or compiled dependencies are committed. Inspect installed package license files when redistributing a built product.
