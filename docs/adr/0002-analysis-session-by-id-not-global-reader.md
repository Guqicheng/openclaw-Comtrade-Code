# 分析会话使用 analysis_id，禁止模块级全局 reader

## 状态

accepted

## 决策

上传接口返回 `analysis_id`；`analysis_routes` 通过 ID 从会话缓存取 reader，不再使用模块级 `_current_reader`。

## 原因

Flask 默认多线程下全局变量会被并发上传覆盖，导致 RMS/FFT 等返回错误通道数据且难以排查。Flask `g` 仅绑定单次请求，不适合跨请求分析流程。

## 后果

- 需实现缓存淘汰策略（LRU 或 TTL）  
- 前端上传成功后保存 `analysis_id` 并在分析 API 中传递  
- 单用户本地场景也受益，行为可预期
