import { Megaphone, TrendingUp, Users, UserCog, Briefcase, FileSpreadsheet, Landmark, Gauge, KanbanSquare, PenTool, Lightbulb, GraduationCap, Clock, Bot, Fingerprint, LucideIcon } from "lucide-react";

export type SubPage = { href: string; label: string; collab?: boolean; collabColor?: "teal" | "orange" };
export type ModuleConfig = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  enabled: boolean;
  basePath: string;
  subPages: SubPage[];
};

export const MODULES: ModuleConfig[] = [
  {
    key: "marketing", label: "Marketing", icon: Megaphone, color: "bg-brand-500", enabled: true,
    basePath: "/marketing", subPages: [
      { href: "/marketing/dashboard", label: "Dashboard" },
      { href: "/marketing", label: "Leads" },
      { href: "/sales/accounts", label: "Account (CRM)", collab: true },
    ],
  },
  {
    key: "sales", label: "Sales", icon: TrendingUp, color: "bg-blue-500", enabled: true,
    basePath: "/sales", subPages: [
      { href: "/sales/dashboard", label: "Dashboard" },
      { href: "/sales/opportunity-tracker", label: "Opportunity Tracker" },
      { href: "/sales", label: "PQ Tracker" },
      { href: "/sales/accounts", label: "Account (CRM)" },
      { href: "/ta/client-active", label: "Client Active", collab: true },
      { href: "/pmo/overtime-business-trip", label: "Overtime & Business Trip", collab: true, collabColor: "orange" },
      { href: "/sales/profitability-tracker", label: "Profitability Tracker", collab: true },
    ],
  },
  {
    key: "ta", label: "Talent Acquisition", icon: Users, color: "bg-amber-500", enabled: true,
    basePath: "/ta", subPages: [
      { href: "/ta/dashboard", label: "Dashboard" },
      { href: "/ta", label: "Requisition" },
      { href: "/ta/candidates", label: "Candidate" },
      { href: "/ta/pipeline", label: "Hiring Pipeline" },
      { href: "/ta/onboarding", label: "Onboarding" },
      { href: "/ta/client-active", label: "Client Active", collab: true },
    ],
  },
  {
    key: "hr", label: "Human Resources", icon: UserCog, color: "bg-rose-500", enabled: true,
    basePath: "/hr", subPages: [
      { href: "/hr/dashboard", label: "Dashboard" },
      { href: "/hr", label: "Employee" },
      { href: "/hr/extension-requests", label: "Extension Request" },
      { href: "/hr/attendance", label: "Attendance Log" },
      { href: "/hr/attendance-settings", label: "Attendance Settings" },
      { href: "/tm/special-notes", label: "Special Notes (TM-HR)", collab: true },
      { href: "/pmo/overtime-business-trip", label: "Overtime & Business Trip", collab: true, collabColor: "orange" },
    ],
  },
  {
    key: "tm", label: "Talent Management", icon: Briefcase, color: "bg-sky-500", enabled: true,
    basePath: "/tm", subPages: [
      { href: "/tm/dashboard", label: "Dashboard" },
      { href: "/tm", label: "Talents Book" },
      { href: "/tm/database-salary", label: "Talent Database & Salary" },
      { href: "/tm/cogs-calculator", label: "COGS Calculator" },
      { href: "/tm/extension-requests", label: "Extension & Increment Request" },
      { href: "/tm/special-notes", label: "Special Notes (TM-HR)", collab: true },
      { href: "/sales/profitability-tracker", label: "Profitability Tracker", collab: true },
    ],
  },
  {
    key: "pmo", label: "PMO", icon: FileSpreadsheet, color: "bg-violet-500", enabled: true,
    basePath: "/pmo", subPages: [
      { href: "/pmo/dashboard", label: "Dashboard" },
      { href: "/pmo/contracts", label: "A.Contract" },
      { href: "/pmo", label: "Talent Document Tracker" },
      { href: "/pmo/invoices", label: "TM Invoice" },
      { href: "/finance", label: "Dokumen Finance (TM Invoice)", collab: true },
      { href: "/pmo/overtime-business-trip", label: "Overtime & Business Trip", collab: true, collabColor: "orange" },
      { href: "/sales/profitability-tracker", label: "Profitability Tracker", collab: true },
    ],
  },
  {
    key: "timesheet", label: "Timesheet", icon: Clock, color: "bg-purple-500", enabled: true,
    basePath: "/timesheet", subPages: [
      { href: "/timesheet", label: "Tracker" },
      { href: "/timesheet/converter", label: "Converter (Astra)" },
    ],
  },
  {
    key: "attendance", label: "Attendance", icon: Fingerprint, color: "bg-teal-500", enabled: true,
    basePath: "/attendance", subPages: [
      { href: "/attendance", label: "Home" },
      { href: "/attendance/live", label: "Live Attendance" },
      { href: "/attendance/history", label: "Attendance Log" },
      { href: "/attendance/time-off", label: "Time Off" },
    ],
  },
  {
    key: "finance", label: "Finance", icon: Landmark, color: "bg-emerald-600", enabled: true,
    basePath: "/finance", subPages: [
      { href: "/finance", label: "Dokumen Finance (TM Invoice)", collab: true },
      { href: "/pmo/overtime-business-trip", label: "Overtime & Business Trip", collab: true, collabColor: "orange" },
    ],
  },
  {
    key: "executive", label: "Executive Dashboard", icon: Gauge, color: "bg-slate-800", enabled: true,
    basePath: "/executive-dashboard", subPages: [{ href: "/executive-dashboard", label: "Overview" }],
  },
  {
    key: "tasks", label: "Task Board", icon: KanbanSquare, color: "bg-cyan-600", enabled: true,
    basePath: "/tasks", subPages: [{ href: "/tasks", label: "Board" }],
  },
  {
    key: "ttd", label: "Tanda Tangan Digital", icon: PenTool, color: "bg-teal-600", enabled: true,
    basePath: "/ttd-online", subPages: [{ href: "/ttd-online", label: "Tanda Tangan Digital" }],
  },
  {
    key: "feature-requests", label: "Feature Request", icon: Lightbulb, color: "bg-pink-500", enabled: true,
    basePath: "/feature-requests", subPages: [{ href: "/feature-requests", label: "Daftar Request" }],
  },
  {
    key: "school", label: "Learning Management", icon: GraduationCap, color: "bg-fuchsia-600", enabled: true,
    basePath: "/school", subPages: [
      { href: "/school", label: "Katalog Course" },
      { href: "/school/my-learning", label: "My Learning" },
    ],
  },
  {
    key: "automation", label: "Automasi & Chatbot", icon: Bot, color: "bg-indigo-600", enabled: true,
    basePath: "/automation", subPages: [
      { href: "/automation/reminders", label: "Reminder" },
      { href: "/automation/documents", label: "Document Generator" },
    ],
  },
];