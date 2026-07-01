import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { listUsers } from "../../api/identity";
import {
  fetchPlannerTasks,
  fetchTaskComments,
  createTaskComment,
  fetchTaskActivity,
  type Task,
  type TaskActivity,
} from "../../api/tasks";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import { taskStatusLabel } from "./taskDisplay";
import { activeMentionToken, keptMentionIds } from "./tasksChatMentions";

// TASK-3 Team Chat — task-scoped collaboration (option a). Threaded comments on a task +
// @mention of employees + a per-task activity feed. Lives INSIDE the Tasks module; NOT a
// separate app-wide chat. Reads /api/v1/tasks/planner for the picker and the TASK-3
// comments/activity endpoints for the thread. Additive-only. §7 palette (navy/slate).

const COMPANY_TIME_ZONE = "America/Chicago";
function formatCompanyTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: COMPANY_TIME_ZONE,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Employee = { id: string; name: string; email: string | null };

// Split a comment body into plain + highlighted "@Name" segments for the mentioned employees.
function renderBody(body: string, mentionNames: string[]) {
  if (mentionNames.length === 0) return <>{body}</>;
  const tokens = mentionNames.map((n) => `@${n}`).filter(Boolean).sort((a, b) => b.length - a.length);
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = body.split(re);
  return (
    <>
      {parts.map((part, i) =>
        tokens.includes(part) ? (
          <span key={i} className="rounded bg-slate-100 px-1 font-semibold text-[#1f2a44]" data-testid="tasks-chat-mention">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function TasksChatPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const paramTaskId = searchParams.get("taskId") ?? "";
  const [selectedTaskId, setSelectedTaskId] = useState<string>(paramTaskId);
  const activeTaskId = selectedTaskId || paramTaskId;

  const today = companyToday();
  const date_from = addDaysIso(today, -45);
  const date_to = addDaysIso(today, 45);

  const tasksQuery = useQuery({
    queryKey: ["tasks", "chat-picker", companyId, date_from, date_to],
    queryFn: () => fetchPlannerTasks({ operating_company_id: companyId, date_from, date_to }),
    enabled: Boolean(companyId),
  });

  const usersQuery = useQuery({ queryKey: ["identity", "users"], queryFn: () => listUsers(false) });
  const employees: Employee[] = useMemo(
    () =>
      (usersQuery.data?.users ?? [])
        .filter((u) => !u.deactivated_at)
        .map((u) => ({
          id: u.id,
          name: u.name || [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Unknown",
          email: u.email,
        })),
    [usersQuery.data],
  );
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const tasks: Task[] = useMemo(
    () => [...(tasksQuery.data?.tasks ?? [])].sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)),
    [tasksQuery.data],
  );
  const selectedTask = tasks.find((t) => t.task_id === activeTaskId);

  const commentsQuery = useQuery({
    queryKey: ["tasks", "comments", activeTaskId],
    queryFn: () => fetchTaskComments(activeTaskId),
    enabled: Boolean(activeTaskId),
  });
  const activityQuery = useQuery({
    queryKey: ["tasks", "activity", activeTaskId],
    queryFn: () => fetchTaskActivity(activeTaskId),
    enabled: Boolean(activeTaskId),
  });

  // Composer + @mention state.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState("");
  const [mentionIds, setMentionIds] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return employees.filter((e) => e.name.toLowerCase().includes(q) || (e.email ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQuery, employees]);

  function onDraftChange(value: string, cursor: number) {
    setDraft(value);
    setMentionQuery(activeMentionToken(value, cursor));
  }

  function pickMention(emp: Employee) {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? draft.length;
    const upToCursor = draft.slice(0, cursor);
    const at = upToCursor.lastIndexOf("@");
    if (at === -1) return;
    const before = draft.slice(0, at);
    const after = draft.slice(cursor);
    const next = `${before}@${emp.name} ${after}`;
    setDraft(next);
    setMentionIds((prev) => new Set(prev).add(emp.id));
    setMentionQuery(null);
    requestAnimationFrame(() => el?.focus());
  }

  const createMutation = useMutation({
    mutationFn: () => {
      // Only keep mention ids whose "@Name" still appears in the final body.
      const kept = keptMentionIds(draft, mentionIds, (id) => employeeById.get(id)?.name);
      return createTaskComment(activeTaskId, draft.trim(), kept);
    },
    onSuccess: () => {
      setDraft("");
      setMentionIds(new Set());
      setMentionQuery(null);
      queryClient.invalidateQueries({ queryKey: ["tasks", "comments", activeTaskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", "activity", activeTaskId] });
    },
  });

  function selectTask(taskId: string) {
    setSelectedTaskId(taskId);
    const next = new URLSearchParams(searchParams);
    next.set("taskId", taskId);
    setSearchParams(next, { replace: true });
  }

  const canPost = Boolean(activeTaskId) && draft.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="space-y-4" data-testid="tasks-chat-page">
      <PageHeader title="Team Chat" subtitle="Task-scoped comments, @mentions, and activity" />
      <TasksModuleTabs />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* Task picker */}
        <div className="rounded border border-slate-200 bg-white" data-testid="tasks-chat-picker">
          <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">Tasks</div>
          {tasksQuery.isLoading ? (
            <div className="p-4 text-xs text-slate-500">Loading tasks…</div>
          ) : tasks.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">No tasks in this window.</div>
          ) : (
            <ul className="max-h-[560px] overflow-y-auto">
              {tasks.map((t) => {
                const isActive = t.task_id === activeTaskId;
                return (
                  <li key={t.task_id}>
                    <button
                      type="button"
                      onClick={() => selectTask(t.task_id)}
                      data-testid="tasks-chat-picker-item"
                      className={[
                        "block w-full border-b border-slate-100 px-3 py-2 text-left text-xs",
                        isActive ? "bg-slate-100 text-[#1f2a44]" : "text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div className="font-medium">{t.title}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {t.scheduled_date} · {taskStatusLabel(t.status)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Thread + composer + activity */}
        <div className="space-y-4">
          {!activeTaskId ? (
            <div className="rounded border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Select a task to view its conversation.
            </div>
          ) : (
            <>
              <div className="rounded border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-2">
                  <div className="text-sm font-semibold text-[#1f2a44]">{selectedTask?.title ?? "Task"}</div>
                  {selectedTask ? (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {selectedTask.scheduled_date} · {taskStatusLabel(selectedTask.status)}
                    </div>
                  ) : null}
                </div>

                {/* Comment thread */}
                <div className="max-h-[380px] space-y-3 overflow-y-auto p-4" data-testid="tasks-chat-thread">
                  {commentsQuery.isLoading ? (
                    <div className="text-xs text-slate-500">Loading comments…</div>
                  ) : commentsQuery.isError ? (
                    <div className="text-xs text-red-700">Couldn't load comments.</div>
                  ) : (commentsQuery.data?.comments.length ?? 0) === 0 ? (
                    <div className="text-xs text-slate-500">No comments yet. Start the conversation.</div>
                  ) : (
                    commentsQuery.data?.comments.map((c) => {
                      const mentionNames = c.mentions
                        .map((id) => employeeById.get(id)?.name)
                        .filter((n): n is string => Boolean(n));
                      return (
                        <div key={c.id} className="rounded border border-slate-100 bg-slate-50 p-2" data-testid="tasks-chat-comment">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs font-semibold text-[#1f2a44]">{c.author_name ?? c.author_email ?? "Unknown"}</span>
                            <span className="text-[10px] text-slate-400">{formatCompanyTime(c.created_at)}</span>
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{renderBody(c.body, mentionNames)}</div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Composer */}
                <div className="relative border-t border-slate-200 p-3">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                    placeholder="Write a comment… use @ to mention a teammate"
                    rows={3}
                    data-testid="tasks-chat-composer"
                    className="w-full resize-none rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
                  />
                  {mentionQuery !== null && mentionMatches.length > 0 ? (
                    <ul
                      className="absolute bottom-16 left-3 z-10 max-h-48 w-64 overflow-y-auto rounded border border-slate-300 bg-white shadow"
                      data-testid="tasks-chat-mention-menu"
                    >
                      {mentionMatches.map((emp) => (
                        <li key={emp.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              pickMention(emp);
                            }}
                            className="block w-full px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
                          >
                            <span className="font-medium text-[#1f2a44]">{emp.name}</span>
                            {emp.email ? <span className="ml-1 text-[10px] text-slate-400">{emp.email}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {mentionIds.size > 0 ? `${mentionIds.size} mention${mentionIds.size === 1 ? "" : "s"}` : ""}
                    </span>
                    <button
                      type="button"
                      disabled={!canPost}
                      onClick={() => createMutation.mutate()}
                      data-testid="tasks-chat-post"
                      className={[
                        "rounded px-3 py-1.5 text-xs font-semibold text-white",
                        canPost ? "bg-[#1f2a44] hover:bg-[#0f1729]" : "cursor-not-allowed bg-slate-300",
                      ].join(" ")}
                    >
                      {createMutation.isPending ? "Posting…" : "Post comment"}
                    </button>
                  </div>
                  {createMutation.isError ? (
                    <div className="mt-1 text-[10px] text-red-700">Couldn't post the comment. Try again.</div>
                  ) : null}
                </div>
              </div>

              {/* Activity feed */}
              <div className="rounded border border-slate-200 bg-white" data-testid="tasks-chat-activity">
                <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">Activity</div>
                <div className="max-h-[260px] overflow-y-auto p-4">
                  {activityQuery.isLoading ? (
                    <div className="text-xs text-slate-500">Loading activity…</div>
                  ) : (activityQuery.data?.activity.length ?? 0) === 0 ? (
                    <div className="text-xs text-slate-500">No activity yet.</div>
                  ) : (
                    <ul className="space-y-2">
                      {activityQuery.data?.activity.map((a: TaskActivity) => (
                        <li key={a.id} className="flex items-baseline justify-between text-xs" data-testid="tasks-chat-activity-item">
                          <span className="text-slate-700">
                            <span className="font-medium text-[#1f2a44]">{a.actor_name ?? "System"}</span>{" "}
                            {a.event_type === "comment"
                              ? "added a comment"
                              : a.event_type === "status_change"
                                ? "changed the status"
                                : "changed the assignment"}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatCompanyTime(a.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
