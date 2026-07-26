"use client";

export type CanvasLanguage = "en" | "vi";

export const DEFAULT_CANVAS_LANGUAGE: CanvasLanguage = "vi";

const LABEL_TRANSLATIONS: Record<string, { en: string; vi: string }> = {
  // ── Library UI ──────────────────────────────────────────────────────────
  Library: { en: "Library", vi: "Thư viện" },
  "Project assets": { en: "Project assets", vi: "Tài nguyên dự án" },
  "Build references for prompt-driven image generation.": {
    en: "Build references for prompt-driven image generation.",
    vi: "Tạo bộ ảnh tham chiếu cho quy trình sinh ảnh bằng prompt.",
  },
  "Close library": { en: "Close library", vi: "Đóng thư viện" },
  "Remove preset": { en: "Remove preset", vi: "Xóa preset" },

  // ── Preset section headings ──────────────────────────────────────────────
  Environment: { en: "Environment", vi: "Môi trường" },
  Material: { en: "Material", vi: "Vật liệu" },
  "Garden Styles": { en: "Garden Styles", vi: "Phong cách vườn" },
  Plants: { en: "Plants", vi: "Cây trồng" },
  "Water Features": { en: "Water Features", vi: "Hồ & Nước" },
  Hardscape: { en: "Hardscape", vi: "Công trình cứng" },
  "Rocks & Terrain": { en: "Rocks & Terrain", vi: "Đá & Địa hình" },
  Decor: { en: "Decor", vi: "Trang trí" },
  Lighting: { en: "Lighting", vi: "Ánh sáng" },
  "Planting Zones": { en: "Planting Zones", vi: "Khu vực trồng cây" },

  // ── Environment slots ────────────────────────────────────────────────────
  Season: { en: "Season", vi: "Mùa" },
  Atmosphere: { en: "Atmosphere", vi: "Bầu không khí" },

  // ── Material slots ───────────────────────────────────────────────────────
  "Wooden House Exterior": { en: "Wooden House Exterior", vi: "Ngoại thất nhà gỗ" },
  "Pathway Stones": { en: "Pathway Stones", vi: "Đá lối đi" },
  "Rock Formations": { en: "Rock Formations", vi: "Cụm đá cảnh" },
  "Water Surface": { en: "Water Surface", vi: "Bề mặt nước" },
  "Wooden Fence": { en: "Wooden Fence", vi: "Hàng rào gỗ" },
  "Wooden Gazebo": { en: "Wooden Gazebo", vi: "Chòi gỗ" },
  "Gazebo Roof": { en: "Gazebo Roof", vi: "Mái chòi" },
  "House Roof": { en: "House Roof", vi: "Mái nhà" },
  "Carport Canopy": { en: "Carport Canopy", vi: "Mái che carport" },
  Bridge: { en: "Bridge", vi: "Cầu" },
  Car: { en: "Car", vi: "Xe" },
  "Brick Wall": { en: "Brick Wall", vi: "Tường gạch" },

  // ── Garden Styles slots ──────────────────────────────────────────────────
  "Japanese Garden": { en: "Japanese Garden", vi: "Vườn Nhật Bản" },
  "Chinese Garden": { en: "Chinese Garden", vi: "Vườn Trung Hoa" },
  "Korean Garden": { en: "Korean Garden", vi: "Vườn Hàn Quốc" },
  "Zen Garden": { en: "Zen Garden", vi: "Vườn thiền" },
  "Tropical Garden": { en: "Tropical Garden", vi: "Vườn nhiệt đới" },
  "Balinese Garden": { en: "Balinese Garden", vi: "Vườn Bali" },
  "Thai Garden": { en: "Thai Garden", vi: "Vườn Thái Lan" },
  "Mediterranean Garden": { en: "Mediterranean Garden", vi: "Vườn Địa Trung Hải" },
  "English Cottage Garden": { en: "English Cottage Garden", vi: "Vườn nhà quê Anh" },
  "French Formal Garden": { en: "French Formal Garden", vi: "Vườn kiểu Pháp" },
  "Italian Renaissance Garden": { en: "Italian Renaissance Garden", vi: "Vườn Phục Hưng Ý" },
  "Islamic / Persian Garden": { en: "Islamic / Persian Garden", vi: "Vườn Hồi giáo / Ba Tư" },
  "Modern Minimal Garden": { en: "Modern Minimal Garden", vi: "Vườn tối giản hiện đại" },
  "Scandinavian Garden": { en: "Scandinavian Garden", vi: "Vườn Bắc Âu" },
  "Desert Garden": { en: "Desert Garden", vi: "Vườn sa mạc" },
  "Woodland Garden": { en: "Woodland Garden", vi: "Vườn rừng" },
  "Rainforest Garden": { en: "Rainforest Garden", vi: "Vườn rừng nhiệt đới" },
  "Alpine Garden": { en: "Alpine Garden", vi: "Vườn núi cao" },
  "Prairie / Meadow Garden": { en: "Prairie / Meadow Garden", vi: "Vườn thảo nguyên / đồng cỏ" },
  "Coastal Garden": { en: "Coastal Garden", vi: "Vườn ven biển" },

  // ── Plants group labels ──────────────────────────────────────────────────
  Trees: { en: "Trees", vi: "Cây thân gỗ" },
  Shrubs: { en: "Shrubs", vi: "Cây bụi" },
  Flowers: { en: "Flowers", vi: "Hoa" },
  Grasses: { en: "Grasses", vi: "Cỏ" },
  "Other Plants": { en: "Other Plants", vi: "Cây khác" },

  // ── Plants > Trees ───────────────────────────────────────────────────────
  "Ornamental Trees": { en: "Ornamental Trees", vi: "Cây cảnh thân gỗ" },
  "Flowering Trees": { en: "Flowering Trees", vi: "Cây hoa thân gỗ" },
  "Shade Trees": { en: "Shade Trees", vi: "Cây bóng mát" },
  "Evergreen Trees": { en: "Evergreen Trees", vi: "Cây thường xanh" },
  "Deciduous Trees": { en: "Deciduous Trees", vi: "Cây rụng lá" },
  "Tropical Trees": { en: "Tropical Trees", vi: "Cây nhiệt đới" },
  "Conifer Trees": { en: "Conifer Trees", vi: "Cây thông / hạt trần" },
  "Fruit Trees": { en: "Fruit Trees", vi: "Cây ăn quả" },

  // ── Plants > Shrubs ──────────────────────────────────────────────────────
  "Flowering Shrubs": { en: "Flowering Shrubs", vi: "Cây bụi hoa" },
  "Evergreen Shrubs": { en: "Evergreen Shrubs", vi: "Cây bụi thường xanh" },
  "Hedge Shrubs": { en: "Hedge Shrubs", vi: "Cây hàng rào sống" },
  "Ornamental Shrubs": { en: "Ornamental Shrubs", vi: "Cây bụi cảnh" },

  // ── Plants > Flowers ─────────────────────────────────────────────────────
  "Annual Flowers": { en: "Annual Flowers", vi: "Hoa một năm" },
  "Perennial Flowers": { en: "Perennial Flowers", vi: "Hoa lâu năm" },
  "Bulb Flowers": { en: "Bulb Flowers", vi: "Hoa củ" },
  Wildflowers: { en: "Wildflowers", vi: "Hoa dại" },
  "Border Flowers": { en: "Border Flowers", vi: "Hoa viền đường" },

  // ── Plants > Grasses ─────────────────────────────────────────────────────
  "Ornamental Grasses": { en: "Ornamental Grasses", vi: "Cỏ cảnh" },
  "Tall Grasses": { en: "Tall Grasses", vi: "Cỏ cao" },
  "Ground Grasses": { en: "Ground Grasses", vi: "Cỏ thảm" },
  "Meadow Grasses": { en: "Meadow Grasses", vi: "Cỏ đồng cỏ" },

  // ── Plants > Other Plants ────────────────────────────────────────────────
  Bamboo: { en: "Bamboo", vi: "Tre / trúc" },
  "Palm & Tropical Plants": { en: "Palm & Tropical Plants", vi: "Cau & cây nhiệt đới" },
  "Cactus & Succulents": { en: "Cactus & Succulents", vi: "Xương rồng & cây mọng nước" },
  Ferns: { en: "Ferns", vi: "Dương xỉ" },
  "Vines & Climbers": { en: "Vines & Climbers", vi: "Dây leo" },
  "Aquatic Plants": { en: "Aquatic Plants", vi: "Cây thủy sinh" },
  "Ground Covers": { en: "Ground Covers", vi: "Cây phủ nền" },
  Topiary: { en: "Topiary", vi: "Cây cắt tỉa nghệ thuật" },
  Bonsai: { en: "Bonsai", vi: "Bonsai / cây cảnh" },
  "Seasonal Plants": { en: "Seasonal Plants", vi: "Cây theo mùa" },

  // ── Water Features slots ─────────────────────────────────────────────────
  "Koi Ponds": { en: "Koi Ponds", vi: "Hồ koi" },
  "Natural Ponds": { en: "Natural Ponds", vi: "Hồ tự nhiên" },
  Waterfalls: { en: "Waterfalls", vi: "Thác nước" },
  Streams: { en: "Streams", vi: "Suối / dòng chảy" },
  Fountains: { en: "Fountains", vi: "Đài phun nước" },
  "Reflecting Pools": { en: "Reflecting Pools", vi: "Hồ phản chiếu" },
  "Bird Baths": { en: "Bird Baths", vi: "Bồn tắm chim" },
  "Water Bowls": { en: "Water Bowls", vi: "Bát nước cảnh" },
  "Rain Chains": { en: "Rain Chains", vi: "Xích mưa" },

  // ── Hardscape slots ──────────────────────────────────────────────────────
  "Paths & Walkways": { en: "Paths & Walkways", vi: "Lối đi & đường đi bộ" },
  Bridges: { en: "Bridges", vi: "Cầu" },
  Pavilions: { en: "Pavilions", vi: "Chòi / nhà mái" },
  Pergolas: { en: "Pergolas", vi: "Giàn pergola" },
  Gazebos: { en: "Gazebos", vi: "Chòi vườn" },
  "Garden Walls": { en: "Garden Walls", vi: "Tường vườn" },
  Fences: { en: "Fences", vi: "Hàng rào" },
  Gates: { en: "Gates", vi: "Cổng" },
  Stairs: { en: "Stairs", vi: "Bậc thang" },
  Decks: { en: "Decks", vi: "Sàn ngoài trời" },
  Patios: { en: "Patios", vi: "Sân lát" },
  "Retaining Walls": { en: "Retaining Walls", vi: "Tường chắn đất" },

  // ── Rocks & Terrain slots ────────────────────────────────────────────────
  "Garden Stones": { en: "Garden Stones", vi: "Đá vườn" },
  "Zen Stones": { en: "Zen Stones", vi: "Đá thiền" },
  Boulders: { en: "Boulders", vi: "Đá tảng" },
  Gravel: { en: "Gravel", vi: "Sỏi" },
  Pebbles: { en: "Pebbles", vi: "Đá cuội" },
  "Moss Rocks": { en: "Moss Rocks", vi: "Đá phủ rêu" },
  "Rock Gardens": { en: "Rock Gardens", vi: "Vườn đá" },
  "Sand Areas": { en: "Sand Areas", vi: "Khu vực cát" },
  "Hills / Mounds": { en: "Hills / Mounds", vi: "Gò đồi" },
  "Soil Beds": { en: "Soil Beds", vi: "Luống đất" },

  // ── Decor slots ──────────────────────────────────────────────────────────
  Lanterns: { en: "Lanterns", vi: "Đèn lồng" },
  Statues: { en: "Statues", vi: "Tượng" },
  "Pots & Planters": { en: "Pots & Planters", vi: "Chậu & bồn cây" },
  Benches: { en: "Benches", vi: "Ghế băng" },
  "Outdoor Tables": { en: "Outdoor Tables", vi: "Bàn ngoài trời" },
  Sculptures: { en: "Sculptures", vi: "Điêu khắc" },
  "Bird Houses": { en: "Bird Houses", vi: "Nhà chim" },
  "Wind Chimes": { en: "Wind Chimes", vi: "Chuông gió" },
  "Fire Pits": { en: "Fire Pits", vi: "Hố lửa" },
  "Garden Ornaments": { en: "Garden Ornaments", vi: "Đồ trang trí vườn" },

  // ── Lighting slots ───────────────────────────────────────────────────────
  "Path Lights": { en: "Path Lights", vi: "Đèn đường đi" },
  "Spot Lights": { en: "Spot Lights", vi: "Đèn rọi" },
  "Lantern Lights": { en: "Lantern Lights", vi: "Đèn lồng" },
  "Wall Lights": { en: "Wall Lights", vi: "Đèn tường" },
  "String Lights": { en: "String Lights", vi: "Đèn dây" },
  "Underwater Lights": { en: "Underwater Lights", vi: "Đèn dưới nước" },
  "Solar Lights": { en: "Solar Lights", vi: "Đèn năng lượng mặt trời" },

  // ── Planting Zones slots ─────────────────────────────────────────────────
  "Flower Beds": { en: "Flower Beds", vi: "Luống hoa" },
  "Shrub Borders": { en: "Shrub Borders", vi: "Viền cây bụi" },
  "Tree Clusters": { en: "Tree Clusters", vi: "Cụm cây" },
  "Tropical Corners": { en: "Tropical Corners", vi: "Góc nhiệt đới" },
  "Rock Planting": { en: "Rock Planting", vi: "Trồng cây trên đá" },
  "Pond Planting": { en: "Pond Planting", vi: "Trồng cây quanh hồ" },
  "Entrance Planting": { en: "Entrance Planting", vi: "Trồng cây lối vào" },
  "Fence Planting": { en: "Fence Planting", vi: "Trồng cây hàng rào" },
  "Courtyard Planting": { en: "Courtyard Planting", vi: "Trồng cây sân trong" },

  // ── Flyout tabs ──────────────────────────────────────────────────────────
  Presets: { en: "Presets", vi: "Preset" },
  Custom: { en: "Custom", vi: "Tùy chỉnh" },
  Pinterest: { en: "Pinterest", vi: "Pinterest" },
  "Custom assets": { en: "Custom assets", vi: "Tài nguyên tùy chỉnh" },
  "Pinterest integration": { en: "Pinterest integration", vi: "Kết nối Pinterest" },
  "Upload your own reference images for this slot.": {
    en: "Upload your own reference images for this slot.",
    vi: "Tải ảnh tham chiếu của bạn cho ô preset này.",
  },
  "Connect your Pinterest board to pull reference images.": {
    en: "Connect your Pinterest board to pull reference images.",
    vi: "Kết nối bảng Pinterest để lấy ảnh tham chiếu.",
  },
  "Upload image": { en: "Upload image", vi: "Tải ảnh lên" },
  "Connect Pinterest": { en: "Connect Pinterest", vi: "Kết nối Pinterest" },

  // ── Theme / Dock ─────────────────────────────────────────────────────────
  Theme: { en: "Theme", vi: "Giao diện" },
  "Close theme picker": { en: "Close theme picker", vi: "Đóng bảng chọn giao diện" },
  "Pick canvas theme color": { en: "Pick canvas theme color", vi: "Chọn màu giao diện canvas" },
  "Adjust theme hue": { en: "Adjust theme hue", vi: "Điều chỉnh sắc độ giao diện" },
  "Theme hex color": { en: "Theme hex color", vi: "Mã màu hex giao diện" },
  "Set theme": { en: "Set theme", vi: "Đặt giao diện" },
  "Mini map": { en: "Mini map", vi: "Bản đồ nhỏ" },
  "Reset zoom": { en: "Reset zoom", vi: "Đặt lại zoom" },
  "Open pen settings": { en: "Open pen settings", vi: "Mở cài đặt bút" },
  Select: { en: "Select", vi: "Chọn" },
  Mark: { en: "Mark", vi: "Đánh dấu" },
  Pen: { en: "Pen", vi: "Bút" },
  Eraser: { en: "Eraser", vi: "Tẩy" },
  Text: { en: "Text", vi: "Chữ" },
  Object: { en: "Object", vi: "Đối tượng" },
  Generate: { en: "Generate", vi: "Tạo ảnh" },

  // ── Menu / Project ───────────────────────────────────────────────────────
  Home: { en: "Home", vi: "Trang chủ" },
  "New Project": { en: "New Project", vi: "Dự án mới" },
  "Clear Canvas": { en: "Clear Canvas", vi: "Xóa canvas" },
  "Import Images": { en: "Import Images", vi: "Nhập ảnh" },
  Undo: { en: "Undo", vi: "Hoàn tác" },
  Redo: { en: "Redo", vi: "Làm lại" },
  "Duplicate Selection": { en: "Duplicate Selection", vi: "Nhân bản lựa chọn" },
  "Zoom to Fit": { en: "Zoom to Fit", vi: "Vừa khung nhìn" },
  "Zoom In": { en: "Zoom In", vi: "Phóng to" },
  "Zoom Out": { en: "Zoom Out", vi: "Thu nhỏ" },
  "Project mode": { en: "Project mode", vi: "Chế độ dự án" },
  Snapshot: { en: "Snapshot", vi: "Ảnh chụp" },
  Compare: { en: "Compare", vi: "So sánh" },
  Export: { en: "Export", vi: "Xuất" },
  "Canvas Session": { en: "Canvas Session", vi: "Phiên canvas" },
  "Auto Saved": { en: "Auto Saved", vi: "Đã tự lưu" },
  "Open menu": { en: "Open menu", vi: "Mở menu" },
  "Close menu": { en: "Close menu", vi: "Đóng menu" },
  "Open project menu": { en: "Open project menu", vi: "Mở menu dự án" },
  "Close project menu": { en: "Close project menu", vi: "Đóng menu dự án" },
  "Project name": { en: "Project name", vi: "Tên dự án" },
  "Edit project name": { en: "Edit project name", vi: "Chỉnh tên dự án" },
  "Time credits": { en: "Time credits", vi: "Credits thời gian" },
  "Language: English": { en: "Language: English", vi: "Ngôn ngữ: Tiếng Anh" },
  "Language: Vietnamese": { en: "Language: Vietnamese", vi: "Ngôn ngữ: Tiếng Việt" },
  "Switch to Vietnamese": { en: "Switch to Vietnamese", vi: "Chuyển sang tiếng Việt" },
  "Switch to English": { en: "Switch to English", vi: "Switch to English" },

  // ── Toast messages ───────────────────────────────────────────────────────
  "New project created": { en: "New project created", vi: "Đã tạo dự án mới" },
  "Project cleared": { en: "Project cleared", vi: "Đã xóa nội dung dự án" },
  "Nothing to undo": { en: "Nothing to undo", vi: "Không có gì để hoàn tác" },
  "Reverted latest canvas deletion": { en: "Reverted latest canvas deletion", vi: "Đã khôi phục lần xóa canvas gần nhất" },
  "Snapshot timeline is the next UI pass": { en: "Snapshot timeline is the next UI pass", vi: "Timeline snapshot sẽ được làm ở bước UI tiếp theo" },
  "Compare view opens when multiple outputs exist": { en: "Compare view opens when multiple outputs exist", vi: "Chế độ so sánh sẽ mở khi có nhiều ảnh kết quả" },
  "Export flow coming next": { en: "Export flow coming next", vi: "Luồng xuất file sẽ được triển khai tiếp theo" },
  "Project mode toast": { en: "Project mode", vi: "Chế độ dự án" },
  "Compare outputs is the next refinement step": { en: "Compare outputs is the next refinement step", vi: "So sánh output là bước tinh chỉnh tiếp theo" },
  "30 credits": { en: "30 credits", vi: "30 credits" },
  Untitled: { en: "Untitled", vi: "Chưa đặt tên" },
};

export function translateCanvasLabel(label: string, language: CanvasLanguage) {
  return LABEL_TRANSLATIONS[label]?.[language] ?? label;
}

export function getCanvasText(language: CanvasLanguage) {
  return {
    language,
    common: {
      library: translateCanvasLabel("Library", language),
      projectAssets: translateCanvasLabel("Project assets", language),
      libraryDescription: translateCanvasLabel("Build references for prompt-driven image generation.", language),
      closeLibrary: translateCanvasLabel("Close library", language),
      removePreset: translateCanvasLabel("Remove preset", language),
      untitled: translateCanvasLabel("Untitled", language),
    },
    flyout: {
      presets: translateCanvasLabel("Presets", language),
      custom: translateCanvasLabel("Custom", language),
      pinterest: translateCanvasLabel("Pinterest", language),
      customAssets: translateCanvasLabel("Custom assets", language),
      pinterestIntegration: translateCanvasLabel("Pinterest integration", language),
      customDescription: translateCanvasLabel("Upload your own reference images for this slot.", language),
      pinterestDescription: translateCanvasLabel("Connect your Pinterest board to pull reference images.", language),
      uploadImage: translateCanvasLabel("Upload image", language),
      connectPinterest: translateCanvasLabel("Connect Pinterest", language),
    },
    dock: {
      theme: translateCanvasLabel("Theme", language),
      miniMap: translateCanvasLabel("Mini map", language),
      resetZoom: translateCanvasLabel("Reset zoom", language),
      openPenSettings: translateCanvasLabel("Open pen settings", language),
      closeThemePicker: translateCanvasLabel("Close theme picker", language),
      pickCanvasThemeColor: translateCanvasLabel("Pick canvas theme color", language),
      adjustThemeHue: translateCanvasLabel("Adjust theme hue", language),
      themeHexColor: translateCanvasLabel("Theme hex color", language),
      setTheme: translateCanvasLabel("Set theme", language),
      toolLabels: {
        select: translateCanvasLabel("Select", language),
        mark: translateCanvasLabel("Mark", language),
        pen: translateCanvasLabel("Pen", language),
        eraser: translateCanvasLabel("Eraser", language),
        text: translateCanvasLabel("Text", language),
        object: translateCanvasLabel("Object", language),
        generate: translateCanvasLabel("Generate", language),
      },
    },
    menu: {
      home: translateCanvasLabel("Home", language),
      newProject: translateCanvasLabel("New Project", language),
      clearCanvas: translateCanvasLabel("Clear Canvas", language),
      importImages: translateCanvasLabel("Import Images", language),
      undo: translateCanvasLabel("Undo", language),
      redo: translateCanvasLabel("Redo", language),
      duplicateSelection: translateCanvasLabel("Duplicate Selection", language),
      zoomToFit: translateCanvasLabel("Zoom to Fit", language),
      zoomIn: translateCanvasLabel("Zoom In", language),
      zoomOut: translateCanvasLabel("Zoom Out", language),
      projectMode: translateCanvasLabel("Project mode", language),
      snapshot: translateCanvasLabel("Snapshot", language),
      compare: translateCanvasLabel("Compare", language),
      export: translateCanvasLabel("Export", language),
      canvasSession: translateCanvasLabel("Canvas Session", language),
      autoSaved: translateCanvasLabel("Auto Saved", language),
      openMenu: translateCanvasLabel("Open menu", language),
      closeMenu: translateCanvasLabel("Close menu", language),
      openProjectMenu: translateCanvasLabel("Open project menu", language),
      closeProjectMenu: translateCanvasLabel("Close project menu", language),
      projectName: translateCanvasLabel("Project name", language),
      editProjectName: translateCanvasLabel("Edit project name", language),
      timeCredits: translateCanvasLabel("Time credits", language),
      languageLabel: language === "vi"
        ? translateCanvasLabel("Language: Vietnamese", language)
        : translateCanvasLabel("Language: English", language),
      switchLanguage: language === "vi"
        ? translateCanvasLabel("Switch to English", language)
        : translateCanvasLabel("Switch to Vietnamese", language),
    },
    toast: {
      newProjectCreated: translateCanvasLabel("New project created", language),
      projectCleared: translateCanvasLabel("Project cleared", language),
      nothingToUndo: translateCanvasLabel("Nothing to undo", language),
      revertedLatestDeletion: translateCanvasLabel("Reverted latest canvas deletion", language),
      snapshotNext: translateCanvasLabel("Snapshot timeline is the next UI pass", language),
      compareNext: translateCanvasLabel("Compare view opens when multiple outputs exist", language),
      exportNext: translateCanvasLabel("Export flow coming next", language),
      projectMode: translateCanvasLabel("Project mode toast", language),
      compareOutputsNext: translateCanvasLabel("Compare outputs is the next refinement step", language),
      credits: translateCanvasLabel("30 credits", language),
    },
  };
}
