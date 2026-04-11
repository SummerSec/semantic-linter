---
article: docs/别让大模型"想太多"：SKILL开发中的语义陷阱与抗幻觉设计.md
preset: tech-explainer
type: infographic
style: blueprint
density: rich
model: Doubao-seedream-5-0
output_dir: docs/pic
image_count: 18
created_at: 2026-04-07
---

# 配图大纲 - 语义陷阱与抗幻觉设计

统一风格：科技蓝光蓝图风格，深蓝背景(#0a1628)，蓝色发光线条，数据可视化风格

## 01 - 实验场景：双模型对比测试
**Position**: 引言部分
**Purpose**: 展示两个AI模型("漏洞"vs"风险")的对比测试场景
**Type**: scene
**Aspect**: 16:9
**Filename**: 01-experiment-setup.png

## 02 - 准确率对比仪表盘
**Position**: 引言部分，实验结果展示
**Purpose**: 可视化89.3% vs 62.1%的准确率对比
**Type**: infographic
**Aspect**: 16:9
**Filename**: 02-accuracy-dashboard.png

## 03 - 两份审计报告对比
**Position**: 第一章 1.2节
**Purpose**: 左右对比"漏洞"版(精准)vs"风险"版(发散)的判定结果
**Type**: comparison
**Aspect**: 16:9
**Filename**: 03-report-comparison.png

## 04 - 6步结构化工作流管道
**Position**: 第二章 2.1节
**Purpose**: 展示STEP 1-6的完整工作流程
**Type**: flowchart
**Aspect**: 16:9
**Filename**: 04-six-step-workflow.png

## 05 - 校验-执行-验证循环
**Position**: 第二章 2.2节
**Purpose**: 展示每个STEP内部的三阶段机制
**Type**: flowchart
**Aspect**: 16:9
**Filename**: 05-validation-cycle.png

## 06 - 定义文件结构
**Position**: 第二章 2.3节
**Purpose**: 展示vul_definitions.md的结构和关键信息
**Type**: framework
**Aspect**: 4:3
**Filename**: 06-definition-structure.png

## 07 - 领域定制工具链架构
**Position**: 第二章 2.4节
**Purpose**: 展示code-search-tool的专业化设计
**Type**: framework
**Aspect**: 16:9
**Filename**: 07-custom-toolchain.png

## 08 - 四大核心支柱
**Position**: 第二章 2.5节
**Purpose**: 展示构建高质量Skill的四大支柱
**Type**: framework
**Aspect**: 1:1
**Filename**: 08-four-pillars.png

## 09 - "漏洞"的语义空间
**Position**: 第三章 3.2节
**Purpose**: 展示"漏洞"词汇的紧凑聚焦语义网络
**Type**: infographic
**Aspect**: 16:9
**Filename**: 09-semantic-vulnerability.png

## 10 - "风险"的语义空间
**Position**: 第三章 3.2节
**Purpose**: 展示"风险"词汇的发散扩张语义网络
**Type**: infographic
**Aspect**: 16:9
**Filename**: 10-semantic-risk.png

## 11 - 错误模式饼图
**Position**: 第三章 3.3节
**Purpose**: 展示三种错误类型的占比(范围溢出68%、等级虚高24%、逻辑偏移8%)
**Type**: infographic
**Aspect**: 1:1
**Filename**: 11-error-patterns.png

## 12 - 仓库盘点实习生类比
**Position**: 第三章 3.4节
**Purpose**: 可视化"破损vs问题"的检查清单类比
**Type**: scene
**Aspect**: 16:9
**Filename**: 12-warehouse-analogy.png

## 13 - 语义敏感度矩阵
**Position**: 第三章 3.5节
**Purpose**: 展示LLM语义敏感度矩阵，安全区vs危险区
**Type**: framework
**Aspect**: 4:3
**Filename**: 13-semantic-matrix.png

## 14 - 围墙与砖块类比
**Position**: 第三章 3.6节
**Purpose**: 展示语义膨胀如何撑裂约束边界
**Type**: scene
**Aspect**: 16:9
**Filename**: 14-expanding-bricks.png

## 15 - 三种测试方法
**Position**: 第四章 4.2节
**Purpose**: 展示排除测试、最小对比测试、换词对照测试
**Type**: flowchart
**Aspect**: 16:9
**Filename**: 15-testing-methods.png

## 16 - 边界锚定策略
**Position**: 第四章 4.3节
**Purpose**: 展示前置否定清单、输出格式硬约束、反例覆盖三种策略
**Type**: framework
**Aspect**: 16:9
**Filename**: 16-anchoring-strategies.png

## 17 - 语义陷阱检测器工作流
**Position**: 第五章
**Purpose**: 展示检测器的四步检测流程
**Type**: flowchart
**Aspect**: 16:9
**Filename**: 17-detector-workflow.png

## 18 - Skill开发CI/CD流程
**Position**: 第五章 5.5节
**Purpose**: 展示语义检测如何嵌入Skill开发流程
**Type**: flowchart
**Aspect**: 16:9
**Filename**: 18-cicd-pipeline.png
