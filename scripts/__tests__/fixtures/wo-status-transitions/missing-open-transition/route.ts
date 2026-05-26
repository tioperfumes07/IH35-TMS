const allowedTransitions: Record<string, string[]> = {
  in_progress: ["waiting_parts", "complete", "cancelled"],
  waiting_parts: ["in_progress", "cancelled"],
  complete: [],
  cancelled: [],
};

void allowedTransitions;
