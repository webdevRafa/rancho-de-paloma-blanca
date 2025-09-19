// src/pages/RefundPage.tsx

export default function RefundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div>
        <h1 className="text-white text-5xl text-center mb-3 font-gin">
          REFUND POLICY
        </h1>
        <p className="text-white text-center text-lg leading-relaxed max-w-2xl opacity-76">
          Refunds requested{" "}
          <span className="font-semibold">two weeks or more &nbsp;</span>
          prior to the hunt date will receive{" "}
          <span className="font-semibold">50% of the initial payment</span>.
          Refunds requested within two weeks of the hunt date are{" "}
          <span className="font-semibold">not eligible</span>.
        </p>
      </div>
    </div>
  );
}
