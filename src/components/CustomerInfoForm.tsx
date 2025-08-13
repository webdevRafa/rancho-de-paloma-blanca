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
    <div className="bg-neutral-100 p-3 rounded border">
      <h3 className="text-lg font-semibold mb-2">Payer Information</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col text-sm">
          First name
          <input
            className="bg-white border rounded px-3 py-2"
            value={local.firstName}
            onChange={(e) => update({ firstName: e.target.value })}
            placeholder="Jane"
          />
        </label>
        <label className="flex flex-col text-sm">
          Last name
          <input
            className="bg-white border rounded px-3 py-2"
            value={local.lastName}
            onChange={(e) => update({ lastName: e.target.value })}
            placeholder="Doe"
          />
        </label>
        <label className="flex flex-col text-sm md:col-span-2">
          Email
          <input
            type="email"
            className="bg-white border rounded px-3 py-2"
            value={local.email}
            onChange={(e) => update({ email: e.target.value })}
            placeholder="jane@example.com"
          />
        </label>
        <label className="flex flex-col text-sm md:col-span-2">
          Phone (optional)
          <input
            className="bg-white border rounded px-3 py-2"
            value={local.phone || ""}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="444-444-4444"
          />
        </label>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Billing address (optional)
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <label className="flex flex-col text-sm md:col-span-2">
            Address line 1
            <input
              className="bg-white border rounded px-3 py-2"
              value={local.billingAddress?.line1 || ""}
              onChange={(e) => updateBilling({ line1: e.target.value })}
              placeholder="123 Main St"
            />
          </label>
          <label className="flex flex-col text-sm md:col-span-2">
            Address line 2
            <input
              className="bg-white border rounded px-3 py-2"
              value={local.billingAddress?.line2 || ""}
              onChange={(e) => updateBilling({ line2: e.target.value })}
              placeholder="Apt, suite, etc."
            />
          </label>
          <label className="flex flex-col text-sm">
            City
            <input
              className="bg-white border rounded px-3 py-2"
              value={local.billingAddress?.city || ""}
              onChange={(e) => updateBilling({ city: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm">
            State / Province
            <input
              className="bg-white border rounded px-3 py-2"
              value={local.billingAddress?.state || ""}
              onChange={(e) => updateBilling({ state: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm">
            Postal code
            <input
              className="bg-white border rounded px-3 py-2"
              value={local.billingAddress?.postalCode || ""}
              onChange={(e) => updateBilling({ postalCode: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm">
            Country
            <input
              className="bg-white border rounded px-3 py-2"
              value={local.billingAddress?.country || ""}
              onChange={(e) => updateBilling({ country: e.target.value })}
              placeholder="US"
            />
          </label>
        </div>
      </details>
    </div>
  );
};

export default CustomerInfoForm;
