import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type CustomerInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
};

interface Props {
  value: CustomerInfo;
  onChange: (next: CustomerInfo) => void;
}

const CustomerInfoForm = ({ value, onChange }: Props) => {
  const { user } = useAuth();
  const [local, setLocal] = useState<CustomerInfo>(value);

  useEffect(() => {
    // Seed from auth if fields are empty
    setLocal((prev) => ({
      ...prev,
      email: prev.email || user?.email || "",
      firstName:
        prev.firstName ||
        (user?.displayName ? user.displayName.split(" ")[0] : ""),
      lastName:
        prev.lastName ||
        (user?.displayName
          ? user.displayName.split(" ").slice(1).join(" ")
          : ""),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, user?.displayName]);

  const update = (patch: Partial<CustomerInfo>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next);
  };

  const updateBilling = (
    patch: Partial<NonNullable<CustomerInfo["billingAddress"]>>
  ) => {
    const next = {
      ...local,
      billingAddress: { ...(local.billingAddress || {}), ...patch },
    };
    setLocal(next);
    onChange(next);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_12px_35px_rgba(0,0,0,0.08)]">
      <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
          Checkout Details
        </p>
        <h3 className="mt-1 text-2xl font-acumin text-[var(--color-footer)]">
          Payer Information
        </h3>
        <p className="mt-1 text-sm text-[var(--color-footer)]/70">
          Confirm the billing contact information for this booking.
        </p>
      </div>

      <div className="px-5 py-5 md:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col">
            <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
              First name
            </span>
            <input
              className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] placeholder:text-[var(--color-footer)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
              value={local.firstName}
              onChange={(e) => update({ firstName: e.target.value })}
              placeholder="Jane"
            />
          </label>

          <label className="flex flex-col">
            <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
              Last name
            </span>
            <input
              className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] placeholder:text-[var(--color-footer)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
              value={local.lastName}
              onChange={(e) => update({ lastName: e.target.value })}
              placeholder="Doe"
            />
          </label>

          <label className="flex flex-col md:col-span-2">
            <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
              Email
            </span>
            <input
              type="email"
              className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] placeholder:text-[var(--color-footer)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
              value={local.email}
              onChange={(e) => update({ email: e.target.value })}
              placeholder="jane@example.com"
            />
          </label>

          <label className="flex flex-col md:col-span-2">
            <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
              Phone{" "}
              <span className="text-[var(--color-footer)]/50">(optional)</span>
            </span>
            <input
              className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] placeholder:text-[var(--color-footer)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
              value={local.phone || ""}
              onChange={(e) => update({ phone: e.target.value })}
              placeholder="444-444-4444"
            />
          </label>
        </div>

        <details className="group mt-5 overflow-hidden rounded-2xl border border-black/10 bg-neutral-50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm font-semibold text-[var(--color-footer)] marker:content-none">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/55">
                Optional
              </p>
              <p className="mt-1 text-base font-acumin text-[var(--color-footer)]">
                Billing address
              </p>
            </div>

            <span className="text-xs text-[var(--color-footer)]/55 transition group-open:rotate-180">
              ▼
            </span>
          </summary>

          <div className="border-t border-black/5 bg-white px-4 py-4 md:px-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col md:col-span-2">
                <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
                  Address line 1
                </span>
                <input
                  className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] placeholder:text-[var(--color-footer)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                  value={local.billingAddress?.line1 || ""}
                  onChange={(e) => updateBilling({ line1: e.target.value })}
                  placeholder="123 Main St"
                />
              </label>

              <label className="flex flex-col md:col-span-2">
                <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
                  Address line 2
                </span>
                <input
                  className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] placeholder:text-[var(--color-footer)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                  value={local.billingAddress?.line2 || ""}
                  onChange={(e) => updateBilling({ line2: e.target.value })}
                  placeholder="Apt, suite, etc."
                />
              </label>

              <label className="flex flex-col">
                <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
                  City
                </span>
                <input
                  className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                  value={local.billingAddress?.city || ""}
                  onChange={(e) => updateBilling({ city: e.target.value })}
                />
              </label>

              <label className="flex flex-col">
                <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
                  State / Province
                </span>
                <input
                  className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                  value={local.billingAddress?.state || ""}
                  onChange={(e) => updateBilling({ state: e.target.value })}
                />
              </label>

              <label className="flex flex-col">
                <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
                  Postal code
                </span>
                <input
                  className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                  value={local.billingAddress?.postalCode || ""}
                  onChange={(e) =>
                    updateBilling({ postalCode: e.target.value })
                  }
                />
              </label>

              <label className="flex flex-col">
                <span className="mb-1.5 text-sm font-medium text-[var(--color-footer)]">
                  Country
                </span>
                <input
                  className="rounded-xl border border-black/10 bg-neutral-100 px-4 py-3 text-[var(--color-footer)] placeholder:text-[var(--color-footer)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]"
                  value={local.billingAddress?.country || ""}
                  onChange={(e) => updateBilling({ country: e.target.value })}
                  placeholder="US"
                />
              </label>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
};

export default CustomerInfoForm;
