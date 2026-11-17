import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuCircleCheck, LuCreditCard, LuPrinter } from 'react-icons/lu';
import { useBillingAction, useBillingInvoice } from '@/api/queries';
import { Button, PageHeader, PageSkeleton, dueLabel, formatINR } from '@/components/ui';
import { InvoiceBadge } from '@/components/status';
import { MoneyDocument } from '@/components/finance';
import { LoadError, NotVisible, isNotFound } from '@/components/projects';
import { FormError } from '@/pages/admin/finance/forms';

export function ClientInvoice() {
  const { id } = useParams();
  const { data: inv, error, isPending, refetch } = useBillingInvoice(id);
  const pay = useBillingAction();
  const [confirming, setConfirming] = useState(false);
  const [receipt, setReceipt] = useState(null);

  if (isPending) return <PageSkeleton />;
  if (isNotFound(error)) return <NotVisible what="Invoice" backTo="/client/billing" backLabel="Back to billing" />;
  if (error) return <LoadError error={error} onRetry={refetch} />;

  const unpaid = inv.balance > 0 && (inv.status === 'SENT' || inv.status === 'OVERDUE');

  return (
    <div className="page">
      <Link to="/client/billing" className="back-link no-print">
        <LuArrowLeft aria-hidden /> Billing
      </Link>
      <PageHeader
        eyebrow={inv.title}
        title={inv.number}
        actions={
          <span className="row no-print">
            <InvoiceBadge status={inv.status} />
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              <LuPrinter aria-hidden /> Print / PDF
            </Button>
          </span>
        }
      />

      {receipt && (
        <div className="alert alert--ok no-print" role="status">
          <LuCircleCheck aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Payment received. Receipt {receipt.receiptNumber} for {formatINR(receipt.amount)} has been emailed to you.
          </span>
        </div>
      )}

      {unpaid && (
        <div className="pay-box no-print">
          <div>
            <div className="pay-box__amount">{formatINR(inv.balance)}</div>
            <div className={`small${inv.status === 'OVERDUE' ? ' text-danger' : ' muted'}`}>
              {inv.status === 'OVERDUE' ? `${inv.daysLate} days overdue` : dueLabel(inv.due)}
            </div>
          </div>
          {!confirming ? (
            <Button onClick={() => setConfirming(true)}>
              <LuCreditCard aria-hidden /> Pay now
            </Button>
          ) : (
            <div className="grid" style={{ gap: 8 }}>
              <span className="small">Demo payment: no money moves. In the live portal this opens a secure UPI, card or netbanking page.</span>
              <div className="row">
                <Button
                  loading={pay.isPending}
                  onClick={() =>
                    pay.mutate(
                      { kind: 'pay', id: inv.id },
                      {
                        onSuccess: (d) => {
                          setReceipt(d.payments[d.payments.length - 1]);
                          setConfirming(false);
                          refetch();
                        },
                      },
                    )
                  }
                >
                  Pay {formatINR(inv.balance)}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <p className="small muted pay-box__alt">
            Or pay by bank transfer to {inv.payTo.bank}, A/c {inv.payTo.account}, IFSC {inv.payTo.ifsc}, or UPI {inv.payTo.upi}. Quote {inv.number}. If you deduct TDS,
            tell your account manager so it is matched.
          </p>
        </div>
      )}
      <div className="no-print">
        <FormError error={pay.error} />
      </div>

      <MoneyDocument doc={inv} />
    </div>
  );
}
