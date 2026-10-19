import { AuthModule } from '../modules/auth/auth.module.js';
import { RbacModule } from '../modules/rbac/rbac.module.js';
import { CoachingModule } from '../modules/coaching/coaching.module.js';
import { StudentModule } from '../modules/students/student.module.js';
import { ParentModule } from '../modules/parents/parent.module.js';
import { TeacherModule } from '../modules/teachers/teacher.module.js';
import { BatchModule } from '../modules/batches/batch.module.js';
import { AttendanceModule } from '../modules/attendance/attendance.module.js';
import { TestModule } from '../modules/tests/test.module.js';
import { HomeworkModule } from '../modules/homework/homework.module.js';
import { NotificationModule } from '../modules/notifications/notification.module.js';
import { TimelineModule } from '../modules/timeline/timeline.module.js';
import { AuditModule } from '../modules/audit/audit.module.js';
import { FeeModule } from '../modules/fees/fee.module.js';
import { SalaryModule } from '../modules/salary/salary.module.js';
import { ExpenseModule } from '../modules/expenses/expense.module.js';
import { BillingModule } from '../modules/billing/billing.module.js';
import { NoticeModule } from '../modules/notice-board/notice.module.js';
import { SettingsModule } from '../modules/settings/settings.module.js';
import { ReportModule } from '../modules/reports/report.module.js';
import { DashboardModule } from '../modules/dashboard/dashboard.module.js';
import { ImportModule } from '../modules/import/import.module.js';
import { WhatsAppAssistantModule } from '../modules/whatsapp-assistant/whatsapp-assistant.module.js';
import { RiskEngineModule } from '../modules/risk-engine/risk-engine.module.js';
import { AiModule } from '../modules/ai/ai.module.js';
import { OpsModule } from '../modules/ops/ops.module.js';
import { PaperModule } from '../modules/papers/paper.module.js';
import { StorageModule } from '../modules/storage/storage.module.js';
import { workerRegistry } from '../workers/worker.registry.js';
import { eventBus } from '../events/event-bus.js';
import { PrismaEventStore } from '../events/event-store.js';

function createModules() {
  // Durable delivery: every event is recorded and failed handlers are retried by the relay
  eventBus.useStore(new PrismaEventStore());

  // ORDER MATTERS: modules register their event subscribers here, and handler names used for
  // retries come from registration order. The API and the worker process both call this, so
  // both see identical names. Append new modules at the end.
  const storage = StorageModule.init();

  const auth = AuthModule.init();
  const rbac = RbacModule.init();
  const coaching = CoachingModule.init();

  const student = StudentModule.init();
  const parent = ParentModule.init();
  const teacher = TeacherModule.init();
  const batch = BatchModule.init();
  const attendance = AttendanceModule.init();
  const test = TestModule.init();
  const homework = HomeworkModule.init();

  const ai = AiModule.init();
  const whatsappAssistant = WhatsAppAssistantModule.init({
    knowledgeBaseService: ai.knowledgeBaseService,
    aiService: ai.service,
  });
  workerRegistry.setWhatsAppAssistantService(whatsappAssistant.service);
  const riskEngine = RiskEngineModule.init();

  const notification = NotificationModule.init({ assistantService: whatsappAssistant.service });
  const timeline = TimelineModule.init();
  const audit = AuditModule.init();

  const fee = FeeModule.init();
  const salary = SalaryModule.init();
  const expense = ExpenseModule.init();
  const billing = BillingModule.init();

  const notice = NoticeModule.init();
  const settings = SettingsModule.init();
  const report = ReportModule.init();
  const dashboard = DashboardModule.init();
  const importModule = ImportModule.init();
  const ops = OpsModule.init();
  const papers = PaperModule.init({
    aiService: ai.service,
    homeworkService: homework.service,
    storageService: storage.storageService,
  });

  return {
    storage,
    auth,
    rbac,
    coaching,
    student,
    parent,
    teacher,
    batch,
    attendance,
    test,
    homework,
    ai,
    whatsappAssistant,
    riskEngine,
    notification,
    timeline,
    audit,
    fee,
    salary,
    expense,
    billing,
    notice,
    settings,
    report,
    dashboard,
    import: importModule,
    ops,
    papers,
  };
}

export type AppModules = ReturnType<typeof createModules>;

let modules: AppModules | null = null;

/**
 * Initialises every module once per process. Registering subscribers twice would deliver
 * each event twice, so repeated calls (e.g. createApp() in tests) return the same instances.
 */
export function initModules(): AppModules {
  if (!modules) modules = createModules();
  return modules;
}
