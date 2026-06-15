export function getAiActionLabel(type: string): string {
  return ({
    create_calendar_event: "日程 / 课程",
    create_homework_task: "作业任务",
    create_request: "孩子申请",
    create_payment: "付款项目",
    create_meal_or_recipe: "菜单 / 菜谱",
    create_learning_record: "课程笔记",
  } as Record<string, string>)[type] ?? type;
}

export function getAiIntentLabel(intent: string): string {
  return ({
    create_calendar_event: "创建日程",
    create_homework_task: "创建作业",
    create_request: "创建申请",
    create_payment: "创建付款",
    create_meal_or_recipe: "创建菜单",
    create_learning_record: "创建课程笔记",
    multi_action: "多个动作",
    ask_clarifying_question: "需要补充信息",
    unknown: "未识别",
  } as Record<string, string>)[intent] ?? intent;
}

export function getFieldLabel(key: string): string {
  return ({
    child_name: "孩子 / 成员",
    title: "标题",
    detail: "详情",
    event_type: "日程类型",
    request_type: "申请类型",
    start_date: "开始日期",
    end_date: "结束日期",
    start_time: "开始时间",
    end_time: "结束时间",
    weekday: "每周几",
    recurrence_rule: "重复规则",
    place_name: "地点",
    teacher_name: "老师 / 教练",
    due_date: "截止日期",
    amount: "金额",
    currency: "货币",
    pay_to: "收款方",
    reference: "Reference",
    meal_type: "餐食类型",
    course_name: "课程名",
    lesson_title: "课程标题",
    child_comment: "孩子点评",
    parent_comment: "家长点评",
    teacher_feedback: "老师反馈",
    raw_note: "原始备注",
  } as Record<string, string>)[key] ?? key;
}

export function getActionMainFields(type: string): string[] {
  switch (type) {
    case "create_calendar_event":
      return ["child_name", "title", "start_date", "start_time", "end_time", "weekday", "place_name", "teacher_name", "recurrence_rule"];
    case "create_homework_task":
      return ["child_name", "title", "due_date", "start_time", "detail"];
    case "create_request":
      return ["child_name", "title", "request_type", "detail"];
    case "create_payment":
      return ["child_name", "title", "amount", "currency", "due_date", "pay_to", "reference"];
    case "create_meal_or_recipe":
      return ["title", "meal_type", "start_date", "detail"];
    case "create_learning_record":
      return ["child_name", "course_name", "lesson_title", "start_date", "child_comment", "parent_comment", "teacher_feedback"];
    default:
      return ["child_name", "title", "detail"];
  }
}

export function getRequiredFieldsForAction(type: string): string[] {
  switch (type) {
    case "create_calendar_event":
      return ["title", "start_date", "start_time"];
    case "create_homework_task":
    case "create_request":
    case "create_meal_or_recipe":
      return ["title"];
    case "create_payment":
      return ["title", "amount"];
    case "create_learning_record":
      return ["lesson_title"];
    default:
      return [];
  }
}

export function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (typeof value === "number" && Number.isNaN(value)) return true;
  return false;
}
