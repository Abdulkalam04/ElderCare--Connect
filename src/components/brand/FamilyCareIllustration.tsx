import { Bell, CalendarDays, HeartPulse, Smartphone } from "lucide-react";

export function FamilyCareIllustration() {
  return (
    <div className="relative mx-auto aspect-[0.92] w-full max-w-[510px] select-none" aria-hidden="true">
      <div className="auth-glow-ring left-[12%] top-[9%] h-[73%] w-[76%]" />
      <div className="auth-glow-ring left-[19%] top-[15%] h-[60%] w-[63%] opacity-70" />

      <div className="absolute left-[2%] top-[21%] z-20 grid size-16 place-items-center rounded-full border border-white/30 bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-2xl animate-float-care">
        <Bell className="size-7" />
      </div>
      <div className="absolute right-[2%] top-[22%] z-20 grid size-16 place-items-center rounded-full border border-white/25 bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-2xl animate-float-care [animation-delay:-1.4s]">
        <span className="text-xl font-bold">SOS</span>
      </div>
      <div className="absolute right-[28%] top-[1%] z-20 grid size-16 place-items-center rounded-full border border-white/25 bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-2xl animate-float-care [animation-delay:-2.2s]">
        <CalendarDays className="size-7" />
      </div>

      <svg viewBox="0 0 520 560" className="absolute inset-x-0 bottom-0 h-[92%] w-full drop-shadow-[0_34px_40px_rgba(2,47,54,0.38)]">
        <defs>
          <linearGradient id="elder-shirt" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#fff8e7" />
            <stop offset="1" stopColor="#e7d9bd" />
          </linearGradient>
          <linearGradient id="child-shirt" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#147b80" />
            <stop offset="1" stopColor="#07545e" />
          </linearGradient>
          <linearGradient id="seat" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#0c5961" />
            <stop offset="1" stopColor="#063c47" />
          </linearGradient>
          <radialGradient id="skin" cx="45%" cy="30%" r="75%">
            <stop stopColor="#f8cda9" />
            <stop offset="1" stopColor="#d58e64" />
          </radialGradient>
          <radialGradient id="skin2" cx="44%" cy="26%" r="75%">
            <stop stopColor="#f5bd90" />
            <stop offset="1" stopColor="#c77d53" />
          </radialGradient>
          <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="12" stdDeviation="12" floodColor="#002d36" floodOpacity="0.25" />
          </filter>
        </defs>

        <ellipse cx="270" cy="510" rx="208" ry="34" fill="#043d47" opacity="0.55" />
        <path d="M86 431c34-83 103-126 202-126 92 0 151 43 177 126l-4 82H91l-5-82Z" fill="url(#seat)" />

        <g filter="url(#soft-shadow)">
          <path d="M96 493c0-93 28-155 87-187 55-30 114-16 143 42 19 38 23 88 18 145H96Z" fill="url(#elder-shirt)" />
          <path d="M284 493c-9-95 9-168 57-208 48-41 115-21 141 42 18 44 22 101 16 166H284Z" fill="url(#child-shirt)" />
        </g>

        <g>
          <path d="M152 268c-14-19-13-50 2-72 16-23 43-36 72-33 39 4 64 35 62 74-2 44-28 84-70 88-29 3-51-18-66-57Z" fill="url(#skin)" />
          <path d="M144 225c-8-30 7-65 34-82 28-17 67-12 88 8 18 17 25 43 19 65-7-15-19-27-34-35-24 20-57 29-90 22-8 8-13 15-17 22Z" fill="#f1eee7" />
          <path d="M153 210c10-34 34-55 71-61" fill="none" stroke="#ffffff" strokeWidth="17" strokeLinecap="round" opacity="0.92" />
          <path d="M154 212c-8 16-10 32-7 48" fill="none" stroke="#ddd8ce" strokeWidth="14" strokeLinecap="round" />
          <ellipse cx="190" cy="235" rx="22" ry="17" fill="none" stroke="#4f3429" strokeWidth="4" />
          <ellipse cx="244" cy="235" rx="22" ry="17" fill="none" stroke="#4f3429" strokeWidth="4" />
          <path d="M212 234h10" stroke="#4f3429" strokeWidth="4" strokeLinecap="round" />
          <circle cx="191" cy="236" r="3.4" fill="#35241d" />
          <circle cx="243" cy="236" r="3.4" fill="#35241d" />
          <path d="M205 275c11 11 27 11 39 0" fill="none" stroke="#8c4937" strokeWidth="4" strokeLinecap="round" />
        </g>

        <g>
          <path d="M309 217c-2-42 30-75 75-75 46 0 80 33 78 77-2 49-34 91-78 91-43 0-73-41-75-93Z" fill="url(#skin2)" />
          <path d="M311 198c1-42 31-76 75-78 34-2 66 18 78 49-12-9-29-14-47-13-28 2-49 14-66 38-14 19-26 21-40 4Z" fill="#3d2418" />
          <path d="M330 151c29-31 86-34 120-3" fill="none" stroke="#4c2c1b" strokeWidth="17" strokeLinecap="round" />
          <circle cx="356" cy="217" r="3.6" fill="#35241d" />
          <circle cx="414" cy="216" r="3.6" fill="#35241d" />
          <path d="M373 255c15 12 34 10 46-3" fill="none" stroke="#8c4937" strokeWidth="4" strokeLinecap="round" />
        </g>

        <path d="M290 370c43-35 67-43 109-38 20 2 35 14 39 31 5 21-8 37-28 38-29 0-57 7-83 25" fill="none" stroke="url(#skin2)" strokeWidth="31" strokeLinecap="round" />
        <path d="M291 368c38-28 69-39 109-34" fill="none" stroke="#07545e" strokeWidth="45" strokeLinecap="round" />
        <path d="M248 360c29 29 43 64 43 103" fill="none" stroke="url(#elder-shirt)" strokeWidth="53" strokeLinecap="round" />

        <g transform="translate(213 337) rotate(-7)">
          <rect x="0" y="0" width="69" height="119" rx="13" fill="#26333b" />
          <rect x="7" y="9" width="55" height="91" rx="8" fill="#d9f5e6" />
          <circle cx="35" cy="108" r="4" fill="#7c8990" />
          <path d="M17 45h35M17 57h25M17 69h30" stroke="#4ea77b" strokeWidth="5" strokeLinecap="round" />
          <circle cx="46" cy="28" r="10" fill="#178f91" />
          <path d="M42 28h8M46 24v8" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </g>

        <path d="M367 346c-19 24-42 39-70 49" fill="none" stroke="url(#skin2)" strokeWidth="24" strokeLinecap="round" />
        <circle cx="296" cy="397" r="17" fill="url(#skin2)" />
      </svg>

      <div className="absolute bottom-[4%] left-[44%] z-30 grid size-12 place-items-center rounded-2xl border border-white/25 bg-white/15 text-white backdrop-blur-md">
        <Smartphone className="size-5" />
      </div>
      <div className="absolute bottom-[12%] right-[8%] z-20 grid size-12 place-items-center rounded-2xl border border-white/20 bg-emerald-400/20 text-emerald-100 backdrop-blur-md animate-pulse-soft">
        <HeartPulse className="size-5" />
      </div>
    </div>
  );
}
