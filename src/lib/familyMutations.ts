import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "./firebaseClient";

function nowIso() {
  return new Date().toISOString();
}

function familyDoc(familyId: string, collectionName: string, id: string) {
  return doc(firestore, "families", familyId, collectionName, id);
}

export async function markPaymentPaid(args: {
  paymentId: string;
  familyId: string;
  paidBy: string | null;
}) {
  await updateDoc(familyDoc(args.familyId, "payments", args.paymentId), {
    status: "paid",
    paid_by: args.paidBy,
    paid_at: nowIso(),
    updated_at: nowIso(),
  });
}

export async function markPaymentUnpaid(args: {
  paymentId: string;
  familyId: string;
}) {
  await updateDoc(familyDoc(args.familyId, "payments", args.paymentId), {
    status: "unpaid",
    paid_by: null,
    paid_at: null,
    updated_at: nowIso(),
  });
}

export async function updateHomeworkItemDone(args: {
  itemId: string;
  familyId: string;
  isDone: boolean;
  completedBy: string | null;
}) {
  await updateDoc(familyDoc(args.familyId, "homework_items", args.itemId), {
    is_done: args.isDone,
    completed_by: args.isDone ? args.completedBy : null,
    completed_at: args.isDone ? nowIso() : null,
    updated_at: nowIso(),
  });
}

export async function updateHomeworkTaskStatus(args: {
  taskId: string;
  familyId: string;
  status: "not_started" | "in_progress" | "done" | "overdue" | "cancelled";
}) {
  await updateDoc(familyDoc(args.familyId, "homework_tasks", args.taskId), {
    status: args.status,
    updated_at: nowIso(),
  });
}

export async function decideRequest(args: {
  requestId: string;
  familyId: string;
  status: "approved" | "rejected" | "conditional";
  decidedBy: string | null;
  conditionText?: string | null;
}) {
  await updateDoc(familyDoc(args.familyId, "requests", args.requestId), {
    status: args.status,
    decided_by: args.decidedBy,
    decided_at: nowIso(),
    condition_text: args.conditionText ?? null,
    updated_at: nowIso(),
  });
}

export async function updateCalendarEventStatus(args: {
  eventId: string;
  familyId: string;
  status: "scheduled" | "done" | "cancelled" | "pending";
}) {
  await updateDoc(familyDoc(args.familyId, "events", args.eventId), {
    status: args.status,
    updated_at: nowIso(),
  });
}

export async function updateRouteStopStatus(args: {
  stopId: string;
  familyId: string;
  status: "pending" | "done" | "cancelled" | "active";
}) {
  await updateDoc(familyDoc(args.familyId, "route_stops", args.stopId), {
    status: args.status,
    updated_at: nowIso(),
  });
}
