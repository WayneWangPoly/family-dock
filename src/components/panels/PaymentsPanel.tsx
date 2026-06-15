import { useState } from "react";
import type { FamilyData, Payment } from "../../lib/familyDataTypes";
import { formatDate, getMemberName, getOpenPayments, sumPayments } from "../../lib/familyUiHelpers";
import { getCurrentFamilyRole } from "../../lib/familyDataApi";
import { markPaymentPaid, markPaymentUnpaid } from "../../lib/familyMutations";
import { PaymentFormModal } from "../forms/PaymentFormModal";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  onRefresh?: () => Promise<unknown> | unknown;
};

function paymentStatusTone(status: string) {
  if (status === "paid") return "success" as const;
  if (status === "overdue") return "danger" as const;
  return "warning" as const;
}

function PaymentCard({ data, payment, onPay, onUnpay }: {
  data: FamilyData;
  payment: Payment;
  onPay: (paymentId: string) => void;
  onUnpay: (paymentId: string) => void;
}) {
  const paid = payment.status === "paid";

  return (
    <article className={`fd-payment-card ${paid ? "paid" : "needs-action"}`}>
      <div className="fd-payment-main">
        <div className="fd-payment-title-row">
          <strong>{payment.title}</strong>
          <StatusPill label={paid ? "Paid" : "To pay"} tone={paymentStatusTone(payment.status)} />
        </div>

        <div className="fd-payment-meta">
          {getMemberName(data, payment.child_id)}
          {payment.due_date ? ` · due ${formatDate(payment.due_date)}` : ""}
        </div>

        {(payment.pay_to || payment.reference) && (
          <div className="fd-payment-detail">
            {payment.pay_to ? `Pay to: ${payment.pay_to}` : ""}
            {payment.pay_to && payment.reference ? " · " : ""}
            {payment.reference ? `Ref: ${payment.reference}` : ""}
          </div>
        )}

        {payment.paid_by && (
          <div className="fd-payment-detail">
            Paid by {getMemberName(data, payment.paid_by)}{payment.paid_at ? ` · ${formatDate(payment.paid_at)}` : ""}
          </div>
        )}
      </div>

      <div className="fd-payment-side">
        <div>
          <div className="fd-payment-amount">${Number(payment.amount).toFixed(0)}</div>
          <div className="fd-payment-currency">{payment.currency}</div>
        </div>
        {paid ? (
          <button onClick={() => onUnpay(payment.id)} className="fd-button small subtle">Mark unpaid</button>
        ) : (
          <button onClick={() => onPay(payment.id)} className="fd-button small primary">Paid</button>
        )}
      </div>
    </article>
  );
}

export function PaymentsPanel({ data, onRefresh }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const { showToast, showError } = useToast();
  const unpaid = getOpenPayments(data.payments);
  const paid = data.payments.filter((payment) => payment.status === "paid");
  const total = sumPayments(data.payments);

  async function pay(paymentId: string) {
    try {
      const role = await getCurrentFamilyRole();
      await markPaymentPaid({ paymentId, familyId: data.family.id, paidBy: role.member_id });
      await onRefresh?.();
      showToast("Marked as paid.", "success");
    } catch (error) {
      showError(error);
    }
  }

  async function unpay(paymentId: string) {
    try {
      await markPaymentUnpaid({ paymentId, familyId: data.family.id });
      await onRefresh?.();
      showToast("Marked as unpaid.", "success");
    } catch (error) {
      showError(error);
    }
  }

  return (
    <>
      <div className="fd-grid fd-payments-panel">
        <div className="fd-compact-metrics">
          <div className="fd-compact-metric needs-action">
            <span>To pay</span>
            <strong>${sumPayments(unpaid).toFixed(0)}</strong>
            <em>{unpaid.length} items</em>
          </div>
          <div className="fd-compact-metric">
            <span>Paid</span>
            <strong>${sumPayments(paid).toFixed(0)}</strong>
            <em>{paid.length} items</em>
          </div>
          <div className="fd-compact-metric">
            <span>Total</span>
            <strong>${total.toFixed(0)}</strong>
            <em>tracked</em>
          </div>
        </div>

        <PanelCard raised>
          <SectionTitle
            title="Payments"
            subtitle="School and activity fees"
            right={<button onClick={() => setFormOpen(true)} className="fd-button primary">Add payment</button>}
          />

          {data.payments.length === 0 ? (
            <EmptyState text="No payments yet." />
          ) : (
            <div className="fd-payment-list">
              {unpaid.length > 0 ? (
                unpaid.map((payment) => (
                  <PaymentCard
                    key={payment.id}
                    data={data}
                    payment={payment}
                    onPay={pay}
                    onUnpay={unpay}
                  />
                ))
              ) : (
                <div className="fd-empty">Nothing to pay right now.</div>
              )}

              {paid.length > 0 && (
                <details className="fd-disclosure quiet fd-paid-history">
                  <summary>Paid history · {paid.length}</summary>
                  <div className="fd-payment-list" style={{ marginTop: 10 }}>
                    {paid.map((payment) => (
                      <PaymentCard
                        key={payment.id}
                        data={data}
                        payment={payment}
                        onPay={pay}
                        onUnpay={unpay}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </PanelCard>
      </div>

      <PaymentFormModal open={formOpen} data={data} onClose={() => setFormOpen(false)} onSaved={onRefresh} />
    </>
  );
}
