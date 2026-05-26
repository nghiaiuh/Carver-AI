"use client";

import { Check, HardHat, Home } from "lucide-react";
import { useRef } from "react";
import { useGSAP } from "./gsapSetup";
import { prefersReducedMotion, revealUp, scopedSelector } from "./landingMotion";

const users = [
  {
    title: "Cho chủ nhà muốn xem sân vườn tương lai",
    copy: "Bạn không cần biết CAD hay thuật ngữ thiết kế. Chỉ cần bắt đầu từ ảnh sân nhà và cảm giác bạn muốn.",
    icon: Home,
    items: [
      "Upload ảnh sân nhà",
      "Thử nhiều phong cách",
      "Xem before/after",
      "Biết ngân sách sơ bộ",
      "Nhận Reality Check",
      "Tạo brief gửi chuyên gia",
    ],
  },
  {
    title: "Cho kỹ sư muốn tạo concept và tư vấn nhanh hơn",
    copy: "AI tạo bản nháp và gợi ý trực quan. Chuyên gia vẫn là người biến concept thành phương án khả thi.",
    icon: HardHat,
    items: [
      "Tạo concept từ ảnh/mặt bằng",
      "Khoanh vùng cố định cơ bản",
      "Gợi ý hồ Koi, non bộ, thác nước",
      "Tạo proposal nhanh",
      "Thêm ghi chú kỹ thuật",
      "Nhận brief rõ nhu cầu từ khách",
    ],
  },
];

export default function UsersSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = scopedSelector(rootRef);

      revealUp(q(".user-card"), {
        duration: 0.8,
        stagger: 0.12,
        scrollTrigger: { trigger: rootRef.current, start: "top 70%" },
      });
    },
    { scope: rootRef },
  );

  return (
    <section ref={rootRef} className="px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h2 className="max-w-3xl text-4xl font-black leading-tight text-[#102A24] sm:text-5xl">
          Một công cụ, hai trải nghiệm rõ ràng
        </h2>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {users.map((user, index) => {
            const Icon = user.icon;
            return (
              <article
                key={user.title}
                className={`user-card overflow-hidden rounded-[2.25rem] border border-[#102A24]/10 p-8 shadow-2xl shadow-[#102A24]/10 ${
                  index === 0 ? "bg-[#FFFDF6]" : "bg-[#D8C6A3]/35"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#102A24] text-[#D9A441]">
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <h3 className="text-3xl font-black leading-tight text-[#102A24]">{user.title}</h3>
                </div>
                <p className="mt-6 text-lg leading-8 text-[#102A24]/70">{user.copy}</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {user.items.map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl bg-[#FFFDF6]/70 p-3 text-sm font-bold text-[#102A24]">
                      <Check className="h-4 w-4 text-[#4F6F52]" aria-hidden="true" />
                      {item}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
