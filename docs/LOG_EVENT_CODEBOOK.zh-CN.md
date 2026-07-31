# Mimosa 事件日志数据字典

| 事件 | 含义 |
|---|---|
| `meeting_connected` | 本机成功加入会议 |
| `silence_candidate_created` | 技术协调端创建候选沉默 |
| `silence_candidate_received` | 本机收到候选沉默 |
| `silence_candidate_cancelled` | 候选因新发言、无人认领等退出 |
| `local_moment_role_selected` | 本机选择等待、可能回应或不参与 |
| `waiting_role_claim_sent` | 发送等待者认领 |
| `waiting_role_claim_accepted` | 等待者认领被接受 |
| `silent_moment_created` | 手动建立正式轮次 |
| `silent_moment_received` | 收到正式轮次 |
| `private_cue_sent` | 回应者发出匿名需要 |
| `private_cue_received` | 等待者收到匿名需要 |
| `environment_received` | 收到共享环境变化 |
| `plant_closing_started` | 无回应后叶片开始合拢 |
| `care_action_sent` | 等待者发出关怀动作 |
| `care_action_received` | 其他成员收到关怀动作 |
| `speech_recovery_suggested` | 讨论可能恢复，等待确认 |
| `deferred_question_resumed` | 暂存问题被编辑并带回 |
| `deferred_question_removed` | 当前成员确认将失效问题移出共享暂存区 |
| `deferred_question_removed_received` | 客户端收到并应用共享暂存删除消息 |
| `silent_moment_ended` | 本轮结束或暂存 |
| `speech_sensor_unavailable` | 本地活动检测异常 |
| `public_snapshot_restored` | 晚加入或重连后恢复公共状态 |
| `observer_detected` | 识别到研究观察端并将其排除出参与人数与沉默协调 |
| `experiment_started` / `experiment_ended` | 参与者收到研究者的实验边界标记 |
| `researcher_experiment_marker` | 观察端发送实验开始或结束标记 |
| `researcher_cancelled_moment` | 观察端撤销一次误触发 |
| `researcher_cancelled_moment_received` | 参与者收到误触发撤销并清理当前轮次 |
| `researcher_requested_logs` | 观察端向所有在线参与者请求本地匿名日志 |
| `study_log_shared_with_researcher` | 参与者向观察端发送日志分片 |
| `researcher_downloaded_aggregated_logs` | 观察端下载聚合日志 |

同一 `momentId` 可派生角色认领时长、首个回应时长、关怀行动时长、轮次总时长、回应数量和类别分布。事件频率不能直接解释为个人贡献或关怀水平。
