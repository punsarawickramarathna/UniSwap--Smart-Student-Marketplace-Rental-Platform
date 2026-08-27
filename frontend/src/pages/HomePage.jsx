import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarClock,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import campusMarketplace from "../assets/campus-marketplace.jpg";
import { handleAppLink } from "../navigation";

const highlights = [
  {
    icon: ShieldCheck,
    title: "Verified students only",
    copy: "University email verification keeps the marketplace inside the student community.",
  },
  {
    icon: CalendarClock,
    title: "Buy or rent your way",
    copy: "Find the things you need for a semester without paying full retail every time.",
  },
  {
    icon: BookOpenCheck,
    title: "Built around campus life",
    copy: "A focused marketplace experience designed for student-to-student exchange.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#071a17] text-white">
      <section className="relative isolate min-h-[88vh] overflow-hidden">
        <img
          alt="Students sharing useful items on a university campus"
          className="absolute inset-0 -z-30 size-full scale-[1.02] object-cover object-center"
          src={campusMarketplace}
        />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(90deg,rgba(5,25,21,.96)_0%,rgba(5,25,21,.88)_42%,rgba(5,25,21,.35)_74%,rgba(5,25,21,.62)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_77%_24%,rgba(94,234,187,.18),transparent_28%)]" />

        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-10">
          <a
            className="group inline-flex items-center gap-3 text-lg font-bold tracking-tight"
            href="/"
            onClick={handleAppLink("/")}
          >
            <span className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-[0_14px_40px_rgba(0,0,0,.24)] backdrop-blur-xl transition duration-300 group-hover:-translate-y-0.5 group-hover:bg-white/15">
              <ShoppingBag aria-hidden="true" size={21} />
            </span>
            <span>UniSwap</span>
          </a>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              className="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white sm:inline-flex"
              href="/login"
              onClick={handleAppLink("/login")}
            >
              Log in
            </a>
            <a
              className="home-primary-action inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition duration-300 hover:-translate-y-0.5 sm:px-5"
              href="/signup"
              onClick={handleAppLink("/signup")}
            >
              Sign up
              <ArrowRight aria-hidden="true" size={16} />
            </a>
          </div>
        </nav>

        <div className="mx-auto grid w-full max-w-7xl items-end gap-12 px-5 pb-14 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.08fr_.92fr] lg:px-10 lg:pb-24 lg:pt-28">
          <div className="max-w-3xl page-enter">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-50/10 px-3.5 py-2 text-xs font-bold uppercase tracking-[.16em] text-emerald-100 backdrop-blur-xl">
              <BadgeCheck aria-hidden="true" size={16} />
              Verified student marketplace
            </div>
            <h1 className="max-w-3xl text-[clamp(3rem,7vw,6.8rem)] font-semibold leading-[.91] tracking-[-.055em]">
              Campus finds,
              <span className="block text-[#b8f5d8]">without the chaos.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-white/72 sm:text-lg sm:leading-8">
              Buy, sell, and rent useful student essentials inside a trusted university community—simple, verified, and made for campus life.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                className="home-primary-action group inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition duration-300 hover:-translate-y-1"
                href="/signup"
                onClick={handleAppLink("/signup")}
              >
                Create student account
                <ArrowRight className="transition group-hover:translate-x-1" size={17} />
              </a>
              <a
                className="inline-flex min-h-13 items-center justify-center rounded-2xl border border-white/18 bg-white/8 px-6 py-3.5 text-sm font-bold text-white backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/14"
                href="/login"
                onClick={handleAppLink("/login")}
              >
                I already have an account
              </a>
            </div>
          </div>

          <div className="hidden justify-self-end lg:block">
            <div className="relative w-[24rem] rounded-[2rem] border border-white/14 bg-[#09241f]/72 p-5 shadow-[0_34px_90px_rgba(0,0,0,.34)] backdrop-blur-2xl page-enter-delayed">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.15em] text-emerald-200/65">Campus access</p>
                  <p className="mt-1 text-lg font-semibold">Student identity check</p>
                </div>
                <span className="grid size-11 place-items-center rounded-2xl bg-[#dfffee] text-[#0b3a2f]">
                  <ShieldCheck size={21} />
                </span>
              </div>
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/14 p-4">
                <p className="text-xs text-white/48">Student ID format</p>
                <p className="mt-2 font-mono text-xl font-semibold tracking-[.08em] text-white">ITBIN12345678</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full w-full rounded-full bg-[#72e5b4] verification-sweep" />
                </div>
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-50/8 p-4 text-sm leading-6 text-white/70">
                <Sparkles className="mt-0.5 shrink-0 text-[#9bedca]" size={17} />
                Verification codes are sent only to approved university email domains.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#f5f8f6] px-5 py-16 text-[#12231e] sm:px-8 lg:px-10 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-[#387363]">Designed for trust</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-.035em] sm:text-4xl">A cleaner way to exchange things on campus.</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#61706b]">UniSwap keeps student identity at the front door, while marketplace modules stay focused on the experience after you enter.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {highlights.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="group rounded-[1.75rem] border border-[#dfe7e3] bg-white p-6 shadow-[0_12px_40px_rgba(22,53,44,.05)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(22,53,44,.09)]">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#e7f7ef] text-[#1f6954] transition group-hover:scale-105">
                  <Icon aria-hidden="true" size={21} />
                </span>
                <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#687771]">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
