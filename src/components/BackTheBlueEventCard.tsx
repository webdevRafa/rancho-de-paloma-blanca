import { CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import {
  BACK_THE_BLUE_DATE_LABEL,
  BACK_THE_BLUE_RESCHEDULE_NOTICE,
} from "../utils/huntPricing";

// Use selectable text so event changes never leave a stale date in a flyer.
export default function BackTheBlueEventCard() {
  return (
    <aside
      aria-label="Back the Blue event details"
      className="flex h-full flex-col justify-center gap-5 bg-gradient-to-br from-blue-950 to-blue-800 p-6 text-white sm:p-8"
    >
      <ShieldCheck size={32} aria-hidden="true" />
      <p className="text-sm font-semibold text-blue-100">
        {BACK_THE_BLUE_RESCHEDULE_NOTICE}
      </p>
      <h3 className="font-gin text-3xl leading-tight text-white sm:text-4xl">
        Back the Blue Dove Hunt
      </h3>
      <div className="space-y-3 text-sm leading-6">
        <p className="flex items-center gap-3">
          <CalendarDays size={18} aria-hidden="true" />
          <span>Saturday, {BACK_THE_BLUE_DATE_LABEL}</span>
        </p>
        <p className="flex items-center gap-3">
          <MapPin size={18} className="shrink-0" aria-hidden="true" />
          <span>Ranch locations: Brownsville and Rio Hondo, Texas</span>
        </p>
        <p className="text-blue-100">
          Contact the ranch to confirm the location for your hunt.
        </p>
      </div>
      <p className="border-t border-white/20 pt-5 text-lg font-semibold">
        $50 <span className="text-sm font-normal">per hunter, per day</span>
      </p>
      <p className="text-sm leading-6 text-blue-100">
        For first responders and their guests. Bring your first-responder
        credentials for check-in.
      </p>
    </aside>
  );
}
