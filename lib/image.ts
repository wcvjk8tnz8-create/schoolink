/**
 * 上传前把图片缩小、居中裁成正方形。
 * 头像只需要 256×256，存原图既浪费 R2 又会把弹窗撑爆（见 /admin 群资料那张）。
 * 纯浏览器 canvas，零依赖；保留 EXIF 方向（用 <img> 解码时浏览器会自动转正）。
 */

export interface ShrinkOptions {
  size?: number;
  square?: boolean;
  quality?: number;
  maxBytes?: number;
}

export async function shrinkImage(file: File, opts: ShrinkOptions = {}): Promise<File> {
  const size = opts.size ?? 256;
  const square = opts.square !== false;
  const quality = opts.quality ?? 0.88;

  // SVG 不进 canvas（也避免外部引用），直接拒绝，让上层提示
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    throw new Error("不支援 SVG 頭像 / SVG avatars are not supported");
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("無法讀取圖片 / Cannot decode image"));
      el.src = url;
    });
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) throw new Error("圖片尺寸無效 / Invalid image size");

    const side = square ? Math.min(sw, sh) : Math.max(sw, sh);
    const sx = (sw - side) / 2;
    const sy = (sh - side) / 2;
    const scale = Math.min(1, size / side); // 永不放大
    const w = Math.max(1, Math.round(side * scale));
    const h = square ? w : Math.max(1, Math.round(sh * Math.min(1, size / Math.max(sw, sh))));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // 白底：PNG 透明区转成 JPEG 时不会变黑
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, side, square ? side : sh, 0, 0, w, square ? w : h);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("圖片壓縮失敗 / Encode failed"))),
        "image/jpeg", quality,
      );
    });
    if (blob.size > (opts.maxBytes ?? 2 * 1024 * 1024)) {
      // 再压一档，仍太大就交给上层 413 处理
      const smaller = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b || blob), "image/jpeg", 0.72));
      return new File([smaller], rename(file.name, "jpg"), { type: "image/jpeg" });
    }
    return new File([blob], rename(file.name, "jpg"), { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 头像专用：256×256 正方形 */
export const shrinkAvatar = (file: File) => shrinkImage(file, { size: 256, square: true, quality: 0.9 });

function rename(name: string, ext: string): string {
  const base = (name || "image").replace(/\.[^.]+$/, "").replace(/[^\w\u4e00-\u9fa5-]/g, "_").slice(0, 40);
  return `${base}-${Date.now()}.${ext}`;
}
