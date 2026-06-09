/*
 * Flow: Provides a typed module for the Carver AI app.
 * 1. Define local data, helpers, or UI.
 * 2. Export the public function/component/types.
 * 3. Support the surrounding feature with focused logic.
 */

export const features = [
  {
    title: "Photo / Floorplan Redesign",
    description:
      "Upload ảnh sân, mặt bằng hoặc sketch tay để tạo concept sân vườn theo phong cách và ngân sách.",
    tag: "Start from your space",
  },
  {
    title: "AI Concept Generator",
    description:
      "Tạo nhiều phương án sân vườn từ cùng một ảnh hiện trạng để so sánh và chọn hướng phù hợp.",
    tag: "Generate ideas",
  },
  {
    title: "Style Picker",
    description:
      "Chọn nhanh Tropical Modern, Vietnamese Courtyard, Japanese Koi Garden, Minimal Garden hoặc Non Bộ Tam Sơn Nhị Hà.",
    tag: "Choose your mood",
  },
  {
    title: "Budget Mode",
    description:
      "Định hướng concept theo mức ngân sách tiết kiệm, tiêu chuẩn, cao cấp hoặc luxury.",
    tag: "Design with budget",
  },
  {
    title: "Non Bộ & Waterfall Composer",
    description:
      "Tạo ý tưởng hòn non bộ, thác nước, đá tai mèo, đá cổ thạch và hồ Koi theo gu Việt Nam - Đông Á.",
    tag: "Vietnamese DNA",
  },
  {
    title: "Koi Pond Planner",
    description:
      "Gợi ý concept hồ Koi, vị trí thác, cây xanh, điểm ngắm cảnh và logic tổng thể của không gian nước.",
    tag: "Koi & water feature",
  },
  {
    title: "Vietnamese Landscape Library",
    description:
      "Thư viện cây, đá, hồ Koi, non bộ, sân vườn nhà phố, biệt thự và tropical garden phù hợp Việt Nam - Đông Nam Á.",
    tag: "Local landscape data",
  },
  {
    title: "Reality Check",
    description:
      "Kiểm tra sơ bộ concept theo ngân sách, khí hậu, bảo trì, thoát nước, lọc hồ và khả năng thi công.",
    tag: "Beyond pretty images",
  },
  {
    title: "Garden Fit Score",
    description:
      "Chấm điểm độ phù hợp của concept theo kiến trúc nhà, ngân sách, khí hậu, mức bảo trì và khả thi thi công.",
    tag: "Fit before build",
  },
  {
    title: "Create Brief for Expert",
    description:
      "Tự động tạo brief từ ảnh, phong cách yêu thích, ngân sách, mong muốn và concept đã chọn để gửi chuyên gia.",
    tag: "From idea to expert",
  },
  {
    title: "Proposal Preview",
    description:
      "Biến concept thành bản trình bày gồm mô tả ý tưởng, vật liệu đề xuất, ngân sách tham khảo và Reality Check.",
    tag: "Present your concept",
  },
] as const;
