import { Sprout } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-[#102A24]/10 px-5 py-10 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#102A24] text-[#D9A441]">
            <Sprout className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-black tracking-[0.12em] text-[#102A24]">CARVER AI</p>
            <p className="text-sm font-semibold text-[#102A24]/60">AI tạo cảm hứng. Chuyên gia tạo công trình.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-5 text-sm font-bold text-[#102A24]/65">
          <a href="#features" className="hover:text-[#102A24]">Features</a>
          <a href="#workflow" className="hover:text-[#102A24]">Workflow</a>
          <a href="#reality" className="hover:text-[#102A24]">Reality Check</a>
          <a href="#demo" className="hover:text-[#102A24]">Contact</a>
        </div>
      </div>
    </footer>
  );
}
